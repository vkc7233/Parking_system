/**
 * Cancellation refund calculation — implements assumption A2. See docs/ASSUMPTIONS.md.
 *
 * LEGAL: the tiers in @parking/config must stay in step with the published
 * Cancellation & Refund Policy page (spec §7.4).
 */
import { CANCELLATION } from '@parking/config';
import { applyBps, type Paise } from './money';
import type { Quote } from './pricing';

export type CancelledBy = 'seeker' | 'host' | 'admin';

export interface RefundInput {
  /** The amounts actually charged, as recorded on the booking. */
  charged: Pick<Quote, 'subtotal' | 'serviceFee' | 'tax' | 'total'>;
  bookingStartTime: Date;
  cancelledAt: Date;
  cancelledBy: CancelledBy;
}

export interface RefundBreakdown {
  hoursBeforeStart: number;
  /** Refunded portion of the Host's charge. */
  bookingRefund: Paise;
  /** Refunded portion of the platform's service fee (and its tax). */
  feeRefund: Paise;
  taxRefund: Paise;
  /** Total to return to the Seeker via Razorpay. */
  totalRefund: Paise;
  /** Amount retained by the platform and/or owed to the Host. */
  retained: Paise;
  /** True when the refund is a full one, which is what §7.1's acceptance criterion checks. */
  isFullRefund: boolean;
  reason: string;
}

/**
 * A host- or admin-initiated cancellation always refunds in full: the Seeker did nothing
 * wrong, so the timing tiers do not apply to them.
 */
function fullRefundBps(cancelledBy: CancelledBy): number | null {
  if (cancelledBy === 'host') return CANCELLATION.hostCancellationRefundBps;
  if (cancelledBy === 'admin') return CANCELLATION.adminResolutionRefundBps;
  return null;
}

export function calculateRefund(input: RefundInput): RefundBreakdown {
  const { charged, bookingStartTime, cancelledAt, cancelledBy } = input;

  const hoursBeforeStart = (bookingStartTime.getTime() - cancelledAt.getTime()) / 3_600_000;

  const override = fullRefundBps(cancelledBy);
  let bookingBps: number;
  let feeBps: number;
  let reason: string;

  if (override !== null) {
    bookingBps = override;
    feeBps = override;
    reason =
      cancelledBy === 'host'
        ? 'Cancelled by host — full refund'
        : 'Resolved by platform support — full refund';
  } else {
    // Tiers are ordered most-generous first; take the first the booking still qualifies for.
    const tier =
      CANCELLATION.tiers.find((t) => hoursBeforeStart >= t.minHoursBeforeStart) ??
      CANCELLATION.tiers[CANCELLATION.tiers.length - 1]!;

    bookingBps = tier.refundBookingBps;
    feeBps = tier.refundFeeBps;
    reason =
      hoursBeforeStart < 0
        ? 'Cancelled after the booking started'
        : `Cancelled ${hoursBeforeStart.toFixed(1)}h before start`;
  }

  const bookingRefund = applyBps(charged.subtotal, bookingBps);
  const feeRefund = applyBps(charged.serviceFee, feeBps);
  const taxRefund = applyBps(charged.tax, feeBps);
  const totalRefund = bookingRefund + feeRefund + taxRefund;

  return {
    hoursBeforeStart,
    bookingRefund,
    feeRefund,
    taxRefund,
    totalRefund,
    retained: charged.total - totalRefund,
    isFullRefund: totalRefund >= charged.total,
    reason,
  };
}
