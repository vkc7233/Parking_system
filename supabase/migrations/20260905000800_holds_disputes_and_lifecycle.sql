-- Checkout holds, disputes, payout eligibility, and the remaining lifecycle rules.
-- Implements assumptions A10 to A16 (docs/ASSUMPTIONS.md).
--
-- The first section fixes a real defect in the schema as originally written: a
-- pending_payment booking counts against capacity (it must, or two people could pay for the
-- same slot), but nothing ever expired one. Every abandoned checkout permanently removed a
-- slot from the marketplace, and on a capacity-1 listing that meant one abandoned checkout
-- took the listing off the market for good.

-- ---------------------------------------------------------------------------
-- A10 - Unpaid booking hold
-- ---------------------------------------------------------------------------

alter table public.bookings
  add column hold_expires_at timestamptz;

comment on column public.bookings.hold_expires_at is
  'Assumption A10: when an unpaid booking releases its slot. Null once payment is captured.';

create index bookings_expired_holds_idx on public.bookings (hold_expires_at)
  where status = 'pending_payment';

-- 10 minutes, mirroring CHECKOUT.holdMinutes in packages/config. Duplicated deliberately:
-- the database is the last line of defence and cannot import TypeScript.
create or replace function public.set_booking_hold()
returns trigger
language plpgsql
as $fn$
begin
  if new.status = 'pending_payment' then
    new.hold_expires_at := coalesce(new.hold_expires_at, now() + interval '10 minutes');
  else
    -- A confirmed or cancelled booking no longer holds anything provisionally.
    new.hold_expires_at := null;
  end if;
  return new;
end;
$fn$;

create trigger bookings_set_hold
  before insert or update of status on public.bookings
  for each row execute function public.set_booking_hold();

-- Sweeps lapsed holds. Scheduled with pg_cron (see supabase/README.md). The availability
-- checks below do not depend on this having run - they ignore lapsed holds directly - so a
-- late sweep delays cleanup, never correctness.
create or replace function public.expire_unpaid_bookings()
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_count integer;
begin
  with expired as (
    update public.bookings
       set status = 'payment_failed'
     where status = 'pending_payment'
       and hold_expires_at is not null
       and hold_expires_at <= now()
    returning 1
  )
  select count(*) into v_count from expired;

  return v_count;
end;
$fn$;

comment on function public.expire_unpaid_bookings is
  'Assumption A10. Releases slots held by abandoned checkouts.';

-- ---------------------------------------------------------------------------
-- A11 - Disputes
-- ---------------------------------------------------------------------------

create type public.dispute_status as enum ('open', 'resolved_refund', 'resolved_no_action');

create table public.disputes (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete restrict,
  raised_by uuid not null references public.users (id) on delete restrict,
  reason text not null,
  status public.dispute_status not null default 'open',
  resolution_note text,
  resolved_by uuid references public.users (id),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint disputes_resolution_is_complete check (
    (status = 'open' and resolved_by is null and resolved_at is null)
    or (status <> 'open' and resolved_by is not null and resolved_at is not null)
  )
);

comment on table public.disputes is
  'Spec 7.3 dispute management. A booking with an open dispute is never paid out (A11).';

create index disputes_booking_idx on public.disputes (booking_id);
create index disputes_open_idx on public.disputes (created_at) where status = 'open';

-- One open dispute per booking: a second complaint belongs on the existing thread, not as a
-- competing record an Admin has to reconcile.
create unique index disputes_one_open_per_booking_idx
  on public.disputes (booking_id)
  where status = 'open';

create trigger disputes_set_updated_at
  before update on public.disputes
  for each row execute function public.set_updated_at();

alter table public.disputes enable row level security;

create policy disputes_select_own on public.disputes
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.bookings b
       where b.id = booking_id
         and (b.seeker_id = auth.uid() or b.host_id = auth.uid())
    )
  );

-- A Seeker or Host may raise one, within the window; only an Admin can resolve it.
create policy disputes_insert_party on public.disputes
  for insert to authenticated
  with check (
    raised_by = auth.uid()
    and status = 'open'
    and exists (
      select 1 from public.bookings b
       where b.id = booking_id
         and (b.seeker_id = auth.uid() or b.host_id = auth.uid())
         and b.end_time + interval '48 hours' > now()
    )
  );

create policy disputes_admin_all on public.disputes
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- 48 hours, mirroring DISPUTE.windowHoursAfterBookingEnd in packages/config.
alter table public.bookings
  add column payout_eligible_at timestamptz
    generated always as (end_time + interval '48 hours') stored;

comment on column public.bookings.payout_eligible_at is
  'Assumption A11: the Host is not paid until the dispute window has closed, so any refund the '
  'platform might owe is still in the platform account when it owes it.';

