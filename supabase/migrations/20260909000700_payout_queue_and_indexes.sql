-- One query for the payout queue instead of one round trip per host (spec §7.3, §12).
--
-- `/admin/payouts` looped over every host and called `unpaid_host_earnings` once each, awaiting
-- in sequence. The function itself is fast — under 2ms — but each call is a separate HTTP round
-- trip through PostgREST. At the pilot's size that is five trips and nobody notices; at two
-- hundred hosts it is two hundred sequential trips, and the page an operator uses to move money
-- takes seconds to draw for no reason a profiler would obviously point at.
--
-- §12 asks for pages to stay responsive under the pilot's load. This is the one screen in the
-- app whose cost grew linearly with the marketplace.

create or replace function public.hosts_with_unpaid_earnings()
returns table (
  host_id uuid,
  name text,
  phone text,
  kyc_status public.kyc_status,
  total bigint,
  booking_count integer,
  oldest_completed_at timestamptz,
  fund_account_id text,
  account_last4 text
)
language sql
stable
security definer
set search_path = public
as $fn$
  select
    u.id,
    u.name,
    u.phone,
    u.kyc_status,
    coalesce(sum(e.amount), 0)::bigint,
    count(e.booking_id)::integer,
    min(e.completed_at),
    b.fund_account_id,
    b.account_last4
  from public.users u
  -- LATERAL so the existing per-host function stays the single definition of "what is owed".
  -- Duplicating its dispute hold and refund arithmetic here is exactly how the payout screen and
  -- the payout run would drift apart.
  cross join lateral public.unpaid_host_earnings(u.id, '-infinity', 'infinity') e
  left join public.host_bank_accounts b on b.host_id = u.id
  where u.role in ('host', 'admin')
  group by u.id, u.name, u.phone, u.kyc_status, b.fund_account_id, b.account_last4
  having count(e.booking_id) > 0
  order by coalesce(sum(e.amount), 0) desc;
$fn$;

comment on function public.hosts_with_unpaid_earnings is
  'Spec 7.3: every host currently owed money, in one round trip. Reuses unpaid_host_earnings so '
  'the queue and the payout run can never disagree about what is owed.';

revoke all on function public.hosts_with_unpaid_earnings() from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Indexes for the screens added since the original schema
-- ---------------------------------------------------------------------------

-- /admin/bookings orders every booking by start_time, and report_totals filters a range of it.
-- Neither had an index on start_time alone; the existing composite is keyed on listing first, so
-- it cannot serve an ordering across all bookings.
create index if not exists bookings_start_time_idx
  on public.bookings (start_time desc);

-- The scheduled notification run looks up "what has already been sent for this booking".
create index if not exists notification_log_booking_template_idx
  on public.notification_log (booking_id, template);
