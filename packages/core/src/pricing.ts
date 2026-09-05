/**
 * Booking price quotation — implements assumptions A1 (platform fee), A3 (hourly charging
 * with a daily cap) and A7 (slot granularity). See docs/ASSUMPTIONS.md.
 *
 * This is the single authority on what a booking costs. The checkout UI, the create-booking
 * edge function, and the payout calculation all quote through here, so a Seeker can never be
 * charged an amount the server did not compute.
 */
import { BOOKING, FEE, PRICING } from '@parking/config';
import { applyBps, assertValidAmount, type Paise } from './money';

export interface QuoteInput {
  startTime: Date;
  endTime: Date;
  pricePerHour: Paise;
  /** Null means the listing has no daily rate, so no cap applies. */
  pricePerDay: Paise | null;
}

export interface Quote {
  /** Wall-clock minutes between start and end. */
  durationMinutes: number;
  /** Duration rounded up to the slot increment — what the Seeker is actually charged for. */
  billableMinutes: number;
  /** The Host's share, before any fee treatment. */
  subtotal: Paise;
  /** True when the daily cap reduced the charge below the pure hourly total. */
  dailyCapApplied: boolean;
  /** What the hourly rate alone would have cost; equals subtotal when no cap applied. */
  uncappedSubtotal: Paise;
  serviceFee: Paise;
  tax: Paise;
  /** What the Seeker pays at checkout. */
  total: Paise;
  /** What the Host is owed once the booking completes. */
  hostPayout: Paise;
}

export class QuoteError extends Error {
  constructor(
    message: string,
    readonly code:
      'END_BEFORE_START' | 'BELOW_MINIMUM' | 'ABOVE_MAXIMUM' | 'TOO_FAR_AHEAD' | 'INVALID_PRICE',
  ) {
    super(message);
    this.name = 'QuoteError';
  }
}

/** Rounds a duration up to the next whole slot (A7). */
export function roundUpToSlot(minutes: number, slotMinutes = PRICING.roundUpToMinutes): number {
  return Math.ceil(minutes / slotMinutes) * slotMinutes;
}

/** Charge for a stretch of minutes at an hourly rate, with no cap. */
function hourlyCharge(minutes: number, pricePerHour: Paise): Paise {
  return Math.round((minutes / 60) * pricePerHour);
}

/**
 * Applies the daily cap (A3): the charge for each rolling 24-hour window is the lesser of the
 * hourly total for that window and the listing's daily rate.
 */
function chargeWithDailyCap(
  billableMinutes: number,
  pricePerHour: Paise,
  pricePerDay: Paise | null,
): { subtotal: Paise; uncapped: Paise } {
  const uncapped = hourlyCharge(billableMinutes, pricePerHour);
  if (!PRICING.applyDailyCap || pricePerDay === null) {
    return { subtotal: uncapped, uncapped };
  }

  const windowMinutes = PRICING.dailyCapWindowHours * 60;
  let remaining = billableMinutes;
  let subtotal = 0;

  while (remaining > 0) {
    const minutesInWindow = Math.min(windowMinutes, remaining);
    subtotal += Math.min(hourlyCharge(minutesInWindow, pricePerHour), pricePerDay);
    remaining -= minutesInWindow;
  }

  return { subtotal, uncapped };
}

/** Validates the requested window against A7's granularity rules. */
export function validateWindow(startTime: Date, endTime: Date, now: Date = new Date()): void {
  const durationMinutes = (endTime.getTime() - startTime.getTime()) / 60_000;

  if (durationMinutes <= 0) {
    throw new QuoteError('Booking end time must be after its start time.', 'END_BEFORE_START');
  }
  if (durationMinutes < BOOKING.minDurationMinutes) {
    throw new QuoteError(
      `Bookings must be at least ${BOOKING.minDurationMinutes} minutes.`,
      'BELOW_MINIMUM',
    );
  }
  if (durationMinutes > BOOKING.maxDurationMinutes) {
    throw new QuoteError(
      `Bookings cannot exceed ${BOOKING.maxDurationMinutes / (24 * 60)} days.`,
      'ABOVE_MAXIMUM',
    );
  }

  const advanceDays = (startTime.getTime() - now.getTime()) / (24 * 60 * 60_000);
  if (advanceDays > BOOKING.maxAdvanceDays) {
    throw new QuoteError(
      `Bookings cannot be made more than ${BOOKING.maxAdvanceDays} days ahead.`,
      'TOO_FAR_AHEAD',
    );
  }
}

/**
 * Produces the authoritative price for a booking window.
 *
 * @param now injected for deterministic testing of the advance-booking limit.
 */
export function quoteBooking(input: QuoteInput, now: Date = new Date()): Quote {
  const { startTime, endTime, pricePerHour, pricePerDay } = input;

  assertValidAmount(pricePerHour, 'pricePerHour');
  if (pricePerDay !== null) assertValidAmount(pricePerDay, 'pricePerDay');
  if (pricePerHour === 0 && (pricePerDay === null || pricePerDay === 0)) {
    throw new QuoteError('Listing has no usable price.', 'INVALID_PRICE');
  }

  validateWindow(startTime, endTime, now);

  const durationMinutes = (endTime.getTime() - startTime.getTime()) / 60_000;
  const billableMinutes = roundUpToSlot(durationMinutes);

  const { subtotal, uncapped } = chargeWithDailyCap(billableMinutes, pricePerHour, pricePerDay);

  // A1 — the fee is either added on top for the Seeker, or withheld from the Host at payout.
  const serviceFee = applyBps(subtotal, FEE.serviceFeeBps);
  const tax = applyBps(serviceFee, FEE.taxBps);

  const total = FEE.feeBearer === 'seeker' ? subtotal + serviceFee + tax : subtotal;
  const hostPayout = FEE.feeBearer === 'seeker' ? subtotal : subtotal - serviceFee;

  return {
    durationMinutes,
    billableMinutes,
    subtotal,
    dailyCapApplied: subtotal < uncapped,
    uncappedSubtotal: uncapped,
    serviceFee,
    tax,
    total,
    hostPayout,
  };
}
