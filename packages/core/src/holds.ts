/**
 * Checkout holds - implements assumption A10.
 *
 * An unpaid booking occupies capacity while the Seeker is at the payment screen; it has to, or
 * two people could pay for the same slot at once. The consequence is that it must also expire:
 * without a hold expiry, every abandoned checkout permanently removes a slot from the
 * marketplace, and on a capacity-1 listing one abandoned checkout takes the listing off the
 * market for good.
 *
 * Mirrors `set_booking_hold` and `expire_unpaid_bookings` in the database.
 */
import { CHECKOUT } from '@parking/config';

/** When a booking created now stops holding its slot. */
export function holdExpiresAt(createdAt: Date = new Date()): Date {
  return new Date(createdAt.getTime() + CHECKOUT.holdMinutes * 60_000);
}

/** A lapsed hold frees the slot immediately, without waiting for the sweep to run. */
export function isHoldActive(expiresAt: Date | null, now: Date = new Date()): boolean {
  return expiresAt !== null && now < expiresAt;
}

/** Seconds left on a hold, floored at zero - drives the checkout countdown. */
export function holdSecondsRemaining(expiresAt: Date | null, now: Date = new Date()): number {
  if (expiresAt === null) return 0;
  return Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
}
