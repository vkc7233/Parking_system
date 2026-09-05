/**
 * Single source of truth for every value the MVP specification left unspecified.
 *
 * Each constant below maps to a numbered item in `docs/ASSUMPTIONS.md`. Change a value here
 * and the whole platform follows; no business logic reads a hard-coded number.
 */

/** A1 — Platform fee. */
export const FEE = {
  /** Basis points. 1500 = 15.00%. */
  serviceFeeBps: 1500,
  /**
   * 'seeker' — fee is added on top of the host's price and shown as its own checkout line;
   *            the host is paid their full listed price.
   * 'host'   — booking total equals the host's price and the fee is deducted at payout.
   */
  feeBearer: 'seeker' as 'seeker' | 'host',
  /** A1 LEGAL — GST on the service fee is not modelled. 0 until counsel confirms treatment. */
  taxBps: 0,
} as const;

/** A2 — Cancellation & refund policy. Tiers are evaluated top-down on hours before start. */
export const CANCELLATION = {
  tiers: [
    { minHoursBeforeStart: 6, refundBookingBps: 10_000, refundFeeBps: 10_000 },
    { minHoursBeforeStart: 1, refundBookingBps: 5_000, refundFeeBps: 0 },
    { minHoursBeforeStart: 0, refundBookingBps: 0, refundFeeBps: 0 },
  ],
  /** Host-initiated and admin dispute resolutions always refund in full. */
  hostCancellationRefundBps: 10_000,
  adminResolutionRefundBps: 10_000,
} as const;

/** A3 — Hourly charging with a daily cap. */
export const PRICING = {
  /** Billable hours are rounded up to this many minutes. Must equal BOOKING.slotMinutes. */
  roundUpToMinutes: 30,
  /** Cap the charge for any rolling 24h window at the listing's price_per_day, when set. */
  applyDailyCap: true,
  dailyCapWindowHours: 24,
} as const;

/** A4 — Capacity-aware concurrency. capacity=1 reproduces the spec's no-double-booking rule. */
export const CAPACITY = {
  defaultCapacity: 1,
  maxCapacity: 20,
} as const;

/** A5 — Digital access pass. */
export const ACCESS_PASS = {
  /** Human-typable fallback when a QR cannot be scanned. Excludes I/O/0/1 to avoid misreads. */
  referenceLength: 8,
  referenceAlphabet: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
  /** Pass stays valid from this long before the booking start... */
  validFromMinutesBeforeStart: 30,
  /** ...until this long after its end. */
  validUntilMinutesAfterEnd: 60,
} as const;

/** A6 — Host Listing Agreement. Bump `version` whenever the agreement text changes. */
export const AGREEMENT = {
  version: '2026-09-v1',
} as const;

/** A7 — Booking granularity. */
export const BOOKING = {
  slotMinutes: 30,
  minDurationMinutes: 60,
  maxDurationMinutes: 7 * 24 * 60,
  /** Gap enforced between consecutive bookings on the same slot. */
  bufferMinutes: 0,
  /** How far ahead a seeker may book. */
  maxAdvanceDays: 90,
} as const;

/** A8 — Pilot city. Drives map centring and geocoding bias only. */
export const PILOT_CITY = {
  name: 'Ahmedabad',
  state: 'Gujarat',
  countryCode: 'IN',
  center: { lat: 23.0225, lng: 72.5714 },
  defaultSearchRadiusMeters: 3_000,
  maxSearchRadiusMeters: 25_000,
  defaultMapZoom: 13,
} as const;

/** A9 — Cross-cutting engineering defaults. */
export const PLATFORM = {
  currency: 'INR',
  /** Display timezone. Storage is always UTC. */
  timezone: 'Asia/Kolkata',
  locale: 'en-IN',
  /** §6.2 — weekly host payout cycle. 1 = Monday. */
  payoutCycleDay: 1,
  /** §3 success metric — payout processed within 7 days of booking completion. */
  payoutTargetDays: 7,
  /** §7.2 — a listing cannot be submitted with fewer than this many photos. */
  minListingPhotos: 2,
  maxListingPhotos: 10,
} as const;
