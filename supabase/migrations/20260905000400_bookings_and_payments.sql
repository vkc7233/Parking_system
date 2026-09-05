-- Bookings and payments - the core transactional record the platform revolves around
-- (spec section 10). Every money column is integer paise (assumption A9).

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  -- Human-typable fallback for the QR pass (assumption A5). Unique across the platform.
  reference text not null unique,

  listing_id uuid not null references public.listings (id) on delete restrict,
  seeker_id uuid not null references public.users (id) on delete restrict,
  -- Denormalised so a payout run does not have to join through listings for every row, and
  -- so the host attribution survives a listing being reassigned.
  host_id uuid not null references public.users (id) on delete restrict,

  start_time timestamptz not null,
  end_time timestamptz not null,
  -- Generated range drives every overlap test; keeping it generated means it can never drift
  -- from start_time/end_time.
  time_range tstzrange generated always as (tstzrange(start_time, end_time, '[)')) stored,

  -- Price breakdown as quoted by packages/core/src/pricing.ts at booking time. Stored rather
  -- than recomputed so a later change to the fee rate never rewrites history.
  subtotal bigint not null check (subtotal >= 0),
  service_fee bigint not null default 0 check (service_fee >= 0),
  tax bigint not null default 0 check (tax >= 0),
  total bigint not null check (total >= 0),
  host_payout bigint not null check (host_payout >= 0),
  currency text not null default 'INR' check (currency = 'INR'),

  status public.booking_status not null default 'pending_payment',

  cancelled_at timestamptz,
  cancelled_by public.cancelled_by,
  cancellation_reason text,
  refund_amount bigint check (refund_amount is null or refund_amount >= 0),

  -- Set when the Host verifies the access pass on arrival (assumption A5).
  checked_in_at timestamptz,
  completed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint bookings_ordered check (end_time > start_time),
  constraint bookings_total_adds_up check (total = subtotal + service_fee + tax
    or total = subtotal),
  constraint bookings_cancellation_is_complete check (
    (status <> 'cancelled' and cancelled_at is null)
    or (status = 'cancelled' and cancelled_at is not null and cancelled_by is not null)
  ),
  constraint bookings_refund_within_total check (
    refund_amount is null or refund_amount <= total
  )
);

comment on table public.bookings is
  'Spec section 10. Availability and capacity are enforced by trigger, not by the client.';
comment on column public.bookings.host_payout is
  'What the Host is owed on completion. Assumption A1 decides whether the fee is on top.';

create index bookings_listing_time_idx on public.bookings using gist (listing_id, time_range);
create index bookings_seeker_idx on public.bookings (seeker_id, start_time desc);
create index bookings_host_idx on public.bookings (host_id, start_time desc);
create index bookings_status_idx on public.bookings (status);
-- Drives the payout run: completed bookings for a host in a period, not yet paid out.
create index bookings_payout_candidates_idx on public.bookings (host_id, completed_at)
  where status = 'completed';

create trigger bookings_set_updated_at
  before update on public.bookings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Booking reference (assumption A5)
-- ---------------------------------------------------------------------------
-- Mirrors generateBookingReference() in packages/core: 8 chars, no I/O/0/1. Generated in the
-- database so a reference exists even for a row inserted outside the application.

create or replace function public.generate_booking_reference()
returns text
language plpgsql
as $fn$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_result text := '';
  i integer;
begin
  for i in 1..8 loop
    v_result := v_result || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
  end loop;
  return v_result;
end;
$fn$;

create or replace function public.set_booking_reference()
returns trigger
language plpgsql
as $fn$
declare
  v_attempts integer := 0;
begin
  if new.reference is not null and new.reference <> '' then
    return new;
  end if;

  loop
    new.reference := public.generate_booking_reference();
    exit when not exists (select 1 from public.bookings where reference = new.reference);
    v_attempts := v_attempts + 1;
    if v_attempts > 10 then
      raise exception 'Could not allocate a unique booking reference after 10 attempts';
    end if;
  end loop;

  return new;
end;
$fn$;

create trigger bookings_set_reference
  before insert on public.bookings
  for each row execute function public.set_booking_reference();

-- ---------------------------------------------------------------------------
-- Availability and capacity (assumption A4)
-- ---------------------------------------------------------------------------
-- Postgres EXCLUDE constraints can forbid ANY overlap, but cannot express "at most N
-- overlapping", which is what a listing with capacity > 1 needs. So the guarantee is a
-- trigger that takes a row lock on the listing first: two simultaneous checkouts for the
-- same listing serialise on that lock, and the second one sees the first one's row.
--
-- The application performs the same check earlier for a good error message. This is the
-- part that actually prevents an overbooking.

create or replace function public.enforce_booking_availability()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_listing public.listings%rowtype;
  v_overlapping integer;
  -- time_range is a STORED generated column, and Postgres computes those only AFTER
  -- before-row triggers run. NEW.time_range is therefore still NULL here, and every overlap
  -- test against it would evaluate to NULL - silently letting double-bookings through.
  -- Build the range from the source columns instead.
  v_range tstzrange;
