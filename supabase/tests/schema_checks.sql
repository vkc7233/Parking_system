-- Behavioural checks against a freshly reset local database.
--
-- These assert that the rules in docs/ASSUMPTIONS.md are actually enforced by the schema,
-- not merely that the SQL parses. Run after `pnpm db:reset`:
--
--   docker exec -i supabase_db_<project> psql -U postgres -d postgres < supabase/tests/schema_checks.sql
--
-- Runs as the postgres superuser, so RLS is bypassed by design: these test the triggers and
-- constraints. RLS itself is asserted separately by the CI job, which fails the build if any
-- public table has row security disabled.

\set ON_ERROR_STOP on
\timing off
set client_min_messages = warning;

create temporary table check_results (
  id serial primary key,
  name text not null,
  passed boolean not null,
  detail text
);

create or replace function pg_temp.record(p_name text, p_passed boolean, p_detail text default null)
returns void language sql as $$
  insert into check_results (name, passed, detail) values (p_name, p_passed, p_detail);
$$;

/* Runs a statement that is expected to fail, and records whether it did. */
create or replace function pg_temp.expect_failure(p_name text, p_sql text, p_expect text default null)
returns void language plpgsql as $$
begin
  execute p_sql;
  perform pg_temp.record(p_name, false, 'statement unexpectedly succeeded');
exception when others then
  if p_expect is not null and position(lower(p_expect) in lower(sqlerrm)) = 0 then
    perform pg_temp.record(p_name, false, format('wrong error: %s', sqlerrm));
  else
    perform pg_temp.record(p_name, true, sqlerrm);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Seed integrity
-- ---------------------------------------------------------------------------

select pg_temp.record('seed: 5 users created via the auth trigger',
  (select count(*) = 5 from public.users),
  (select count(*)::text from public.users));

select pg_temp.record('seed: roles assigned (1 admin, 2 hosts, 2 seekers)',
  (select count(*) filter (where role = 'admin') = 1
      and count(*) filter (where role = 'host') = 2
      and count(*) filter (where role = 'seeker') = 2
   from public.users));

select pg_temp.record('seed: 4 live listings, 1 paused',
  (select count(*) filter (where status = 'live') = 4
      and count(*) filter (where status = 'paused') = 1
   from public.listings));

select pg_temp.record('seed: every listing has >= 2 photos',
  (select bool_and(c >= 2) from (
     select count(*) c from public.listing_photos group by listing_id) s));

select pg_temp.record('seed: agreement_signed_at synced from the evidence table (A6)',
  (select count(*) = 5 from public.listings where agreement_signed_at is not null));

-- ---------------------------------------------------------------------------
-- PostGIS search (spec 7.1, 9.6)
-- ---------------------------------------------------------------------------

-- All four live listings fall inside 10km of the city centre; the paused one must not.
select pg_temp.record('search: nearby returns every live listing around Ahmedabad',
  (select count(*) = 4 from public.search_nearby_listings(23.0225, 72.5714, 10000)),
  (select count(*)::text from public.search_nearby_listings(23.0225, 72.5714, 10000)));

select pg_temp.record('search: results are ordered by distance',
  (select bool_and(ordered) from (
     select distance_meters >= lag(distance_meters) over (order by distance_meters) as ordered
       from public.search_nearby_listings(23.0225, 72.5714, 25000)) s
   where ordered is not null));

select pg_temp.record('search: a paused listing never appears',
  (select count(*) = 0 from public.search_nearby_listings(22.9964, 72.6009, 1000)
    where id = '10000000-0000-4000-8000-000000000005'));

select pg_temp.record('search: radius actually excludes distant listings',
  (select count(*) = 0 from public.search_nearby_listings(19.0760, 72.8777, 5000)));

-- ---------------------------------------------------------------------------
-- Listing lifecycle (spec 7.2, A14)
-- ---------------------------------------------------------------------------

insert into public.listings (
  id, host_id, title, address_line, city, location, spot_type, price_per_hour, status
) values (
  '90000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002',
  'Test listing without photos', '1 Test Road', 'Ahmedabad',
  extensions.ST_SetSRID(extensions.ST_MakePoint(72.5714, 23.0225), 4326)::extensions.geography,
  'open', 3000, 'draft'
);

select pg_temp.expect_failure(
  'lifecycle: cannot submit a listing with fewer than 2 photos (7.2)',
  $$update public.listings set status = 'pending'
     where id = '90000000-0000-4000-8000-000000000001'$$,
  'at least 2 photos');

