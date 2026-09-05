import { describe, expect, it } from 'vitest';
import {
  disputeWindowClosesAt,
  isPayoutEligible,
  isWithinDisputeWindow,
  nextPayoutRun,
  payoutIneligibleReason,
  summarisePayout,
  type PayoutCandidate,
} from '../payouts';
import { rupeesToPaise } from '../money';
import { holdExpiresAt, holdSecondsRemaining, isHoldActive } from '../holds';

const END = new Date('2026-09-06T12:00:00Z');

function candidate(overrides: Partial<PayoutCandidate> = {}): PayoutCandidate {
  return {
    bookingId: 'b1',
    status: 'completed',
    endTime: END,
    completedAt: END,
    hostPayout: rupeesToPaise(120),
    hasOpenDispute: false,
    alreadyPaidOut: false,
    ...overrides,
  };
}

const hoursAfterEnd = (h: number) => new Date(END.getTime() + h * 3_600_000);

describe('dispute window (A11)', () => {
  it('closes 48 hours after the booking ends', () => {
    expect(disputeWindowClosesAt(END).toISOString()).toBe('2026-09-08T12:00:00.000Z');
  });

  it('is open right up to the boundary and closed on it', () => {
    expect(isWithinDisputeWindow(END, hoursAfterEnd(47.9))).toBe(true);
    expect(isWithinDisputeWindow(END, hoursAfterEnd(48))).toBe(false);
  });
});

describe('payout eligibility (A11)', () => {
  it('holds a booking until the dispute window closes', () => {
    expect(payoutIneligibleReason(candidate(), hoursAfterEnd(24))).toBe('dispute_window_open');
    expect(isPayoutEligible(candidate(), hoursAfterEnd(24))).toBe(false);
  });

  it('releases it once the window has closed', () => {
    expect(isPayoutEligible(candidate(), hoursAfterEnd(49))).toBe(true);
  });

  it('never pays out a booking with an open dispute, however old', () => {
    const disputed = candidate({ hasOpenDispute: true });
    expect(payoutIneligibleReason(disputed, hoursAfterEnd(24 * 30))).toBe('dispute_open');
  });

  it('reports the dispute ahead of the window, since it is the more useful message', () => {
    const disputed = candidate({ hasOpenDispute: true });
    expect(payoutIneligibleReason(disputed, hoursAfterEnd(1))).toBe('dispute_open');
  });

  it('never pays a booking twice', () => {
    expect(payoutIneligibleReason(candidate({ alreadyPaidOut: true }), hoursAfterEnd(72))).toBe(
      'already_paid_out',
    );
  });

  it('never pays a booking that is not completed', () => {
    expect(payoutIneligibleReason(candidate({ status: 'cancelled' }), hoursAfterEnd(72))).toBe(
      'not_completed',
    );
  });
});

describe('summarisePayout (A12)', () => {
  const settled = hoursAfterEnd(72);

  it('pays out once the balance clears the minimum', () => {
    // 2 x Rs 120 = Rs 240, above the Rs 200 minimum.
    const summary = summarisePayout(
      [candidate({ bookingId: 'a' }), candidate({ bookingId: 'b' })],
      settled,
    );

    expect(summary.eligibleCount).toBe(2);
    expect(summary.eligibleAmount).toBe(rupeesToPaise(240));
    expect(summary.isDue).toBe(true);
    expect(summary.heldBackReason).toBeNull();
  });

  it('carries a sub-minimum balance forward rather than paying a transfer fee', () => {
    const summary = summarisePayout([candidate({ hostPayout: rupeesToPaise(60) })], settled);

    expect(summary.eligibleAmount).toBe(rupeesToPaise(60));
    expect(summary.isDue).toBe(false);
    expect(summary.heldBackReason).toBe('below_minimum');
  });

  it('forces a sub-minimum payout once it has waited past the age limit', () => {
    // Same Rs 60 balance, but 31 days later - nothing may be stuck indefinitely.
    const summary = summarisePayout(
      [candidate({ hostPayout: rupeesToPaise(60) })],
      new Date(END.getTime() + 31 * 86_400_000),
    );

    expect(summary.isDue).toBe(true);
    expect(summary.heldBackReason).toBeNull();
  });

  it('shows earnings inside the dispute window as pending, not missing', () => {
    const summary = summarisePayout([candidate()], hoursAfterEnd(2));

    expect(summary.eligibleAmount).toBe(0);
    expect(summary.pendingAmount).toBe(rupeesToPaise(120));
    expect(summary.pendingCount).toBe(1);
    expect(summary.isDue).toBe(false);
  });

  it('excludes cancelled bookings from earnings entirely', () => {
    const summary = summarisePayout([candidate({ status: 'cancelled' })], settled);

    expect(summary.eligibleAmount).toBe(0);
    expect(summary.pendingAmount).toBe(0);
    expect(summary.eligibleCount).toBe(0);
    expect(summary.pendingCount).toBe(0);
  });

  it('excludes an already-paid booking from both totals', () => {
    const summary = summarisePayout([candidate({ alreadyPaidOut: true })], settled);
    expect(summary.eligibleAmount).toBe(0);
    expect(summary.pendingAmount).toBe(0);
  });
});

describe('nextPayoutRun (A12)', () => {
  it('runs on Monday and Thursday', () => {
    // 2026-09-06 is a Sunday, so the next run is Monday the 7th.
    expect(nextPayoutRun(new Date('2026-09-06T12:00:00Z')).getUTCDay()).toBe(1);
    // From Monday, the next is Thursday.
    expect(nextPayoutRun(new Date('2026-09-07T12:00:00Z')).getUTCDay()).toBe(4);
    // From Thursday, the next is the following Monday.
    expect(nextPayoutRun(new Date('2026-09-10T12:00:00Z')).getUTCDay()).toBe(1);
  });

  it('keeps every booking inside the seven-day target from spec section 3', () => {
    // The worst case is a booking completing just after a run: its dispute window closes two
    // days later, and it waits for the run after that.
    for (let day = 0; day < 7; day++) {
      const completedAt = new Date(Date.UTC(2026, 8, 7 + day, 12, 0, 0));
      const eligibleAt = disputeWindowClosesAt(completedAt);
      const paidAt = nextPayoutRun(eligibleAt);
      const days = (paidAt.getTime() - completedAt.getTime()) / 86_400_000;

      expect(days).toBeLessThanOrEqual(7);
    }
  });
});

describe('checkout holds (A10)', () => {
  const created = new Date('2026-09-05T10:00:00Z');

  it('holds the slot for 10 minutes', () => {
    expect(holdExpiresAt(created).toISOString()).toBe('2026-09-05T10:10:00.000Z');
  });

  it('is active before expiry and lapsed after', () => {
    const expires = holdExpiresAt(created);
    expect(isHoldActive(expires, new Date('2026-09-05T10:09:59Z'))).toBe(true);
    expect(isHoldActive(expires, new Date('2026-09-05T10:10:01Z'))).toBe(false);
  });

  it('treats a null hold as inactive, so a confirmed booking never looks provisional', () => {
    expect(isHoldActive(null, created)).toBe(false);
    expect(holdSecondsRemaining(null, created)).toBe(0);
  });

  it('counts down and floors at zero', () => {
    const expires = holdExpiresAt(created);
    expect(holdSecondsRemaining(expires, created)).toBe(600);
    expect(holdSecondsRemaining(expires, new Date('2026-09-05T10:20:00Z'))).toBe(0);
  });
});
