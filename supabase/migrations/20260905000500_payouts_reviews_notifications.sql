-- Payouts, reviews, the notification log, and the admin audit trail.
-- Spec sections 7.1, 7.2, 7.3, 9.9, 10.

-- ---------------------------------------------------------------------------
-- payouts (spec section 10, 7.3)
-- ---------------------------------------------------------------------------
-- Batched per Host per cycle and triggered by an Admin; automated split payments are
-- deferred to Phase 3 (spec 4.2, 9.7).

create table public.payouts (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.users (id) on delete restrict,
  period_start timestamptz not null,
  period_end timestamptz not null,
  amount bigint not null check (amount > 0),
  currency text not null default 'INR' check (currency = 'INR'),
  status public.payout_status not null default 'pending',

  provider text not null default 'razorpay',
  provider_payout_id text unique,
  provider_payload jsonb,

  initiated_by uuid references public.users (id),
  processed_at timestamptz,
  failure_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint payouts_period_ordered check (period_end > period_start)
);

create index payouts_host_idx on public.payouts (host_id, period_end desc);
create index payouts_status_idx on public.payouts (status);

create trigger payouts_set_updated_at
  before update on public.payouts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- payout_bookings
-- ---------------------------------------------------------------------------
-- The line items of a payout. The unique constraint on booking_id is what satisfies spec
-- 7.3's acceptance criterion - "a payout cannot be triggered twice for the same booking" -
-- at the database level rather than in admin-panel logic.

create table public.payout_bookings (
  payout_id uuid not null references public.payouts (id) on delete cascade,
  booking_id uuid not null unique references public.bookings (id) on delete restrict,
  amount bigint not null check (amount >= 0),
  primary key (payout_id, booking_id)
);

comment on constraint payout_bookings_booking_id_key on public.payout_bookings is
  'Spec 7.3: a booking can belong to at most one payout, ever.';

create index payout_bookings_payout_idx on public.payout_bookings (payout_id);

-- Keeps the payout header equal to the sum of its line items, so the Earnings screen and the
-- Admin payout screen can never disagree (spec 7.2 acceptance criterion).
create or replace function public.sync_payout_amount()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_payout_id uuid := coalesce(new.payout_id, old.payout_id);
begin
  update public.payouts p
     set amount = coalesce(
           (select sum(amount) from public.payout_bookings where payout_id = v_payout_id), 0)
   where p.id = v_payout_id;
  return coalesce(new, old);
end;
$fn$;

create trigger payout_bookings_sync_amount
  after insert or update or delete on public.payout_bookings
  for each row execute function public.sync_payout_amount();

-- A paid-out booking is settled history; blocking the edit here is cheaper than reconciling
-- a payout against a booking whose amount moved after the money left.
create or replace function public.protect_paid_out_bookings()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if new.host_payout is distinct from old.host_payout
     and exists (
       select 1
         from public.payout_bookings pb
         join public.payouts p on p.id = pb.payout_id
        where pb.booking_id = new.id
          and p.status in ('processing', 'paid')
     ) then
    raise exception 'Booking % has already been paid out and cannot be repriced', new.id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$fn$;

create trigger bookings_protect_paid_out
  before update on public.bookings
  for each row execute function public.protect_paid_out_bookings();

-- Bookings a Host has earned but not yet been paid for. The payout run reads this.
create or replace function public.unpaid_host_earnings(
  p_host_id uuid,
  p_period_start timestamptz,
  p_period_end timestamptz
)
returns table (booking_id uuid, reference text, completed_at timestamptz, amount bigint)
language sql
stable
security definer
set search_path = public
as $fn$
  select b.id, b.reference, b.completed_at, b.host_payout
    from public.bookings b
   where b.host_id = p_host_id
     and b.status = 'completed'
     and b.completed_at >= p_period_start
     and b.completed_at < p_period_end
     and not exists (select 1 from public.payout_bookings pb where pb.booking_id = b.id)
   order by b.completed_at;
$fn$;

-- ---------------------------------------------------------------------------
-- reviews (spec sections 7.1, 10)
-- ---------------------------------------------------------------------------
-- Tied to a completed booking so a review cannot exist without a real transaction.

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  listing_id uuid not null references public.listings (id) on delete cascade,
  created_by uuid not null references public.users (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One review per person per booking; the schema allows the host-to-seeker direction later
  -- without a migration.
  unique (booking_id, created_by)
);

create index reviews_listing_idx on public.reviews (listing_id, created_at desc);

create trigger reviews_set_updated_at
  before update on public.reviews
  for each row execute function public.set_updated_at();

-- Spec 7.1: "the rating prompt appears only after the booking's end time has passed".
create or replace function public.enforce_review_eligibility()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_booking public.bookings%rowtype;
begin
  select * into v_booking from public.bookings where id = new.booking_id;

  if not found then
    raise exception 'Booking % does not exist', new.booking_id
      using errcode = 'foreign_key_violation';
  end if;

  if v_booking.status <> 'completed' then
    raise exception 'Only a completed booking can be reviewed (status: %)', v_booking.status
      using errcode = 'check_violation';
  end if;

  if v_booking.end_time > now() then
    raise exception 'A booking cannot be reviewed before its end time'
      using errcode = 'check_violation';
  end if;

  if new.created_by not in (v_booking.seeker_id, v_booking.host_id) then
    raise exception 'Only the seeker or host on a booking may review it'
      using errcode = 'check_violation';
  end if;

  new.listing_id := v_booking.listing_id;
  return new;
end;
$fn$;

create trigger reviews_enforce_eligibility
  before insert on public.reviews
  for each row execute function public.enforce_review_eligibility();

-- Listing rating rollup, read by search results and the listing detail page.
create view public.listing_ratings as
  select
    l.id as listing_id,
    l.host_id,
    count(r.id)::integer as review_count,
    round(avg(r.rating)::numeric, 2) as average_rating
  from public.listings l
  left join public.reviews r
    on r.listing_id = l.id and r.created_by <> l.host_id
  group by l.id, l.host_id;

comment on view public.listing_ratings is
  'Seeker-to-host ratings only. Spec section 3 tracks average rating as a trust metric.';

-- ---------------------------------------------------------------------------
-- notification_log (spec sections 7.1, 9.9)
-- ---------------------------------------------------------------------------
-- Spec 7.1 requires a confirmation for 100% of successful bookings. Without a log there is
-- no way to evidence that, or to find the ones that failed.

create table public.notification_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users (id) on delete set null,
  booking_id uuid references public.bookings (id) on delete set null,
  channel public.notification_channel not null,
  template text not null,
  destination text not null,
  status public.notification_status not null default 'queued',
  provider_message_id text,
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index notification_log_booking_idx on public.notification_log (booking_id);
create index notification_log_failed_idx on public.notification_log (created_at desc)
  where status = 'failed';

-- ---------------------------------------------------------------------------
-- admin_audit_log
-- ---------------------------------------------------------------------------
-- Approvals, suspensions, payouts, and dispute resolutions all move money or livelihoods.
-- Every one records who did it.

create table public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.users (id) on delete restrict,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb,
  created_at timestamptz not null default now()
);

create index admin_audit_log_entity_idx on public.admin_audit_log (entity_type, entity_id);
create index admin_audit_log_admin_idx on public.admin_audit_log (admin_id, created_at desc);