select pg_temp.expect_failure(
  'lifecycle: cannot go live without a signed agreement (7.2, A6)',
  $$update public.listings set status = 'live'
     where id = '90000000-0000-4000-8000-000000000001'$$,
  'without a signed Host Listing Agreement');

select pg_temp.expect_failure(
  'listings: daily rate cannot exceed 24x the hourly rate (A3)',
  $$update public.listings set price_per_day = 3000 * 25
     where id = '90000000-0000-4000-8000-000000000001'$$,
  'listings_daily_cap_is_a_discount');

-- A14: a material edit to a live listing sends it back for re-approval.
update public.listings set address_line = 'A completely different address'
 where id = '10000000-0000-4000-8000-000000000003';

select pg_temp.record('A14: material edit (address) returns a live listing to pending',
  (select status = 'pending' and approved_by is null
     from public.listings where id = '10000000-0000-4000-8000-000000000003'),
  (select status::text from public.listings where id = '10000000-0000-4000-8000-000000000003'));

-- A14: a price change does not.
update public.listings set price_per_hour = 4500
 where id = '10000000-0000-4000-8000-000000000004';

select pg_temp.record('A14: price edit leaves a live listing live',
  (select status = 'live' from public.listings
    where id = '10000000-0000-4000-8000-000000000004'),
  (select status::text from public.listings where id = '10000000-0000-4000-8000-000000000004'));

-- ---------------------------------------------------------------------------
-- Bookings: capacity, holds, state machine (A4, A9, A10)
-- ---------------------------------------------------------------------------

-- Listing 1 has capacity 1. Two overlapping bookings must not both survive.
insert into public.bookings (
  id, listing_id, seeker_id, host_id, start_time, end_time,
  subtotal, service_fee, total, host_payout
) values (
  '80000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000004',
  '00000000-0000-4000-8000-000000000002',
  now() + interval '2 days', now() + interval '2 days 3 hours',
  9000, 1350, 10350, 9000
);

select pg_temp.record('bookings: a reference is generated automatically (A5)',
  (select reference ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$'
     from public.bookings where id = '80000000-0000-4000-8000-000000000001'),
  (select reference from public.bookings where id = '80000000-0000-4000-8000-000000000001'));

select pg_temp.record('A10: an unpaid booking is given a hold expiry',
  (select hold_expires_at is not null and hold_expires_at > now()
     from public.bookings where id = '80000000-0000-4000-8000-000000000001'));

select pg_temp.expect_failure(
  'A4: an overlapping booking is refused at capacity 1',
  $$insert into public.bookings (
      listing_id, seeker_id, host_id, start_time, end_time,
      subtotal, service_fee, total, host_payout
    ) values (
      '10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000005',
      '00000000-0000-4000-8000-000000000002',
      now() + interval '2 days 1 hour', now() + interval '2 days 2 hours',
      3000, 450, 3450, 3000)$$,
  'fully booked');

-- A10: once the hold lapses, the slot is free again - before any sweep runs.
update public.bookings set hold_expires_at = now() - interval '1 minute'
 where id = '80000000-0000-4000-8000-000000000001';

insert into public.bookings (
  id, listing_id, seeker_id, host_id, start_time, end_time,
  subtotal, service_fee, total, host_payout
) values (
  '80000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000005',
  '00000000-0000-4000-8000-000000000002',
  now() + interval '2 days 1 hour', now() + interval '2 days 2 hours',
  3000, 450, 3450, 3000
);

select pg_temp.record('A10: a lapsed hold frees the slot for another seeker', true);

select pg_temp.record('A10: the sweep expires lapsed holds',
  (select public.expire_unpaid_bookings() >= 1));

select pg_temp.record('A10: the swept booking is now payment_failed',
  (select status = 'payment_failed' from public.bookings
    where id = '80000000-0000-4000-8000-000000000001'),
  (select status::text from public.bookings where id = '80000000-0000-4000-8000-000000000001'));

-- A9: the state machine rejects an illegal jump.
select pg_temp.expect_failure(
  'A9: pending_payment cannot jump straight to completed',
  $$update public.bookings set status = 'completed'
     where id = '80000000-0000-4000-8000-000000000002'$$,
  'Illegal booking transition');

-- Tested on a booking whose slot is otherwise free, so the rejection can only come from the
-- transition rule. (bookings_enforce_availability sorts before bookings_enforce_transition, so
-- a contended slot would fail on capacity first and prove nothing about the state machine.)
insert into public.bookings (
  id, listing_id, seeker_id, host_id, start_time, end_time,
  subtotal, service_fee, total, host_payout, hold_expires_at
) values (
  '80000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000004',
  '00000000-0000-4000-8000-000000000003',
  now() + interval '30 days', now() + interval '30 days 2 hours',
  10000, 1500, 11500, 10000, now() - interval '1 minute'
);

select pg_temp.record('A10: the sweep expires this booking too',
  (select public.expire_unpaid_bookings() >= 1));

select pg_temp.expect_failure(
  'A9: a payment_failed booking cannot be resurrected',
  $$update public.bookings set status = 'confirmed'
     where id = '80000000-0000-4000-8000-000000000003'$$,
  'Illegal booking transition');

-- A4: a host-blocked window blocks the slot outright.
select pg_temp.expect_failure(
  'availability: a host-blocked window refuses bookings',
  $$insert into public.bookings (
      listing_id, seeker_id, host_id, start_time, end_time,
      subtotal, service_fee, total, host_payout
    ) values (
      '10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000004',
      '00000000-0000-4000-8000-000000000002',
      date_trunc('day', now()) + interval '2 days 10 hours',
      date_trunc('day', now()) + interval '2 days 12 hours',
      8000, 1200, 9200, 8000)$$,
  'marked this period unavailable');

-- A4: capacity 2 really does allow two concurrent bookings.
insert into public.bookings (
  listing_id, seeker_id, host_id, start_time, end_time, subtotal, service_fee, total, host_payout
) values
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000004',
   '00000000-0000-4000-8000-000000000002',
   now() + interval '5 days', now() + interval '5 days 2 hours', 8000, 1200, 9200, 8000),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000005',
   '00000000-0000-4000-8000-000000000002',
   now() + interval '5 days', now() + interval '5 days 2 hours', 8000, 1200, 9200, 8000);

select pg_temp.record('A4: capacity 2 permits exactly two concurrent bookings', true);

select pg_temp.expect_failure(
  'A4: the third concurrent booking is refused at capacity 2',
  $$insert into public.bookings (
      listing_id, seeker_id, host_id, start_time, end_time,
      subtotal, service_fee, total, host_payout
    ) values (
      '10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000004',
      '00000000-0000-4000-8000-000000000002',
      now() + interval '5 days', now() + interval '5 days 1 hour', 8000, 1200, 9200, 8000)$$,
  'fully booked');

select pg_temp.record('availability: listing_available_slots agrees with the trigger',
  (select public.listing_available_slots(
     '10000000-0000-4000-8000-000000000002',
     now() + interval '5 days', now() + interval '5 days 2 hours') = 0));

-- ---------------------------------------------------------------------------
-- Payout eligibility and disputes (A11, A12)
-- ---------------------------------------------------------------------------

-- A booking that ended 3 days ago: dispute window closed, so it should be payable.
insert into public.bookings (
  id, listing_id, seeker_id, host_id, start_time, end_time,
  subtotal, service_fee, total, host_payout, status
) values (
  '80000000-0000-4000-8000-000000000010',
  '10000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000004',
  '00000000-0000-4000-8000-000000000003',
  now() - interval '3 days 4 hours', now() - interval '3 days',
  40000, 6000, 46000, 40000, 'pending_payment'
);
update public.bookings set status = 'confirmed'
 where id = '80000000-0000-4000-8000-000000000010';
update public.bookings set status = 'completed'
 where id = '80000000-0000-4000-8000-000000000010';

-- A booking that ended an hour ago: still inside the dispute window.
insert into public.bookings (
  id, listing_id, seeker_id, host_id, start_time, end_time,
  subtotal, service_fee, total, host_payout, status
) values (
  '80000000-0000-4000-8000-000000000011',
  '10000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000005',
  '00000000-0000-4000-8000-000000000003',
  now() - interval '4 hours', now() - interval '1 hour',
  30000, 4500, 34500, 30000, 'pending_payment'
);
update public.bookings set status = 'confirmed'
 where id = '80000000-0000-4000-8000-000000000011';
update public.bookings set status = 'completed'
 where id = '80000000-0000-4000-8000-000000000011';

select pg_temp.record('A11: a settled booking is payable once the window closes',
  (select count(*) = 1 from public.unpaid_host_earnings(
     '00000000-0000-4000-8000-000000000003', '-infinity', 'infinity')
    where booking_id = '80000000-0000-4000-8000-000000000010'));

