/**
 * Product analytics adapter (spec §7.4, §9.6).
 *
 * §7.4's acceptance criterion is that "every funnel step in Section 3's metrics has a
 * corresponding tracked event". §3 measures six things, and each one is a named event below:
 *
 *   live listings in the pilot city       -> listing_submitted, listing_approved
 *   completed paid bookings               -> payment_completed
 *   booking-to-payment completion rate    -> booking_started / payment_completed
 *   repeat booking rate                   -> payment_completed, grouped by user
 *   host payout cycle time                -> payment_completed -> payout_processed
 *   average rating                        -> review_submitted
 *
 * The event names are a closed union rather than free strings. A funnel computed from events
 * is only as good as the spelling: one `bookingStarted` among a million `booking_started` and
 * the completion rate is quietly wrong, with nothing failing anywhere to say so.
 *
 * Behind an interface for the same reason as the other vendors (§9.6): the analytics vendor is
 * the one most likely to be swapped, and it must never be able to break a booking.
 */

export type AnalyticsEvent =
  /** A phone number completed OTP verification for the first time. */
  | 'signup_completed'
  | 'search_performed'
  | 'listing_viewed'
  /** A booking row exists and the seeker is being asked to pay. The funnel denominator. */
  | 'booking_started'
  /** Payment verified server-side and the booking confirmed. The funnel numerator. */
  | 'payment_completed'
  | 'booking_cancelled'
  | 'access_pass_scanned'
  | 'review_submitted'
  | 'listing_submitted'
  | 'listing_approved'
  | 'dispute_raised'
  | 'payout_processed';

/**
 * Properties carried with an event.
 *
 * Deliberately primitive-only. Nested objects are where personal data ends up in an analytics
 * vendor by accident — someone passes the whole booking row "for context" and the seeker's
 * phone number leaves the country. Callers must name each field they send.
 */
export type AnalyticsProperties = Record<string, string | number | boolean | null>;

export interface AnalyticsAdapter {
  readonly name: string;

  /**
   * Records one event.
   *
   * `distinctId` is the platform user id, or an anonymous id for a signed-out seeker. Never a
   * phone number: it would make the analytics vendor a second copy of the user directory.
   */
  capture(input: {
    distinctId: string;
    event: AnalyticsEvent;
    properties?: AnalyticsProperties;
    timestamp?: Date;
  }): Promise<void>;

  /** Attaches durable traits to a user, so funnels can be split by role or city. */
  identify(input: { distinctId: string; traits: AnalyticsProperties }): Promise<void>;
}

export class AnalyticsAdapterError extends Error {
  constructor(
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'AnalyticsAdapterError';
  }
}
