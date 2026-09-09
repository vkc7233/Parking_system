import { DISPUTE, PAYOUT } from '@parking/config';
import {
  formatPaise,
  isPayoutEligible,
  payableAmount,
  payoutIneligibleReason,
  summarisePayout,
  type PayoutCandidate,
} from '@parking/core';
import { Badge, Card, CardBody, CardHeader, EmptyState, Money } from '@parking/ui';
import { requireHost } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Earnings' };

interface EarningRow {
  id: string;
  reference: string;
  status: string;
  end_time: string;
  completed_at: string | null;
  host_payout: number;
  refund_amount: number | null;
  listings: { title: string } | null;
  /**
   * PostgREST decides the shape of an embed from the constraint behind it. `disputes.booking_id`
   * is not unique, so that comes back as an array. `payout_bookings.booking_id` IS unique - the
   * constraint that stops a booking being paid twice - so PostgREST treats it as to-one and
   * returns an object or null, never an array. Reading `.length` off it throws.
   */
  disputes: { status: string }[] | null;
  payout_bookings: { payout_id: string } | { payout_id: string }[] | null;
}

/** Normalises an embed that may arrive as an object, an array, or null. */
function embedCount(value: unknown): number {
  if (value === null || value === undefined) return 0;
  return Array.isArray(value) ? value.length : 1;
}

interface PayoutRow {
  id: string;
  amount: number;
  status: string;
  period_start: string;
  period_end: string;
  processed_at: string | null;
  provider_payout_id: string | null;
  failure_reason: string | null;
}

/**
 * Host earnings and payout history (spec §7.2).
 *
 * §7.2's acceptance criterion is that the earnings total always matches the sum of completed,
 * non-refunded bookings — so the figures here are computed from the bookings themselves rather
 * than from a running balance that could drift.
 *
 * The split between "on its way" and "still held" is the part a Host actually needs. Money is
 * held until the dispute window closes (A11), and a balance below the minimum carries forward
 * (A12); a screen that showed one number would leave them wondering where the rest went.
 */