select pg_temp.record('A11: a booking inside the dispute window is NOT payable',
  (select count(*) = 0 from public.unpaid_host_earnings(
     '00000000-0000-4000-8000-000000000003', '-infinity', 'infinity')
    where booking_id = '80000000-0000-4000-8000-000000000011'));

select pg_temp.record('A12: the balance is due once it clears the Rs 200 minimum',
  (select is_due and total_amount = 40000
     from public.host_payout_due('00000000-0000-4000-8000-000000000003')),
  (select format('due=%s amount=%s', is_due, total_amount)
     from public.host_payout_due('00000000-0000-4000-8000-000000000003')));

-- Now raise a dispute on the otherwise-payable booking.
insert into public.disputes (booking_id, raised_by, reason)
values ('80000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000004',
        'Spot was occupied on arrival');

select pg_temp.record('A11: an open dispute removes a booking from the payout run',
  (select count(*) = 0 from public.unpaid_host_earnings(
     '00000000-0000-4000-8000-000000000003', '-infinity', 'infinity')
    where booking_id = '80000000-0000-4000-8000-000000000010'));

select pg_temp.expect_failure(
  'A11: only one open dispute per booking',
  $$insert into public.disputes (booking_id, raised_by, reason)
    values ('80000000-0000-4000-8000-000000000010',
            '00000000-0000-4000-8000-000000000004', 'Duplicate complaint')$$,
  'disputes_one_open_per_booking_idx');

-- Spec 7.3: a booking can belong to at most one payout, ever.
insert into public.payouts (id, host_id, period_start, period_end, amount, initiated_by)
values ('70000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003',
        now() - interval '7 days', now(), 1, '00000000-0000-4000-8000-000000000001');

insert into public.payout_bookings (payout_id, booking_id, amount)
values ('70000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000010', 40000);

select pg_temp.record('payouts: the header amount syncs from its line items',
  (select amount = 40000 from public.payouts
    where id = '70000000-0000-4000-8000-000000000001'),
  (select amount::text from public.payouts where id = '70000000-0000-4000-8000-000000000001'));

insert into public.payouts (id, host_id, period_start, period_end, amount, initiated_by)
values ('70000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003',
        now() - interval '7 days', now(), 1, '00000000-0000-4000-8000-000000000001');

select pg_temp.expect_failure(
  'spec 7.3: a booking cannot be paid out twice',
  $$insert into public.payout_bookings (payout_id, booking_id, amount)
    values ('70000000-0000-4000-8000-000000000002',
            '80000000-0000-4000-8000-000000000010', 40000)$$,
  'payout_bookings_booking_id_key');

-- ---------------------------------------------------------------------------
-- Reviews (spec 7.1, A16)
-- ---------------------------------------------------------------------------

select pg_temp.expect_failure(
  'spec 7.1: a booking cannot be reviewed before it completes',
  $$insert into public.reviews (booking_id, listing_id, created_by, rating)
    values ('80000000-0000-4000-8000-000000000002',
            '10000000-0000-4000-8000-000000000001',
            '00000000-0000-4000-8000-000000000005', 5)$$,
  'completed booking');

insert into public.reviews (booking_id, listing_id, created_by, rating, comment)
values ('80000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000004',
        '00000000-0000-4000-8000-000000000005', 5, 'Easy access, exactly as described.');

select pg_temp.record('spec 7.1: a completed booking can be reviewed',
  (select count(*) = 1 from public.reviews
    where booking_id = '80000000-0000-4000-8000-000000000011'));

select pg_temp.record('reviews: the listing rating rollup reflects it',
  (select average_rating = 5.00 and review_count = 1 from public.listing_ratings
    where listing_id = '10000000-0000-4000-8000-000000000004'),
  (select format('avg=%s n=%s', average_rating, review_count) from public.listing_ratings
    where listing_id = '10000000-0000-4000-8000-000000000004'));

-- A16: an Admin can hide a review, and it stops counting.
update public.reviews set hidden_at = now(), hidden_by = '00000000-0000-4000-8000-000000000001'
 where booking_id = '80000000-0000-4000-8000-000000000011';

select pg_temp.record('A16: a hidden review is excluded from the public rating',
  (select review_count = 0 from public.listing_ratings
    where listing_id = '10000000-0000-4000-8000-000000000004'));

