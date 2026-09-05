import { describe, expect, it } from 'vitest';
import { quoteBooking, QuoteError, roundUpToSlot } from '../pricing';
import { rupeesToPaise } from '../money';

const NOW = new Date('2026-09-05T10:00:00Z');
const at = (iso: string) => new Date(iso);

/** Rs 40/hour, Rs 300/day - a plausible pilot-city listing. */
const listing = { pricePerHour: rupeesToPaise(40), pricePerDay: rupeesToPaise(300) };

describe('roundUpToSlot', () => {
  it('leaves an exact slot boundary alone', () => {
    expect(roundUpToSlot(60)).toBe(60);
    expect(roundUpToSlot(90)).toBe(90);
  });

  it('rounds a partial slot up (A7)', () => {
    expect(roundUpToSlot(61)).toBe(90);
    expect(roundUpToSlot(119)).toBe(120);
  });
});

describe('quoteBooking - hourly charging (A3)', () => {
  it('charges the hourly rate for a whole number of hours', () => {
    const q = quoteBooking(
      { ...listing, startTime: at('2026-09-06T09:00:00Z'), endTime: at('2026-09-06T12:00:00Z') },
      NOW,
    );
    expect(q.billableMinutes).toBe(180);
    expect(q.subtotal).toBe(rupeesToPaise(120));
    expect(q.dailyCapApplied).toBe(false);
  });

  it('bills a partial slot as a full slot', () => {
    const q = quoteBooking(
      { ...listing, startTime: at('2026-09-06T09:00:00Z'), endTime: at('2026-09-06T10:10:00Z') },
      NOW,
    );
    expect(q.durationMinutes).toBe(70);
    expect(q.billableMinutes).toBe(90);
    expect(q.subtotal).toBe(rupeesToPaise(60));
  });
});

describe('quoteBooking - daily cap (A3)', () => {
  it('caps a long single-day booking at the daily rate', () => {
    const q = quoteBooking(
      { ...listing, startTime: at('2026-09-06T06:00:00Z'), endTime: at('2026-09-06T18:00:00Z') },
      NOW,
    );
    expect(q.uncappedSubtotal).toBe(rupeesToPaise(480));
    expect(q.subtotal).toBe(rupeesToPaise(300));
    expect(q.dailyCapApplied).toBe(true);
  });

  it('applies the cap per 24h window across a multi-day booking', () => {
    const q = quoteBooking(
      { ...listing, startTime: at('2026-09-06T00:00:00Z'), endTime: at('2026-09-08T00:00:00Z') },
      NOW,
    );
    expect(q.subtotal).toBe(rupeesToPaise(600));
  });

  it('leaves a short booking below the cap untouched', () => {
    const q = quoteBooking(
      { ...listing, startTime: at('2026-09-06T09:00:00Z'), endTime: at('2026-09-06T12:00:00Z') },
      NOW,
    );
    expect(q.subtotal).toBe(q.uncappedSubtotal);
  });

  it('charges purely hourly when the listing has no daily rate', () => {
    const q = quoteBooking(
      {
        pricePerHour: rupeesToPaise(40),
        pricePerDay: null,
        startTime: at('2026-09-06T06:00:00Z'),
        endTime: at('2026-09-06T18:00:00Z'),
      },
      NOW,
    );
    expect(q.subtotal).toBe(rupeesToPaise(480));
    expect(q.dailyCapApplied).toBe(false);
  });
});

describe('quoteBooking - platform fee (A1)', () => {
  it('adds a 15% seeker-borne fee on top and pays the host in full', () => {
    const q = quoteBooking(
      { ...listing, startTime: at('2026-09-06T09:00:00Z'), endTime: at('2026-09-06T12:00:00Z') },
      NOW,
    );
    expect(q.subtotal).toBe(rupeesToPaise(120));
    expect(q.serviceFee).toBe(rupeesToPaise(18));
    expect(q.total).toBe(rupeesToPaise(138));
    expect(q.hostPayout).toBe(rupeesToPaise(120));
  });

  it('keeps the arithmetic exact in integer paise', () => {
    const q = quoteBooking(
      {
        pricePerHour: 3333,
        pricePerDay: null,
        startTime: at('2026-09-06T09:00:00Z'),
        endTime: at('2026-09-06T10:00:00Z'),
      },
      NOW,
    );
    expect(Number.isInteger(q.serviceFee)).toBe(true);
    expect(q.total).toBe(q.subtotal + q.serviceFee + q.tax);
  });
});

describe('quoteBooking - window validation (A7)', () => {
  const window = { startTime: at('2026-09-06T09:00:00Z'), endTime: at('2026-09-06T09:30:00Z') };

  it('rejects a booking below the one-hour minimum', () => {
    expect(() => quoteBooking({ ...listing, ...window }, NOW)).toThrow(QuoteError);
  });

  it('rejects an end time before the start time', () => {
    expect(() =>
      quoteBooking(
        { ...listing, startTime: at('2026-09-06T12:00:00Z'), endTime: at('2026-09-06T09:00:00Z') },
        NOW,
      ),
    ).toThrow(/after its start/);
  });

  it('rejects a booking beyond the maximum duration', () => {
    expect(() =>
      quoteBooking(
        { ...listing, startTime: at('2026-09-06T00:00:00Z'), endTime: at('2026-09-20T00:00:00Z') },
        NOW,
      ),
    ).toThrow(/cannot exceed/);
  });

  it('rejects a booking too far in advance', () => {
    expect(() =>
      quoteBooking(
        { ...listing, startTime: at('2027-06-01T00:00:00Z'), endTime: at('2027-06-01T12:00:00Z') },
        NOW,
      ),
    ).toThrow(/days ahead/);
  });
});
