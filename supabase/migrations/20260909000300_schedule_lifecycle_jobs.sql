-- Actually run the booking lifecycle sweeps (spec §7.1).
--
-- `complete_elapsed_bookings()` and `expire_unpaid_bookings()` were written but nothing ever
-- called them. Scheduling was described in prose in supabase/README.md and never expressed
-- anywhere the database would act on, so in a real deployment no booking would ever have left
-- `confirmed`.
--
-- §7.1 requires that "a completed booking correctly moves from 'upcoming' to 'past'
-- automatically at end time". The list on /bookings splits on `end_time`, so it *looked*
-- right — but everything gated on `status = 'completed'` silently never happened:
--
--   * reviews never open (the trigger and `canBeReviewed` both require 'completed'),
--   * host earnings never accrue (`unpaid_host_earnings` selects only 'completed'),
--   * therefore no host is ever paid.
--
-- A marketplace that never pays its hosts has no supply side after the first month, and nothing
-- would have failed loudly enough to notice.
--
-- Expiring unpaid holds matters just as much in the other direction: an abandoned checkout holds
-- a slot for ten minutes (A10), and without the sweep that hold never lifts, so the space is
-- withdrawn from sale permanently by someone who never paid.

create extension if not exists pg_cron with schema extensions;

-- pg_cron's own tables live in the extension schema; jobs run as the database owner.
grant usage on schema cron to postgres;

/*
 * Both jobs are idempotent by construction - each selects on the status it is about to leave -
 * so a missed run, an overlapping run, or a manual invocation are all safe.
 *
 * Every minute rather than every five: the hold is ten minutes (A10), and a seeker who abandons
 * checkout should get their slot back to the market quickly. Both statements are indexed
 * single-table updates over a handful of rows, so the cost is negligible at §12's volumes.
 */
select cron.schedule(
  'complete-elapsed-bookings',
  '* * * * *',
  $job$ select public.complete_elapsed_bookings(); $job$
);

select cron.schedule(
  'expire-unpaid-bookings',
  '* * * * *',
  $job$ select public.expire_unpaid_bookings(); $job$
);

comment on extension pg_cron is
  'Runs the booking lifecycle sweeps. Without them nothing reaches completed, so no host is paid.';