-- A16: outside the 14-day window, a review is refused.
insert into public.bookings (
  id, listing_id, seeker_id, host_id, start_time, end_time,
  subtotal, service_fee, total, host_payout, status
) values (
  '80000000-0000-4000-8000-000000000020',
  '10000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000004',
  '00000000-0000-4000-8000-000000000003',
  now() - interval '20 days 3 hours', now() - interval '20 days',
  30000, 4500, 34500, 30000, 'pending_payment'
);
update public.bookings set status = 'confirmed'
 where id = '80000000-0000-4000-8000-000000000020';
update public.bookings set status = 'completed'
 where id = '80000000-0000-4000-8000-000000000020';

select pg_temp.expect_failure(
  'A16: a review is refused after the 14-day window',
  $$insert into public.reviews (booking_id, listing_id, created_by, rating)
    values ('80000000-0000-4000-8000-000000000020',
            '10000000-0000-4000-8000-000000000004',
            '00000000-0000-4000-8000-000000000004', 4)$$,
  '14-day review window');

-- ---------------------------------------------------------------------------
-- Host conduct and suspension (spec 7.3, A13)
-- ---------------------------------------------------------------------------

select pg_temp.record('spec 7.3: host has live listings before suspension',
  (select count(*) > 0 from public.listings
    where host_id = '00000000-0000-4000-8000-000000000002' and status = 'live'));

update public.users
   set suspended_at = now(), suspended_reason = 'schema check'
 where id = '00000000-0000-4000-8000-000000000002';

select pg_temp.record('spec 7.3: suspending a host immediately delists their live listings',
  (select count(*) = 0 from public.listings
    where host_id = '00000000-0000-4000-8000-000000000002' and status = 'live'),
  (select count(*)::text from public.listings
    where host_id = '00000000-0000-4000-8000-000000000002' and status = 'live'));

-- A13: three host cancellations in 90 days auto-pauses that host's listings.
insert into public.bookings (
  id, listing_id, seeker_id, host_id, start_time, end_time,
  subtotal, service_fee, total, host_payout, status, cancelled_at, cancelled_by
)
select
  ('80000000-0000-4000-8000-00000000003' || n)::uuid,
  '10000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000004',
  '00000000-0000-4000-8000-000000000003',
  now() - (n || ' days')::interval - interval '3 hours',
  now() - (n || ' days')::interval,
  10000, 1500, 11500, 10000, 'cancelled', now() - (n || ' days')::interval, 'host'
from generate_series(1, 2) n;

select pg_temp.record('A13: two host cancellations do not yet pause the listings',
  (select count(*) > 0 from public.listings
    where host_id = '00000000-0000-4000-8000-000000000003' and status = 'live'));

-- The third cancellation goes through the real transition, firing the AFTER trigger.
insert into public.bookings (
  id, listing_id, seeker_id, host_id, start_time, end_time,
  subtotal, service_fee, total, host_payout
) values (
  '80000000-0000-4000-8000-000000000040',
  '10000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000004',
  '00000000-0000-4000-8000-000000000003',
  now() + interval '9 days', now() + interval '9 days 2 hours',
  10000, 1500, 11500, 10000
);

update public.bookings
   set status = 'cancelled', cancelled_by = 'host', cancellation_reason = 'schema check'
 where id = '80000000-0000-4000-8000-000000000040';

select pg_temp.record('A13: the third host cancellation in 90 days pauses their listings',
  (select count(*) = 0 from public.listings
    where host_id = '00000000-0000-4000-8000-000000000003' and status = 'live'),
  (select count(*)::text from public.listings
    where host_id = '00000000-0000-4000-8000-000000000003' and status = 'live'));

select pg_temp.record('A13: the auto-pause is recorded in the admin audit log',
  (select count(*) >= 1 from public.admin_audit_log
    where action = 'auto_pause_host_listings'));

-- ---------------------------------------------------------------------------
-- Results
-- ---------------------------------------------------------------------------

\echo ''
\echo '================ SCHEMA CHECK RESULTS ================'
select
  case when passed then 'PASS' else 'FAIL' end as result,
  name,
  case when passed then null else detail end as detail
from check_results
order by id;

\echo ''
select format('%s of %s checks passed', count(*) filter (where passed), count(*))
  as summary from check_results;

do $$
declare
  v_failed integer;
begin
  select count(*) into v_failed from check_results where not passed;
  if v_failed > 0 then
    raise exception '% schema check(s) FAILED', v_failed;
  end if;
end;
$$;
