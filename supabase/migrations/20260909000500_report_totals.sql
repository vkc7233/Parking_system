-- Aggregate money in the database, not by fetching rows (spec §7.3, §12).
--
-- Both the admin dashboard and the Reports screen summed money by SELECTing every matching
-- booking and adding it up in JavaScript. PostgREST caps a request at `max_rows` (1000 locally
-- and by default when hosted), so past a thousand bookings in the window both figures would have
-- silently under-reported — no error, no warning, just a number quietly too small. §12 sizes the
-- pilot at 5,000 bookings a month, so that is not a theoretical limit; it is a bug with a date on
-- it.
--
-- Aggregating here also means the dashboard and the report do the same arithmetic on the same
-- rows. They previously did not: the dashboard summed `total` where status = 'completed' over all
-- time, while the report summed 'confirmed' and 'completed' over a period. Both were defensible
-- and they disagreed, which is the worst of both.

create or replace function public.report_totals(
  p_from timestamptz,
  p_to timestamptz,
  p_statuses text[]
)
returns table (
  bookings bigint,
  gross bigint,
  fees bigint,
  payouts bigint,
  refunded bigint,
  scanned bigint
)
language sql
stable
security definer
set search_path = public
as $fn$
  select
    count(*)::bigint,
    coalesce(sum(b.total), 0)::bigint,
    coalesce(sum(b.service_fee), 0)::bigint,
    coalesce(sum(b.host_payout), 0)::bigint,
    coalesce(sum(coalesce(b.refund_amount, 0)), 0)::bigint,
    count(*) filter (where b.checked_in_at is not null)::bigint
  from public.bookings b
  where b.status::text = any(p_statuses)
    -- A booking belongs to the period it was due to START in: that is the period the space was
    -- actually occupied, which is what an operator reconciling a month is asking about.
    and b.start_time >= p_from
    and b.start_time <= p_to;
$fn$;

comment on function public.report_totals is
  'Spec 7.3: one arithmetic for the admin dashboard and the CSV export, aggregated server-side '
  'so neither is truncated by the PostgREST row cap.';

revoke all on function public.report_totals(timestamptz, timestamptz, text[]) from anon, authenticated;