begin
  v_range := tstzrange(new.start_time, new.end_time, '[)');

  -- Only slot-occupying states contend for capacity; a cancelled booking frees its slot.
  if new.status not in ('pending_payment', 'confirmed', 'completed') then
    return new;
  end if;

  -- Nothing about the slot changed on this update, so the previous check still holds.
  if tg_op = 'UPDATE'
     and old.listing_id = new.listing_id
     and old.start_time = new.start_time
     and old.end_time = new.end_time
     and old.status in ('pending_payment', 'confirmed', 'completed') then
    return new;
  end if;

  -- The serialisation point. FOR UPDATE blocks a concurrent booking on the same listing.
  select * into v_listing from public.listings where id = new.listing_id for update;

  if not found then
    raise exception 'Listing % does not exist', new.listing_id using errcode = 'foreign_key_violation';
  end if;

  if v_listing.status <> 'live' then
    raise exception 'Listing is not available for booking (status: %)', v_listing.status
      using errcode = 'check_violation';
  end if;

  -- A host-declared unavailable window blocks the slot outright, whatever the capacity.
  if exists (
    select 1 from public.availability_blocks b
     where b.listing_id = new.listing_id
       and tstzrange(b.start_time, b.end_time, '[)') && v_range
  ) then
    raise exception 'The host has marked this period unavailable'
      using errcode = 'check_violation';
  end if;

  select count(*) into v_overlapping
    from public.bookings b
   where b.listing_id = new.listing_id
     and b.id <> new.id
     and b.status in ('pending_payment', 'confirmed', 'completed')
     and b.time_range && v_range;

  if v_overlapping >= v_listing.capacity then
    raise exception 'This spot is fully booked for the selected time (capacity %)',
      v_listing.capacity
      using errcode = 'check_violation';
  end if;

  return new;
end;
$fn$;

create trigger bookings_enforce_availability
  before insert or update on public.bookings
  for each row execute function public.enforce_booking_availability();

-- ---------------------------------------------------------------------------
-- Booking state machine (assumption A9)
-- ---------------------------------------------------------------------------
-- The same transition table as packages/core/src/booking-state.ts. Duplicated deliberately:
-- Supabase exposes the tables directly to clients, so an application-only guard is not one.

create or replace function public.enforce_booking_transition()
returns trigger
language plpgsql
as $fn$
declare
  v_allowed text[];
begin
  if old.status = new.status then
    return new;
  end if;

  v_allowed := case old.status
    when 'pending_payment' then array['confirmed', 'payment_failed', 'cancelled']
    when 'confirmed' then array['completed', 'cancelled']
    else array[]::text[]
  end;

  if not (new.status::text = any (v_allowed)) then
    raise exception 'Illegal booking transition: % -> %', old.status, new.status
      using errcode = 'check_violation';
  end if;

  if new.status = 'completed' then
    new.completed_at := coalesce(new.completed_at, now());
  end if;

  if new.status = 'cancelled' then
    new.cancelled_at := coalesce(new.cancelled_at, now());
  end if;

  return new;
end;
$fn$;

create trigger bookings_enforce_transition
  before update of status on public.bookings
  for each row execute function public.enforce_booking_transition();

-- ---------------------------------------------------------------------------
-- payments (spec section 10)
-- ---------------------------------------------------------------------------
-- One-to-one with a booking for the MVP, kept separate so payment reconciliation against
-- Razorpay never has to touch booking logic.

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings (id) on delete restrict,

  provider text not null default 'razorpay',
  -- The order is created before checkout; the payment id only exists after the Seeker pays.
  provider_order_id text,
  provider_payment_id text unique,
  provider_signature text,

  amount bigint not null check (amount > 0),
  currency text not null default 'INR' check (currency = 'INR'),
  status public.payment_status not null default 'created',
  method text,

  refunded_amount bigint not null default 0 check (refunded_amount >= 0),
  provider_refund_id text,

  captured_at timestamptz,
  failed_at timestamptz,
  failure_reason text,

  -- Raw webhook body, retained for dispute evidence and reconciliation.
  provider_payload jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint payments_refund_within_amount check (refunded_amount <= amount)
);

comment on table public.payments is
  'Spec section 10. Card/UPI details never reach this table - Razorpay Checkout holds them (spec 12).';

create index payments_booking_idx on public.payments (booking_id);
create index payments_status_idx on public.payments (status);
create index payments_provider_order_idx on public.payments (provider_order_id);

create trigger payments_set_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Completion sweep
-- ---------------------------------------------------------------------------
-- Spec 7.1: "a completed booking correctly moves from upcoming to past automatically at end
-- time". Scheduled with pg_cron in the Supabase project (see supabase/README.md).

create or replace function public.complete_elapsed_bookings()
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_count integer;
begin
  with completed as (
    update public.bookings
       set status = 'completed', completed_at = now()
     where status = 'confirmed'
       and end_time <= now()
    returning 1
  )
  select count(*) into v_count from completed;

  return v_count;
end;
$fn$;

comment on function public.complete_elapsed_bookings is
  'Moves elapsed confirmed bookings to completed. Spec 7.1 acceptance criterion.';
