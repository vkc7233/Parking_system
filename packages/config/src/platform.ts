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

/**
 * A8 — Pilot city. Drives map centring, the geocoding viewport bias and search defaults.
 *
 * Pune. Centre is Shivajinagar, which sits between the old city and the western IT corridor, so
 * a default radius reaches both the Camp/MG Road commercial core and Deccan/Kothrud rather than
 * favouring one side.
 *
 * The 5km default is wider than a dense-core city would need: Pune's parking pressure is spread
 * across separated pockets — Koregaon Park, Baner, Hinjewadi, Viman Nagar, Magarpatta — rather
 * than concentrated in one centre, so a 3km radius from most destinations would return nothing.
 */
export const PILOT_CITY = {
  name: 'Pune',
  state: 'Maharashtra',
  countryCode: 'IN',
  center: { lat: 18.5308, lng: 73.8475 },
  defaultSearchRadiusMeters: 5_000,
  maxSearchRadiusMeters: 25_000,
  defaultMapZoom: 13,
} as const;

/** A9 — Cross-cutting engineering defaults. */
export const PLATFORM = {
  currency: 'INR',
  /** Display timezone. Storage is always UTC. */
  timezone: 'Asia/Kolkata',
  locale: 'en-IN',
  /** §7.2 — a listing cannot be submitted with fewer than this many photos. */
  minListingPhotos: 2,
  maxListingPhotos: 10,
} as const;

/**
 * A10 — How long an unpaid booking holds its slot.
 *
 * A pending_payment booking counts against capacity, so without an expiry every abandoned
 * checkout would remove a slot from the marketplace permanently.
 */
export const CHECKOUT = {
  holdMinutes: 10,
} as const;

/**
 * A11 — Dispute window, and the payout hold that depends on it.
 *
 * A booking is payout-eligible only once this window has closed with no dispute open, so any
 * refund the platform might owe is still in the platform's account when it owes it.
 */
export const DISPUTE = {
  windowHoursAfterBookingEnd: 48,
} as const;

/** A12 — Payout cycle, cadence and minimum. */
export const PAYOUT = {
  /** What Hosts are told, and what the Host Listing Agreement states (§6.2). */
  publishedCycle: 'weekly',
  /**
   * When the payout job actually runs. 1 = Monday, 4 = Thursday.
   *
   * Twice weekly rather than once, because a 48h dispute hold on a strictly weekly run misses
   * §3's seven-day target for bookings that complete late in the week.
   */
  runDays: [1, 4],
  /** §3 success metric — payout processed within 7 days of booking completion. */
  targetDays: 7,
  /** Paise. Balances below this carry to the next run rather than paying a transfer fee. */
  minimumPayout: 20_000,
  /** ...unless the oldest unpaid booking is older than this, so nothing is ever stuck. */
  forceOutAfterDays: 30,
} as const;

/** A13 — Host cancellation consequences and no-show treatment. */
export const HOST_CONDUCT = {
  /** Host cancellations within the rolling window before the listing is auto-paused. */
  cancellationLimit: 3,
  cancellationWindowDays: 90,
  /** A Seeker who never checks in is still charged: the Host held the space. */
  refundNoShows: false,
} as const;

/**
 * A14 — Which listing edits force re-approval.
 *
 * Material fields change what the Seeker is actually buying, so they go back through the
 * approval queue. Price and copy do not: routing a small price change through an Admin wastes
 * their day and teaches Hosts not to keep pricing current.
 */
export const LISTING_EDITS = {
  materialFields: ['location', 'address_line', 'spot_type', 'capacity', 'photos'],
  nonMaterialFields: [
    'title',
    'description',
    'rules',
    'price_per_hour',
    'price_per_day',
    'available_from',
    'available_until',
  ],
} as const;

/** A15 — Authentication limits. */
export const AUTH = {
  otpLength: 6,
  otpValidityMinutes: 10,
  otpMaxSendsPerHour: 5,
  otpResendCooldownSeconds: 30,
  otpMaxVerifyAttempts: 5,
  sessionDays: 30,
  /**
   * An Admin session can trigger payouts, suspend Hosts, and read KYC documents. A month-long
   * session on a shared or lost laptop is a different risk from a Seeker's.
   */
  adminSessionHours: 12,
} as const;

/** A16 — Review window and visibility. */
export const REVIEWS = {
  windowDaysAfterBookingEnd: 14,
  /** §3 tracks average rating; an average without its count misleads at pilot sample sizes. */
  alwaysShowCount: true,
  maxCommentLength: 1000,
} as const;

/** A17 — Data retention (§12, DPDP Act). */
export const RETENTION = {
  /** Longest plausible statutory period for books of account under Indian company law. */
  financialRecordYears: 8,
  kycDocumentYears: 8,
  notificationLogDays: 90,
  /** On an account-deletion request, anonymise the profile and keep the financial rows. */
  anonymiseOnDeletionRequest: true,
} as const;