create index bookings_payout_eligible_idx on public.bookings (host_id, payout_eligible_at)
  where status = 'completed';

-- ---------------------------------------------------------------------------
-- A11 + A12 - Payout eligibility
-- ---------------------------------------------------------------------------
-- Replaces the Sprint 0 version, which paid out any completed booking immediately.

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
     -- A11: the dispute window has closed...
     and b.payout_eligible_at <= now()
     -- ...and nothing is contested.
     and not exists (
       select 1 from public.disputes d
        where d.booking_id = b.id and d.status = 'open'
     )
     and not exists (
       select 1 from public.payout_bookings pb where pb.booking_id = b.id
     )
   order by b.completed_at;
$fn$;

/*
 * A12 - decides whether a Host's accrued balance is worth transferring.
 *
 * Each payout transfer costs a per-transaction fee, so settling a small balance burns a
 * meaningful fraction of it. Carrying forward is not withholding: the money is still the
 * Host's and shows as pending in Earnings. The age escape hatch means nothing is ever stuck
 * below the threshold indefinitely.
 */
create or replace function public.host_payout_due(p_host_id uuid)
returns table (total_amount bigint, booking_count integer, oldest_completed_at timestamptz, is_due boolean)
language sql
stable
security definer
set search_path = public
as $fn$
  with earnings as (
    select *
      from public.unpaid_host_earnings(p_host_id, '-infinity'::timestamptz, 'infinity'::timestamptz)
  ),
  totals as (
    select
      coalesce(sum(amount), 0)::bigint as total_amount,
      count(*)::integer as booking_count,
      min(completed_at) as oldest_completed_at
    from earnings
  )
  select
    t.total_amount,
    t.booking_count,
    t.oldest_completed_at,
    t.booking_count > 0
      and (
        -- PAYOUT.minimumPayout = 20000 paise, PAYOUT.forceOutAfterDays = 30.
        t.total_amount >= 20000
        or t.oldest_completed_at < now() - interval '30 days'
      ) as is_due
  from totals t;
$fn$;

-- ---------------------------------------------------------------------------
-- A10 - Availability must ignore lapsed holds
-- ---------------------------------------------------------------------------
-- Both the enforcing trigger and the read-only check are replaced together; if they ever
-- disagree, a Seeker is told a slot is free and then refused at payment, or the reverse.

create or replace function public.enforce_booking_availability()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_listing public.listings%rowtype;
  v_overlapping integer;
begin
  if new.status not in ('pending_payment', 'confirmed', 'completed') then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.listing_id = new.listing_id
     and old.time_range = new.time_range
     and old.status in ('pending_payment', 'confirmed', 'completed') then
    return new;
  end if;

  select * into v_listing from public.listings where id = new.listing_id for update;

  if not found then
    raise exception 'Listing % does not exist', new.listing_id
      using errcode = 'foreign_key_violation';
  end if;

  if v_listing.status <> 'live' then
    raise exception 'Listing is not available for booking (status: %)', v_listing.status
      using errcode = 'check_violation';
  end if;

  if exists (
    select 1 from public.availability_blocks b
     where b.listing_id = new.listing_id
       and tstzrange(b.start_time, b.end_time, '[)') && new.time_range
  ) then
    raise exception 'The host has marked this period unavailable'
      using errcode = 'check_violation';
  end if;

  select count(*) into v_overlapping
    from public.bookings b
   where b.listing_id = new.listing_id
     and b.id <> new.id
     and b.status in ('pending_payment', 'confirmed', 'completed')
     -- A10: a lapsed hold no longer occupies the slot, even before the sweep runs.
     and (b.status <> 'pending_payment' or b.hold_expires_at > now())
     and b.time_range && new.time_range;

  if v_overlapping >= v_listing.capacity then
    raise exception 'This spot is fully booked for the selected time (capacity %)',
      v_listing.capacity
      using errcode = 'check_violation';
  end if;

  return new;
end;
$fn$;

create or replace function public.listing_available_slots(
  p_listing_id uuid,
  p_start_time timestamptz,
  p_end_time timestamptz
)
returns integer
language sql
stable
security definer
set search_path = public
as $fn$
  select greatest(
    0,
    l.capacity - (
      select count(*)::integer
        from public.bookings b
       where b.listing_id = l.id
         and b.status in ('pending_payment', 'confirmed', 'completed')
         and (b.status <> 'pending_payment' or b.hold_expires_at > now())
         and b.time_range && tstzrange(p_start_time, p_end_time, '[)')
    )
  )
  from public.listings l
  where l.id = p_listing_id
    and l.status = 'live'
    and not exists (
      select 1 from public.availability_blocks ab
       where ab.listing_id = l.id
         and tstzrange(ab.start_time, ab.end_time, '[)')
             && tstzrange(p_start_time, p_end_time, '[)')
    );