export default async function EarningsPage() {
  const profile = await requireHost('/host/earnings');
  const supabase = await createClient();

  const { data: bookingRows } = await supabase
    .from('bookings')
    .select(
      'id, reference, status, end_time, completed_at, host_payout, refund_amount, listings(title), disputes(status), payout_bookings(payout_id)',
    )
    .eq('host_id', profile.id)
    .in('status', ['confirmed', 'completed'])
    .order('end_time', { ascending: false });

  const bookings = (bookingRows ?? []) as unknown as EarningRow[];

  const candidates: PayoutCandidate[] = bookings.map((b) => ({
    bookingId: b.id,
    status: b.status,
    endTime: new Date(b.end_time),
    completedAt: b.completed_at ? new Date(b.completed_at) : null,
    hostPayout: Number(b.host_payout),
    refundAmount: Number(b.refund_amount ?? 0),
    hasOpenDispute: (b.disputes ?? []).some((d) => d.status === 'open'),
    alreadyPaidOut: embedCount(b.payout_bookings) > 0,
  }));

  const summary = summarisePayout(candidates);

  const { data: payoutRows } = await supabase
    .from('payouts')
    .select(
      'id, amount, status, period_start, period_end, processed_at, provider_payout_id, failure_reason',
    )
    .eq('host_id', profile.id)
    .order('created_at', { ascending: false });

  const payouts = (payoutRows ?? []) as unknown as PayoutRow[];

  /*
   * Summed from payouts that actually succeeded, not from bookings attached to one.
   *
   * A failed transfer keeps its line items attached deliberately, so the money is not silently
   * re-queued into another payout while the failure is unresolved. Counting those as "paid out"
   * told the host their money had been sent when it had not - the single worst thing this screen
   * could get wrong.
   */
  const paidOut = payouts
    .filter((p) => p.status === 'paid')
    .reduce((sum, p) => sum + Number(p.amount), 0);

  const tiles = [
    {
      label: 'Ready to pay out',
      value: summary.eligibleAmount,
      hint: summary.isDue
        ? 'Included in the next payout run.'
        : summary.heldBackReason === 'below_minimum'
          ? `Carries forward until it reaches ${formatPaise(PAYOUT.minimumPayout)}.`
          : 'Nothing ready yet.',
    },
    {
      label: 'Still held',
      value: summary.pendingAmount,
      hint: `Released ${DISPUTE.windowHoursAfterBookingEnd} hours after each booking ends.`,
    },
    {
      label: 'Paid out so far',
      value: paidOut,
      hint: 'Transfers that actually completed.',
    },
  ];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Earnings</h1>
        <p className="mt-1 text-slate-600">
          You keep the full price you set — the service fee is paid by the seeker on top.
        </p>
      </header>

      <dl className="grid gap-3 sm:grid-cols-3">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-xl border border-slate-200 bg-white p-4">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {tile.label}
            </dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
              <Money paise={tile.value} />
            </dd>
            <dd className="mt-1 text-xs text-slate-500">{tile.hint}</dd>
          </div>
        ))}
      </dl>

      <Card>
        <CardHeader
          title="How payouts work"
          description={`Published ${PAYOUT.publishedCycle}; we run them twice a week.`}
        />
        <CardBody>
          <ol className="space-y-2 text-sm text-slate-700">
            <li>
              <span className="font-medium">1.</span> A booking completes when its end time passes.
            </li>
            <li>
              <span className="font-medium">2.</span> Its earnings are held for{' '}
              {DISPUTE.windowHoursAfterBookingEnd} hours, so a seeker who has a problem can raise it
              before the money leaves.
            </li>
            <li>
              <span className="font-medium">3.</span> After that it joins your next payout, as long
              as the balance is at least {formatPaise(PAYOUT.minimumPayout)} — smaller balances
              carry forward rather than paying a transfer fee on very little. Anything waiting more
              than {PAYOUT.forceOutAfterDays} days is paid regardless.
            </li>
          </ol>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Bookings" description={`${bookings.length} counted`} />
        {bookings.length === 0 ? (
          <EmptyState
            title="No earnings yet"
            description="Once a seeker books and uses one of your spaces, it will appear here."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {bookings.map((booking, i) => {
              const candidate = candidates[i]!;

              // Labelled from the same eligibility function the payout run uses, so a booking
              // never reads as "held" here while the admin screen is offering to pay it.
              const reason = payoutIneligibleReason(candidate);
              const state = isPayoutEligible(candidate)
                ? ({ label: 'Ready', tone: 'success' } as const)
                : reason === 'already_paid_out'
                  ? ({ label: 'Paid out', tone: 'neutral' } as const)
                  : reason === 'dispute_open'
                    ? ({ label: 'Disputed', tone: 'danger' } as const)
                    : reason === 'refunded'
                      ? ({ label: 'Refunded', tone: 'neutral' } as const)
                      : reason === 'not_completed'
                        ? ({ label: 'In progress', tone: 'info' } as const)
                        : ({ label: 'Held', tone: 'warning' } as const);

              return (
                <li
                  key={booking.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {booking.listings?.title ?? 'Listing removed'}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {new Date(booking.end_time).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}{' '}
                      · <span className="font-mono">{booking.reference}</span>
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <Badge tone={state.tone}>{state.label}</Badge>
                    <span className="text-sm font-medium tabular-nums text-slate-900">
                      <Money paise={payableAmount(candidate)} />
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="Payout history" />
        {payouts.length === 0 ? (
          <EmptyState
            title="No payouts yet"
            description="Your first payout appears here once earnings clear the dispute window."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {payouts.map((payout) => (
              <li
                key={payout.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    {new Date(payout.period_start).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                    })}{' '}
                    –{' '}
                    {new Date(payout.period_end).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {payout.processed_at
                      ? `Sent ${new Date(payout.processed_at).toLocaleDateString('en-IN')}`
                      : 'Not sent yet'}
                    {payout.provider_payout_id ? ` · ${payout.provider_payout_id}` : ''}
                  </p>
                  {payout.failure_reason ? (
                    <p className="mt-1 text-xs text-red-700">{payout.failure_reason}</p>
                  ) : null}
                </div>

                <div className="flex items-center gap-3">
                  <Badge
                    tone={
                      payout.status === 'paid'
                        ? 'success'
                        : payout.status === 'failed'
                          ? 'danger'
                          : 'warning'
                    }
                  >
                    {payout.status}
                  </Badge>
                  <span className="text-sm font-medium tabular-nums text-slate-900">
                    <Money paise={Number(payout.amount)} />
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
