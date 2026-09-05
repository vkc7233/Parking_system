/**
 * Booking state machine (assumption A9).
 *
 * The database enforces these transitions with a trigger as well; this module exists so the
 * UI and edge functions can reason about legality without a round trip, and so the two
 * definitions can be tested against each other.
 */
export const BOOKING_STATUSES = [
  'pending_payment',
  'confirmed',
  'completed',
  'cancelled',
  'payment_failed',
] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];

/** Adjacency list of legal transitions. Terminal states map to an empty array. */
const TRANSITIONS: Record<BookingStatus, readonly BookingStatus[]> = {
  pending_payment: ['confirmed', 'payment_failed', 'cancelled'],
  confirmed: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
  payment_failed: [],
};

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: BookingStatus, to: BookingStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Illegal booking transition: ${from} -> ${to}`);
  }
}

/** Statuses that occupy a slot and therefore count against a listing's capacity (A4). */
export const SLOT_OCCUPYING_STATUSES: readonly BookingStatus[] = [
  'pending_payment',
  'confirmed',
  'completed',
];

/** A booking in one of these states is finished and can never change again. */
export function isTerminal(status: BookingStatus): boolean {
  return TRANSITIONS[status].length === 0;
}

/** §7.1 — the rating prompt appears only after the booking's end time has passed. */
export function canBeReviewed(status: BookingStatus, endTime: Date, now = new Date()): boolean {
  return status === 'completed' && now.getTime() >= endTime.getTime();
}