$fn$;

-- ---------------------------------------------------------------------------
-- A13 - Host cancellation consequences
-- ---------------------------------------------------------------------------
-- Instant-book (spec 4.2) removes the Host's chance to decline up front, so cancelling is the
-- only lever they have. Spec 5 names an unavailable spot on arrival as the thing that makes a
-- Seeker leave, so the lever needs a consequence attached.

create or replace function public.enforce_host_cancellation_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_recent_cancellations integer;
begin
  if new.status <> 'cancelled' or new.cancelled_by <> 'host' then
    return new;
  end if;

  -- HOST_CONDUCT.cancellationLimit = 3 over cancellationWindowDays = 90.
  select count(*) into v_recent_cancellations
    from public.bookings b
   where b.host_id = new.host_id
     and b.status = 'cancelled'
     and b.cancelled_by = 'host'
     and b.cancelled_at > now() - interval '90 days';

  if v_recent_cancellations >= 3 then
    update public.listings
       set status = 'paused', paused_at = now()
     where host_id = new.host_id
       and status = 'live';

    insert into public.admin_audit_log (admin_id, action, entity_type, entity_id, details)
    select new.host_id, 'auto_pause_host_listings', 'user', new.host_id,
           jsonb_build_object(
             'reason', 'host cancellation limit reached',
             'cancellations_in_window', v_recent_cancellations,
             'triggering_booking', new.id
           );
  end if;

  return new;
end;
$fn$;

create trigger bookings_host_cancellation_limit
  after update of status on public.bookings
  for each row execute function public.enforce_host_cancellation_limit();

-- ---------------------------------------------------------------------------
-- A14 - Re-approval when a live listing is materially edited
-- ---------------------------------------------------------------------------
-- Named to sort before listings_enforce_lifecycle, so that when this sends a listing back to
-- 'pending' the lifecycle checks still run against the new status.

create or replace function public.check_material_listing_edits()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $fn$
declare
  v_active_bookings integer;
begin
  if old.status <> 'live' then
    return new;
  end if;

  -- Capacity may not drop below what is already booked at any overlapping moment.
  if new.capacity < old.capacity then
    select count(*) into v_active_bookings
      from public.bookings b
     where b.listing_id = new.id
       and b.status in ('pending_payment', 'confirmed')
       and b.end_time > now();

    if v_active_bookings > new.capacity then
      raise exception
        'Cannot reduce capacity to % while % upcoming bookings exist', new.capacity, v_active_bookings
        using errcode = 'check_violation';
    end if;
  end if;

  -- Material fields change what the Seeker is buying, so they go back through approval.
  -- Price and copy do not (assumption A14).
  if new.address_line is distinct from old.address_line
     or not extensions.ST_Equals(new.location::extensions.geometry, old.location::extensions.geometry)
     or new.spot_type is distinct from old.spot_type
     or new.capacity is distinct from old.capacity then
    new.status := 'pending';
    new.approved_at := null;
    new.approved_by := null;
    new.submitted_at := now();
  end if;

  return new;
end;
$fn$;

create trigger listings_check_material_edits
  before update on public.listings
  for each row execute function public.check_material_listing_edits();

-- Photos live in a child table, so editing them never fires the listings trigger above.
create or replace function public.flag_listing_photo_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_listing_id uuid := coalesce(new.listing_id, old.listing_id);
begin
  update public.listings
     set status = 'pending', approved_at = null, approved_by = null, submitted_at = now()
   where id = v_listing_id
     and status = 'live';

  return coalesce(new, old);
end;
$fn$;

create trigger listing_photos_flag_change
  after insert or update or delete on public.listing_photos
  for each row execute function public.flag_listing_photo_change();

-- ---------------------------------------------------------------------------
-- A16 - Review window
-- ---------------------------------------------------------------------------
-- Extends the Sprint 0 eligibility check with an upper bound: long enough to catch people who
-- meant to review and forgot, short enough that the review still reflects the visit.

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

  -- REVIEWS.windowDaysAfterBookingEnd = 14.
  if v_booking.end_time < now() - interval '14 days' then
    raise exception 'The 14-day review window for this booking has closed'
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

-- Admin can hide a review from the dispute screen without deleting the record (A16).
alter table public.reviews
  add column hidden_at timestamptz,
  add column hidden_by uuid references public.users (id);

-- Hidden reviews stop counting toward the listing's public rating.
create or replace view public.listing_ratings as
  select
    l.id as listing_id,
    l.host_id,
    count(r.id)::integer as review_count,
    round(avg(r.rating)::numeric, 2) as average_rating
  from public.listings l
  left join public.reviews r
    on r.listing_id = l.id
   and r.created_by <> l.host_id
   and r.hidden_at is null
  group by l.id, l.host_id;
