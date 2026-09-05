import { describe, expect, it } from 'vitest';
import {
  assertTransition,
  canBeReviewed,
  canTransition,
  isTerminal,
  SLOT_OCCUPYING_STATUSES,
} from '../booking-state';

describe('booking state machine (A9)', () => {
  it('allows the happy path', () => {
    expect(canTransition('pending_payment', 'confirmed')).toBe(true);
    expect(canTransition('confirmed', 'completed')).toBe(true);
  });

  it('forbids confirming a booking that never took payment', () => {
    expect(canTransition('payment_failed', 'confirmed')).toBe(false);
    expect(() => assertTransition('payment_failed', 'confirmed')).toThrow(/Illegal/);
  });

  it('forbids resurrecting a terminal booking', () => {
    for (const status of ['completed', 'cancelled', 'payment_failed'] as const) {
      expect(isTerminal(status)).toBe(true);
      expect(canTransition(status, 'confirmed')).toBe(false);
    }
  });

  it('counts an unpaid pending booking against capacity so the slot is held (A4)', () => {
    expect(SLOT_OCCUPYING_STATUSES).toContain('pending_payment');
    expect(SLOT_OCCUPYING_STATUSES).not.toContain('cancelled');
  });
});

describe('canBeReviewed (spec 7.1)', () => {
  const end = new Date('2026-09-06T12:00:00Z');

  it('is false before the booking end time', () => {
    expect(canBeReviewed('completed', end, new Date('2026-09-06T11:00:00Z'))).toBe(false);
  });

  it('is true once the end time has passed', () => {
    expect(canBeReviewed('completed', end, new Date('2026-09-06T12:00:01Z'))).toBe(true);
  });

  it('is false for a cancelled booking', () => {
    expect(canBeReviewed('cancelled', end, new Date('2026-09-07T00:00:00Z'))).toBe(false);
  });
});
