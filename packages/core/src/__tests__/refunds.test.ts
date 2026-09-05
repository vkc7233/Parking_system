import { describe, expect, it } from 'vitest';
import { calculateRefund } from '../refunds';
import { rupeesToPaise } from '../money';

/** A Rs 120 booking with the 15% seeker fee: Rs 138 charged in total. */
const charged = {
  subtotal: rupeesToPaise(120),
  serviceFee: rupeesToPaise(18),
  tax: 0,
  total: rupeesToPaise(138),
};

const START = new Date('2026-09-06T12:00:00Z');
const hoursBefore = (h: number) => new Date(START.getTime() - h * 3_600_000);

describe('calculateRefund - seeker cancellation tiers (A2)', () => {
  it('refunds in full outside the 6-hour window', () => {
    const r = calculateRefund({
      charged,
      bookingStartTime: START,
      cancelledAt: hoursBefore(8),
      cancelledBy: 'seeker',
    });
    expect(r.totalRefund).toBe(rupeesToPaise(138));
    expect(r.isFullRefund).toBe(true);
    expect(r.retained).toBe(0);
  });

  it('treats exactly 6 hours as inside the free window', () => {
    const r = calculateRefund({
      charged,
      bookingStartTime: START,
      cancelledAt: hoursBefore(6),
      cancelledBy: 'seeker',
    });
    expect(r.isFullRefund).toBe(true);
  });

  it('refunds half the booking and no fee between 1 and 6 hours', () => {
    const r = calculateRefund({
      charged,
      bookingStartTime: START,
      cancelledAt: hoursBefore(3),
      cancelledBy: 'seeker',
    });
    expect(r.bookingRefund).toBe(rupeesToPaise(60));
    expect(r.feeRefund).toBe(0);
    expect(r.totalRefund).toBe(rupeesToPaise(60));
    expect(r.retained).toBe(rupeesToPaise(78));
    expect(r.isFullRefund).toBe(false);
  });

  it('refunds nothing under an hour before start', () => {
    const r = calculateRefund({
      charged,
      bookingStartTime: START,
      cancelledAt: hoursBefore(0.5),
      cancelledBy: 'seeker',
    });
    expect(r.totalRefund).toBe(0);
  });

  it('refunds nothing after the booking has started', () => {
    const r = calculateRefund({
      charged,
      bookingStartTime: START,
      cancelledAt: new Date(START.getTime() + 3_600_000),
      cancelledBy: 'seeker',
    });
    expect(r.totalRefund).toBe(0);
    expect(r.reason).toMatch(/after the booking started/);
  });
});

describe('calculateRefund - host and admin overrides (A2)', () => {
  it('refunds a host cancellation in full however late it is', () => {
    const r = calculateRefund({
      charged,
      bookingStartTime: START,
      cancelledAt: hoursBefore(0.25),
      cancelledBy: 'host',
    });
    expect(r.totalRefund).toBe(charged.total);
    expect(r.isFullRefund).toBe(true);
  });

  it('refunds an admin resolution in full after the start time', () => {
    const r = calculateRefund({
      charged,
      bookingStartTime: START,
      cancelledAt: new Date(START.getTime() + 7_200_000),
      cancelledBy: 'admin',
    });
    expect(r.totalRefund).toBe(charged.total);
  });
});
