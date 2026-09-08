'use client';

import { useActionState } from 'react';
import { Button, Field, FormError, FormSuccess, Textarea } from '@parking/ui';
import { submitReview, type ReviewState } from './review-actions';

const initialState: ReviewState = {};

/**
 * Rate and review (spec §7.1).
 *
 * The prompt only ever renders after the booking's end time has passed, which the page checks
 * with `canBeReviewed` and the database enforces with a trigger. Reviews close 14 days after the
 * booking ends (assumption A16).
 */
export function ReviewForm({
  bookingId,
  existing,
}: {
  bookingId: string;
  existing: { rating: number } | null;
}) {
  const [state, action, pending] = useActionState(submitReview, initialState);

  if (existing || state.success) {
    return (
      <FormSuccess>
        Thanks — your rating has been recorded{existing ? ` (${existing.rating}/5)` : ''}.
      </FormSuccess>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="bookingId" value={bookingId} />

      <fieldset>
        <legend className="mb-2 block text-sm font-medium text-slate-700">
          Your rating <span className="text-red-600">*</span>
        </legend>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((value) => (
            <label
              key={value}
              className="flex cursor-pointer flex-col items-center gap-1 rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 has-[:checked]:border-slate-900 has-[:checked]:bg-slate-900 has-[:checked]:text-white"
            >
              <input type="radio" name="rating" value={value} className="sr-only" required />
              <span aria-hidden="true">★</span>
              <span>{value}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <Field htmlFor="comment" label="Anything to add?" hint="Optional, and shown publicly.">
        <Textarea
          id="comment"
          name="comment"
          rows={3}
          maxLength={1000}
          placeholder="Easy to find, exactly as described."
        />
      </Field>

      {state.error ? <FormError>{state.error}</FormError> : null}

      <Button type="submit" size="sm" disabled={pending}>
        {pending ? 'Saving…' : 'Submit rating'}
      </Button>
    </form>
  );
}
