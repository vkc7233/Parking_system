-- Stop paying a host for a booking the seeker was refunded for (spec §7.2, §7.3).
--
-- `unpaid_host_earnings` excluded a booking only while a dispute was *open*. Resolving that
-- dispute in the seeker's favour refunds the money and leaves the booking `completed` — so the
-- moment the admin clicked "refund the seeker", the same booking became payable to the host.
-- The platform would have refunded the seeker and paid the host for the same stay.
--
-- Verified against the database before the fix: a completed booking with `refund_amount` equal to
-- its full total was returned by this function with `amount = 60000`. The dispute screen's own
-- copy — "the host is not paid for this booking" — was untrue.
--
-- §7.2's acceptance criterion is that a host's earnings total "always matches the sum of
-- completed, non-refunded bookings". Refunded bookings have to come out.
--
-- The refund is taken off the host's share rather than split across the host's payout and the
-- platform's fee. That is the conservative direction — it can never overpay — and it is exact for
-- the only path that refunds a *completed* booking today, which is a dispute resolved in the
-- seeker's favour and always refunds the whole outstanding amount. A future partial refund that
-- is meant to come out of the service fee alone would need the split recorded on the booking;
-- there is no column for it today, and inventing one now would be guessing at a policy nobody
-- has written.

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
  select b.id,
         b.reference,
         b.completed_at,
         greatest(b.host_payout - coalesce(b.refund_amount, 0), 0)::bigint as amount
    from public.bookings b
   where b.host_id = p_host_id
     and b.status = 'completed'
     and b.completed_at >= p_period_start
     and b.completed_at < p_period_end
     -- A11: the dispute window has closed...
     and b.end_time <= now() - interval '48 hours'
     -- ...and nothing is contested.
     and not exists (
       select 1 from public.disputes d
        where d.booking_id = b.id and d.status = 'open'
     )
     and not exists (
       select 1 from public.payout_bookings pb where pb.booking_id = b.id
     )
     -- A booking refunded down to nothing is not earnings. Dropping the row rather than
     -- returning a zero keeps it out of the payout's booking count and off the admin screen,
     -- where a ₹0.00 line would read as a bug rather than as a resolved dispute.
     and greatest(b.host_payout - coalesce(b.refund_amount, 0), 0) > 0
   order by b.completed_at;
$fn$;

comment on function public.unpaid_host_earnings is
  'Spec 7.2/7.3: completed, non-refunded, uncontested bookings past the A11 dispute hold that '
  'have not already been paid out. Refunds are netted off the host share.';
