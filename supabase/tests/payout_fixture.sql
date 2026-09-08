-- Local fixture: bookings that exercise the payout and dispute screens.
--
-- Not part of the seed, because the seed should describe a marketplace at rest rather than one
-- mid-settlement. Run it by hand after `pnpm db:reset` when working on Sprint 6 screens:
--
--   docker exec -i supabase_db_<project> psql -U postgres -d postgres < supabase/tests/payout_fixture.sql
--
-- It creates, for Meena Kulkarni:
--   * two completed bookings past their 48-hour dispute window  -> payable now
--   * one completed an hour ago                                 -> still held
-- which is exactly the split the Earnings and Payouts screens are built to distinguish.

insert into public.bookings (
  id, listing_id, seeker_id, host_id, start_time, end_time,
  subtotal, service_fee, total, host_payout, status
) values
  ('80000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000002',
   now() - interval '5 days 3 hours', now() - interval '5 days',
   15000, 2250, 17250, 15000, 'pending_payment'),
  ('80000000-0000-4000-8000-0000000000a2', '10000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000002',
   now() - interval '4 days 2 hours', now() - interval '4 days',
   12000, 1800, 13800, 12000, 'pending_payment'),
  ('80000000-0000-4000-8000-0000000000b1', '10000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000002',
   now() - interval '4 hours', now() - interval '1 hour',
   9000, 1350, 10350, 9000, 'pending_payment')
on conflict (id) do nothing;

-- Moved through the real transitions rather than inserted as 'completed', so the state machine
-- and the completion timestamps behave exactly as they would in production.
update public.bookings set status = 'confirmed'
 where id in ('80000000-0000-4000-8000-0000000000a1',
              '80000000-0000-4000-8000-0000000000a2',
              '80000000-0000-4000-8000-0000000000b1');

update public.bookings set status = 'completed'
 where id in ('80000000-0000-4000-8000-0000000000a1',
              '80000000-0000-4000-8000-0000000000a2',
              '80000000-0000-4000-8000-0000000000b1');

-- Captured payments, so a dispute resolved in the seeker's favour has something to refund.
insert into public.payments (booking_id, provider_order_id, provider_payment_id, amount, status, captured_at)
select b.id,
       'order_fixture_' || right(b.id::text, 4),
       'pay_fixture_' || right(b.id::text, 4),
       b.total,
       'captured',
       b.end_time
  from public.bookings b
 where b.id in ('80000000-0000-4000-8000-0000000000a1',
                '80000000-0000-4000-8000-0000000000a2',
                '80000000-0000-4000-8000-0000000000b1')
on conflict (booking_id) do nothing;

select 'payable now: ' || coalesce(sum(amount), 0) || ' paise across ' || count(*) || ' bookings'
  from public.unpaid_host_earnings('00000000-0000-4000-8000-000000000002', '-infinity', 'infinity');
