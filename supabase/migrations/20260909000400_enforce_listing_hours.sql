-- Enforce the host's stated available hours (spec §7.2).
--
-- `listings.available_from` and `available_until` were captured on the listing form, stored, and
-- shown to seekers — and read by nothing. Verified before this migration: a 02:00–04:00 booking
-- was accepted on a listing whose hours are 07:00–23:30.
--
-- The hours are not decoration. A host sets 07:00–23:30 because the society gate is locked
-- overnight; without this, a driver arrives at 2am holding a pass this platform issued and a
-- signature it signed, and cannot get in. That is the access guarantee in §7.1 failing in the
-- one direction the seeker cannot recover from.
--
-- Times are stored as `time without time zone` and compared in the pilot city's local zone
-- (PLATFORM.timezone, Asia/Kolkata). A booking is a timestamptz, so it is converted before
-- comparison — comparing a UTC instant against a wall-clock time would be five and a half hours
-- wrong here, which is exactly enough to accept an overnight booking as a morning one.

create or replace function public.booking_within_listing_hours(
  p_listing_id uuid,
  p_start timestamptz,
  p_end timestamptz
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_from time;
  v_until time;
  v_local_start timestamp;
  v_local_end timestamp;
  v_zone text := 'Asia/Kolkata';
begin
  select available_from, available_until into v_from, v_until
    from public.listings where id = p_listing_id;

  -- Either bound absent means the space is open around the clock.
  if v_from is null or v_until is null then
    return true;
  end if;

  v_local_start := p_start at time zone v_zone;
  v_local_end := p_end at time zone v_zone;

  if v_until > v_from then
    -- A same-day window, the ordinary case. The booking must start and finish inside it on the
    -- same calendar day: a stay running past midnight leaves the window by definition.
    return date_trunc('day', v_local_start) = date_trunc('day', v_local_end - interval '1 microsecond')
       and v_local_start::time >= v_from
       and v_local_end::time <= v_until;
  end if;

  -- An overnight window (22:00–06:00, say). Every hour from `from` to midnight and from midnight
  -- to `until` is open, so the test is that no moment of the booking falls in the closed middle.
  return not exists (
    select 1
    where (v_local_start::time < v_from and v_local_start::time > v_until)
       or (v_local_end::time < v_from and v_local_end::time > v_until)
       -- Longer than a full day, so it must cross the closed period whatever the clock says.
       or (v_local_end - v_local_start) >= interval '24 hours'
  );
end;
$fn$;

comment on function public.booking_within_listing_hours is
  'Spec 7.2: a booking must fall inside the hours the host published for the listing.';

-- ---------------------------------------------------------------------------
-- Wire it into the booking guard
-- ---------------------------------------------------------------------------

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

  if new.status not in ('pending_payment', 'confirmed', 'completed') then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.listing_id = new.listing_id
     and old.start_time = new.start_time
     and old.end_time = new.end_time
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

  -- The host's published opening hours.
  if not public.booking_within_listing_hours(new.listing_id, new.start_time, new.end_time) then
    raise exception 'That time is outside the hours this space is available'
      using errcode = 'check_violation';
  end if;

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
     -- A10: a lapsed hold no longer occupies the slot, even before the sweep runs.
     and (b.status <> 'pending_payment' or b.hold_expires_at > now())
     and b.time_range && v_range;

  if v_overlapping >= v_listing.capacity then
    raise exception 'This spot is fully booked for the selected time (capacity %)',
      v_listing.capacity
      using errcode = 'check_violation';
  end if;

  return new;
end;
$fn$;
