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
  /*
   * How far from the centre still counts as "in Pune" for "use my location".
   *
   * Wider than the search radius on purpose. Pune's parking pressure extends to the IT corridors
   * - Hinjewadi and Wagholi are 17-20 km out - and a seeker standing there is exactly who this
   * pilot is for. 35 km keeps them in while still turning away someone in Lonavala or Mumbai,
   * who would otherwise be shown an empty results page that reads as a broken product.
   */
  serviceAreaRadiusMeters: 35_000,
  defaultMapZoom: 13,
} as const;

/**
 * The Pune areas offered as one-tap destinations on the search screen.
 *
 * A product decision, not map data: these are the micro-markets §16 says the pilot lives or
 * dies on - the IT corridors, the commercial cores, the eating-out districts and the transit
 * hubs - so they are the destinations worth putting in front of a Seeker before they type.
 * The geocoder still answers for everywhere else in Pune.
 *
 * Ordered by how often a driver in Pune actually gives up looking for a space.
 */
export const PILOT_DESTINATIONS = [
  {
    slug: 'koregaon-park',
    name: 'Koregaon Park',
    blurb: 'Restaurants and nightlife',
    center: { lat: 18.5362, lng: 73.8939 },
  },
  {
    slug: 'camp',
    name: 'Camp / MG Road',
    blurb: 'Shopping and offices',
    center: { lat: 18.5158, lng: 73.879 },
  },
  {
    slug: 'baner',
    name: 'Baner',
    blurb: 'Offices and restaurants',
    center: { lat: 18.559, lng: 73.7868 },
  },
  {
    slug: 'hinjewadi',
    name: 'Hinjewadi',
    blurb: 'IT park',
    center: { lat: 18.5913, lng: 73.7389 },
  },
  {
    slug: 'deccan',
    name: 'Deccan / FC Road',
    blurb: 'Colleges and shopping',
    center: { lat: 18.5164, lng: 73.8416 },
  },
  {
    slug: 'viman-nagar',
    name: 'Viman Nagar',
    blurb: 'Airport and malls',
    center: { lat: 18.5679, lng: 73.9143 },
  },
  {
    slug: 'kharadi',
    name: 'Kharadi',
    blurb: 'IT park',
    center: { lat: 18.5515, lng: 73.9497 },
  },
  {
    slug: 'pune-station',
    name: 'Pune Station',
    blurb: 'Rail and bus',
    center: { lat: 18.5286, lng: 73.8743 },
  },
] as const;

/**
 * How a Seeker or Host reaches a human (spec §7.1 "Basic support contact").
 *
 * WhatsApp rather than a ticket form, because §9.5 already routes notifications through a
 * WhatsApp Business number and that is where an Indian user expects support to be. §7.1's
 * criterion is that "a submitted query reaches Admin within 5 minutes" — a message to a monitored
 * WhatsApp number does; an email inbox nobody has agreed to watch does not.
 *
 * The number comes from the environment, because it is not known until the WhatsApp Business
 * account is provisioned (§13) and it must not be a code change on the day it is. Unset, it falls
 * back to the placeholder below — and `assertSupportContactConfigured` refuses to boot a
 * production build still using it, so "we forgot to change the support number" cannot be
 * something a customer discovers for us.
 */

/** Recognisable on sight, and never a real number. Exported so the boot check can detect it. */
export const PLACEHOLDER_SUPPORT_NUMBER = '919000000000';

export const SUPPORT = {
  /** E.164 without the '+', which is the format wa.me expects. */
  whatsappNumber: readSupportNumber(),
  email: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'support@example.com',
  /** Published response expectation, shown next to the link so nobody waits blind. */
  respondsWithin: 'within a few hours, 9am–9pm',
} as const;

/**
 * Read from `NEXT_PUBLIC_SUPPORT_WHATSAPP`, tolerating how people actually type a phone number.
 *
 * `+91 90000 00000`, `+919000000000` and `919000000000` are the same number; wa.me accepts only
 * the last form. Normalising here rather than asking whoever sets the variable to know that is
 * the difference between a support link that works and one that opens an empty chat.
 */
function readSupportNumber(): string {
  /*
   * Dot notation, not `process.env['...']`, and it matters.
   *
   * Next substitutes NEXT_PUBLIC_ variables into the client bundle by matching the literal text
   * `process.env.NEXT_PUBLIC_X`. Bracket access is not substituted — the server would read the
   * real number and the browser would silently fall back to the placeholder, which is the exact
   * failure this whole mechanism exists to prevent.
   */
  return normaliseSupportNumber(process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP);
}

/**
 * `+91 98220 11223`, `+919822011223` and `9822011223` are the same number; wa.me accepts only
 * the last shape, digits and nothing else. Normalising here rather than expecting whoever pastes
 * the number into a hosting dashboard to know that is the difference between a support link that
 * opens a chat and one that opens nothing.
 *
 * Anything unusable falls back to the placeholder, which the production boot check then refuses —
 * a typo that leaves no digits should stop a deploy, not quietly ship a broken link.
 */
export function normaliseSupportNumber(raw: string | undefined): string {
  if (!raw) return PLACEHOLDER_SUPPORT_NUMBER;

  const digits = raw.replace(/\D/g, '');
  if (!digits) return PLACEHOLDER_SUPPORT_NUMBER;

  // A bare 10-digit Indian mobile is the most likely thing to be pasted in.
  return digits.length === 10 ? `91${digits}` : digits;
}

/** True while the support link still points at nobody. */
export function supportContactIsPlaceholder(): boolean {
  return SUPPORT.whatsappNumber === PLACEHOLDER_SUPPORT_NUMBER;
}

/** A wa.me link that opens a chat with a message already typed. */
export function supportWhatsAppUrl(prefill?: string): string {
  const base = `https://wa.me/${SUPPORT.whatsappNumber}`;
  return prefill ? `${base}?text=${encodeURIComponent(prefill)}` : base;
}

export type PilotDestination = (typeof PILOT_DESTINATIONS)[number];

/** The one-tap destination with this slug, or null. Used to resolve `?place=` on search. */
export function findPilotDestination(slug: string | undefined): PilotDestination | null {
  if (!slug) return null;
  return PILOT_DESTINATIONS.find((d) => d.slug === slug) ?? null;
}

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
