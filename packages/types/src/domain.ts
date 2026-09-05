/**
 * Hand-written domain types shared by the web app, the Edge Functions, and (from Phase 2) the
 * mobile app. These describe the shapes crossing an API boundary, as opposed to the raw row
 * types in `database.types.ts`, which are generated.
 */

export type UserRole = 'seeker' | 'host' | 'admin';
export type KycStatus = 'not_started' | 'pending' | 'verified' | 'rejected';
export type ListingStatus = 'draft' | 'pending' | 'live' | 'paused' | 'rejected';
export type SpotType = 'open' | 'covered' | 'basement' | 'stilt' | 'garage' | 'driveway';
export type DocumentType = 'identity_proof' | 'address_proof' | 'bank_details';
export type VerificationStatus = 'pending' | 'verified' | 'rejected';
export type PaymentStatus =
  'created' | 'authorized' | 'captured' | 'failed' | 'refunded' | 'partially_refunded';
export type PayoutStatus = 'pending' | 'processing' | 'paid' | 'failed';
export type NotificationChannel = 'sms' | 'whatsapp' | 'email';

/** WGS84 coordinate pair, in the order every mapping SDK expects. */
export interface LatLng {
  lat: number;
  lng: number;
}

/** One row of the map/list search results (public.search_nearby_listings). */
export interface SearchResult {
  id: string;
  hostId: string;
  title: string;
  addressLine: string;
  locality: string | null;
  city: string;
  location: LatLng;
  distanceMeters: number;
  spotType: SpotType;
  capacity: number;
  /** Paise. */
  pricePerHour: number;
  /** Paise, or null when the listing has no daily cap. */
  pricePerDay: number | null;
  averageRating: number | null;
  reviewCount: number;
  primaryPhotoUrl: string | null;
  /** Remaining capacity for the searched window; equals `capacity` when no window was given. */
  availableSlots: number;
}

export interface SearchFilters {
  center: LatLng;
  radiusMeters: number;
  /** Optional booking window; when present, fully booked listings are excluded. */
  startTime?: Date;
  endTime?: Date;
  /** Paise. */
  minPricePerHour?: number;
  maxPricePerHour?: number;
  spotTypes?: SpotType[];
  limit?: number;
  offset?: number;
}

/** What the checkout screen shows before the Seeker commits. Mirrors core's `Quote`. */
export interface PriceBreakdown {
  durationMinutes: number;
  billableMinutes: number;
  subtotal: number;
  serviceFee: number;
  tax: number;
  total: number;
  dailyCapApplied: boolean;
  currency: 'INR';
}

/** The payload behind the QR code on the confirmation screen. */
export interface AccessPass {
  bookingId: string;
  reference: string;
  /** Signed token; the QR encodes this, and the Host's verify screen checks it. */
  token: string;
  listingTitle: string;
  addressLine: string;
  startTime: string;
  endTime: string;
  accessInstructions: string | null;
}

/** Errors an Edge Function can return to the client, as a discriminated code. */
export type ApiErrorCode =
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'validation_failed'
  | 'slot_unavailable'
  | 'listing_not_live'
  | 'payment_failed'
  | 'already_processed'
  | 'rate_limited'
  | 'internal_error';

export interface ApiError {
  code: ApiErrorCode;
  message: string;
  /** Field-level detail for `validation_failed`. */
  fields?: Record<string, string>;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };
