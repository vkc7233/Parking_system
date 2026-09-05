/**
 * Payout eligibility and batching - implements assumptions A11 and A12.
 *
 * Mirrors `unpaid_host_earnings` and `host_payout_due` in the database. The duplication is
 * deliberate: the SQL is the guarantee (it is what the payout run actually reads), and this is
 * what the Host's Earnings screen and the Admin payout screen use to explain *why* a balance
 * is or is not being paid this cycle, without a round trip per booking.
 *
 * The two must agree. `payouts.test.ts` pins the arithmetic; if you change one, change both.
 */
import { DISPUTE, PAYOUT } from '@parking/config';
import type { Paise } from './money';

export interface PayoutCandidate {
  bookingId: string;
  /** Only 'completed' bookings can ever be paid. */
  status: string;
  endTime: Date;
  completedAt: Date | null;
  /** What the Host is owed, in paise. */
  hostPayout: Paise;
  hasOpenDispute: boolean;
  alreadyPaidOut: boolean;
}

export type IneligibleReason =
  'not_completed' | 'dispute_window_open' | 'dispute_open' | 'already_paid_out';

/** When the Seeker's window to raise a dispute closes, and the Host becomes payable (A11). */
export function disputeWindowClosesAt(bookingEndTime: Date): Date {
  return new Date(bookingEndTime.getTime() + DISPUTE.windowHoursAfterBookingEnd * 3_600_000);
}

export function isWithinDisputeWindow(bookingEndTime: Date, now: Date = new Date()): boolean {
  return now < disputeWindowClosesAt(bookingEndTime);
}

/**
 * Why a booking cannot be paid out yet, or null if it can.
 *
 * Order matters for the message the Host sees: an open dispute is more informative than
 * "the window has not closed", even though both are true while a dispute is live.
 */
export function payoutIneligibleReason(
  candidate: PayoutCandidate,
  now: Date = new Date(),
): IneligibleReason | null {
  if (candidate.alreadyPaidOut) return 'already_paid_out';
  if (candidate.status !== 'completed') return 'not_completed';
  if (candidate.hasOpenDispute) return 'dispute_open';
  if (isWithinDisputeWindow(candidate.endTime, now)) return 'dispute_window_open';
  return null;
}

export function isPayoutEligible(candidate: PayoutCandidate, now: Date = new Date()): boolean {
  return payoutIneligibleReason(candidate, now) === null;
}

export interface PayoutSummary {
  /** Sum of everything eligible right now. */
  eligibleAmount: Paise;
  eligibleCount: number;
  /** Earned but not yet payable - shown to the Host as pending, not hidden. */
  pendingAmount: Paise;
  pendingCount: number;
  oldestEligibleAt: Date | null;
  /** True when a transfer should actually be made this run (A12). */
  isDue: boolean;
  /** Present when eligible earnings exist but are below the minimum. */
  heldBackReason: 'below_minimum' | null;
}

/**
 * Decides whether a Host's accrued balance is worth transferring this run.
 *
 * A payout transfer costs a per-transaction fee, so settling a very small balance burns a
 * meaningful fraction of it. Carrying forward is not withholding - the money is still the
 * Host's and appears as pending - but a balance that has been waiting longer than
 * `forceOutAfterDays` is paid regardless, so nothing is ever stuck below the threshold.
 */
export function summarisePayout(
  candidates: PayoutCandidate[],
  now: Date = new Date(),
): PayoutSummary {
  let eligibleAmount = 0;
  let eligibleCount = 0;
  let pendingAmount = 0;
  let pendingCount = 0;
  let oldestEligibleAt: Date | null = null;

  for (const candidate of candidates) {
    if (candidate.alreadyPaidOut) continue;

    if (isPayoutEligible(candidate, now)) {
      eligibleAmount += candidate.hostPayout;
      eligibleCount += 1;

      const settledAt = candidate.completedAt ?? candidate.endTime;
      if (!oldestEligibleAt || settledAt < oldestEligibleAt) {
        oldestEligibleAt = settledAt;
      }
    } else if (candidate.status !== 'completed' && candidate.status !== 'confirmed') {
      // Cancelled or failed bookings are not earnings at all.
      continue;
    } else {
      pendingAmount += candidate.hostPayout;
      pendingCount += 1;
    }
  }

  const meetsMinimum = eligibleAmount >= PAYOUT.minimumPayout;
  const ageForcesPayout =
    oldestEligibleAt !== null &&
    now.getTime() - oldestEligibleAt.getTime() > PAYOUT.forceOutAfterDays * 86_400_000;

  const isDue = eligibleCount > 0 && (meetsMinimum || ageForcesPayout);

  return {
    eligibleAmount,
    eligibleCount,
    pendingAmount,
    pendingCount,
    oldestEligibleAt,
    isDue,
    heldBackReason: eligibleCount > 0 && !isDue ? 'below_minimum' : null,
  };
}

/**
 * The next date the payout job runs (A12).
 *
 * Hosts are told "weekly" - that is the published promise in the Host Listing Agreement - but
 * the job runs twice a week, because a 48-hour dispute hold on a strictly weekly run misses
 * the seven-day target in spec section 3 for bookings completing late in the week. Promising
 * weekly and delivering in three days is the right way round.
 */
export function nextPayoutRun(from: Date = new Date()): Date {
  // Widened from the config's literal tuple type so a day number can be tested against it.
  const runDays: number[] = [...PAYOUT.runDays].sort((a, b) => a - b);

  for (let offset = 1; offset <= 7; offset++) {
    const candidate = new Date(from);
    candidate.setUTCDate(candidate.getUTCDate() + offset);
    candidate.setUTCHours(0, 0, 0, 0);

    if (runDays.includes(candidate.getUTCDay())) return candidate;
  }

  // Unreachable while runDays is non-empty; keeps the return type honest.
  const fallback = new Date(from);
  fallback.setUTCDate(fallback.getUTCDate() + 7);
  return fallback;
}
