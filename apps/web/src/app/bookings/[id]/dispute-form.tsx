'use client';

import { useActionState, useState } from 'react';
import { DISPUTE } from '@parking/config';
import { Button, Field, FormError, FormSuccess, Textarea } from '@parking/ui';
import { raiseDispute, type DisputeState } from './dispute-actions';

const initialState: DisputeState = {};

/**
 * Reporting a problem with a booking (spec §7.3).
 *
 * Deliberately understated — most bookings are fine, and a prominent complaint button invites
 * complaints. It appears only inside the dispute window, and says plainly what raising one does,
 * because it holds the host's money until someone rules on it.
 */
export function DisputeForm({
  bookingId,
  existing,
}: {
  bookingId: string;
  existing: { status: string; reason: string } | null;
}) {
  const [state, action, pending] = useActionState(raiseDispute, initialState);
  const [open, setOpen] = useState(false);

  if (existing) {
    return (
      <div className="space-y-1">
        <p className="text-sm font-medium text-slate-900">
          {existing.status === 'open'
            ? 'We are looking into this.'
            : existing.status === 'resolved_refund'
              ? 'Resolved — you were refunded.'
              : 'Resolved — no refund was due.'}
        </p>
        <p className="text-sm text-slate-600">{existing.reason}</p>
      </div>
    );
  }

  if (state.success) {
    return (
      <FormSuccess>
        Reported. Our team reviews these daily and will be in touch. The host is not paid for this
        booking until it is resolved.
      </FormSuccess>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm text-slate-600 underline underline-offset-4 hover:text-slate-900"
      >
        Something was wrong with this booking
      </button>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="bookingId" value={bookingId} />

      <Field
        htmlFor="reason"
        label="What happened?"
        required
        hint={`Report within ${DISPUTE.windowHoursAfterBookingEnd} hours of the booking ending.`}
      >
        <Textarea
          id="reason"
          name="reason"
          rows={3}
          required
          minLength={15}
          placeholder="The gate was locked and nobody answered, so I could not park."
        />
      </Field>

      {state.error ? <FormError>{state.error}</FormError> : null}

      <div className="flex gap-2">
        <Button type="submit" size="sm" variant="secondary" disabled={pending}>
          {pending ? 'Sending…' : 'Report a problem'}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
