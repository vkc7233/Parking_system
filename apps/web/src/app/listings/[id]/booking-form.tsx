'use client';

import Link from 'next/link';
import { useActionState, useEffect, useMemo, useState, useTransition } from 'react';
import { BOOKING, CHECKOUT } from '@parking/config';
import { formatPaise } from '@parking/core';
import { Button, Field, FormError, Input, Select } from '@parking/ui';
import { createBooking, type BookingActionState } from '@/app/bookings/actions';
import { quoteForListing, type QuoteResult } from './quote-actions';

const initialState: BookingActionState = {};

/**
 * Slot selection and price preview (spec §6.1 step 4, §7.1).
 *
 * The total is quoted by the server on every change, never computed here. §6.1 requires the
 * Seeker to see the total including the platform fee before they commit, and the only way that
 * number can be trustworthy is if it comes from the same code that will charge them.
 */

/** Whole and half hours up to the maximum, which is what a 30-minute slot size allows (A7). */
const DURATIONS = [1, 1.5, 2, 3, 4, 6, 8, 12, 24].filter(
  (h) => h * 60 >= BOOKING.minDurationMinutes && h * 60 <= BOOKING.maxDurationMinutes,
);

function toLocalInputValue(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

/** Rounds up to the next slot boundary. */
function nextSlot(from: Date) {
  const ms = BOOKING.slotMinutes * 60_000;
  return new Date(Math.ceil(from.getTime() / ms) * ms);
}

/**
 * The earliest selectable time, and it MUST be slot-aligned.
 *
 * A datetime-local input computes `step` alignment relative to `min`, not to midnight. With an
 * unaligned min - the raw current time, say 15:08 - a step of 30 minutes makes the valid values
 * 15:08, 15:38, 16:08... so every sensible :00 or :30 time fails constraint validation. The form
 * then refuses to submit, silently, with no error anywhere: requestSubmit() and a real click both
 * just do nothing. Aligning min to the same grid as the values is what makes the form submittable
 * at all.
 */
function earliestStart() {
  return nextSlot(new Date());
}

/** A little ahead of the earliest slot, so the default is realistic rather than immediate. */
function defaultStart() {
  return nextSlot(new Date(Date.now() + 15 * 60_000));
}

export function BookingForm({
  listingId,
  isSignedIn,
  isOwnListing,
}: {
  listingId: string;
  isSignedIn: boolean;
  isOwnListing: boolean;
}) {
  const [state, action, submitting] = useActionState(createBooking, initialState);

  const [startLocal, setStartLocal] = useState(() => toLocalInputValue(defaultStart()));
  // Fixed at mount: recomputing it on every render would move the constraint under the user
  // mid-interaction, and re-invalidate a time they had already picked.
  const [minStart] = useState(() => toLocalInputValue(earliestStart()));
  const [hours, setHours] = useState(2);
  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [isQuoting, startQuoting] = useTransition();

  // Memoised on the primitives so the quoting effect below has a stable dependency list.
  const { start, end, valid } = useMemo(() => {
    const from = new Date(startLocal);
    return {
      start: from,
      end: new Date(from.getTime() + hours * 60 * 60_000),
      valid: !Number.isNaN(from.getTime()),
    };
  }, [startLocal, hours]);

  useEffect(() => {
    if (!valid) return;

    // Debounced: the picker fires on every keystroke of a datetime input.
    const timer = setTimeout(() => {
      startQuoting(async () => {
        setQuote(await quoteForListing(listingId, start.toISOString(), end.toISOString()));
      });
    }, 300);

    return () => clearTimeout(timer);
    // Depends on the raw inputs rather than the derived Date objects: `start` and `end` are new
    // instances on every render, so including them would re-quote in a loop.
  }, [listingId, startLocal, hours, valid, start, end]);

  if (isOwnListing) {
    return (
      <p className="rounded-md bg-slate-100 px-3 py-2.5 text-sm text-slate-600">
        This is your own listing. Manage it from{' '}
        <Link href="/host" className="font-medium underline underline-offset-4">
          My listings
        </Link>
        .
      </p>
    );
  }

  const breakdown = quote?.ok ? quote.breakdown : undefined;

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="listingId" value={listingId} />
      <input type="hidden" name="startTime" value={valid ? start.toISOString() : ''} />
      <input type="hidden" name="endTime" value={valid ? end.toISOString() : ''} />

      <Field htmlFor="startTime" label="Arriving" required>
        <Input
          id="startTime"
          type="datetime-local"
          value={startLocal}
          min={minStart}
          step={BOOKING.slotMinutes * 60}
          onChange={(e) => setStartLocal(e.target.value)}
          required
        />
      </Field>

      <Field htmlFor="duration" label="For how long" required>
        <Select
          id="duration"
          value={String(hours)}
          onChange={(e) => setHours(Number(e.target.value))}
        >
          {DURATIONS.map((h) => (
            <option key={h} value={h}>
              {h === 24 ? '1 day' : h === 1 ? '1 hour' : `${h} hours`}
            </option>
          ))}
        </Select>
      </Field>

      {breakdown ? (
        <dl className="space-y-1.5 border-t border-slate-100 pt-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-600">
              {breakdown.billableMinutes / 60} hour
              {breakdown.billableMinutes === 60 ? '' : 's'}
              {breakdown.dailyCapApplied ? ' (daily cap applied)' : ''}
            </dt>
            <dd className="text-slate-900">{formatPaise(breakdown.subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-600">Service fee</dt>
            <dd className="text-slate-900">{formatPaise(breakdown.serviceFee)}</dd>
          </div>
          {breakdown.tax > 0 ? (
            <div className="flex justify-between">
              <dt className="text-slate-600">Tax</dt>
              <dd className="text-slate-900">{formatPaise(breakdown.tax)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between border-t border-slate-100 pt-1.5 text-base font-semibold">
            <dt className="text-slate-900">Total</dt>
            <dd className="text-slate-900">{formatPaise(breakdown.total)}</dd>
          </div>
        </dl>
      ) : null}

      {isQuoting ? <p className="text-xs text-slate-500">Checking availability…</p> : null}

      {quote && !quote.ok && quote.error ? <FormError>{quote.error}</FormError> : null}
      {state.error ? <FormError>{state.error}</FormError> : null}

      {quote?.ok && quote.slotsLeft === 1 ? (
        <p className="text-xs font-medium text-amber-800">Only one space left at this time.</p>
      ) : null}

      {isSignedIn ? (
        <Button type="submit" full disabled={submitting || !quote?.ok || isQuoting}>
          {submitting ? 'Holding your space…' : 'Book and pay'}
        </Button>
      ) : (
        <Link
          href={`/login?next=${encodeURIComponent('/listings/' + listingId)}`}
          className="block w-full rounded-md bg-slate-900 px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-slate-800"
        >
          Sign in to book
        </Link>
      )}

      <p className="text-xs text-slate-500">
        You are not charged until you complete payment. Your slot is held for {CHECKOUT.holdMinutes}{' '}
        minutes while you pay.
      </p>
    </form>
  );
}
