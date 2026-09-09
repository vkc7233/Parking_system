'use client';

import { useState, useTransition } from 'react';
import { Button } from '@parking/ui';
import { cancelBooking } from '@/app/bookings/actions';

/**
 * Admin cancellation (spec §7.3 "manually resolve a cancellation").
 *
 * Confirm-then-act, because this refunds the seeker in full and takes the booking away from the
 * host — and unlike the seeker's own cancel button, the person clicking it is not the person
 * affected by it.
 */
export function AdminCancelBooking({
  bookingId,
  reference,
  amount,
}: {
  bookingId: string;
  reference: string;
  amount: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <>
        <Button variant="secondary" size="sm" onClick={() => setConfirming(true)}>
          Cancel booking
        </Button>
        {error ? <span className="text-xs text-red-700">{error}</span> : null}
      </>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <span className="text-xs text-slate-600">
        Refund {amount} for {reference}?
      </span>
      <span className="flex gap-2">
        <Button
          variant="danger"
          size="sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await cancelBooking(bookingId);
              if (result.error) {
                setError(result.error);
                setConfirming(false);
              }
            })
          }
        >
          {pending ? 'Cancelling…' : 'Yes, cancel'}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
          Keep
        </Button>
      </span>
    </div>
  );
}
