'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { formatPaise } from '@parking/core';
import { Button, FormError } from '@parking/ui';
import { cancelBooking } from '../actions';

/**
 * Cancellation with the refund stated up front (spec §7.1, assumption A2).
 *
 * The amount shown is computed by the same policy function that will actually issue the refund,
 * so what the Seeker is told and what they get cannot diverge.
 */
export function CancelBooking({
  bookingId,
  refundAmount,
  isFullRefund,
}: {
  bookingId: string;
  refundAmount: number;
  isFullRefund: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | undefined>();

  function cancel() {
    startTransition(async () => {
      const result = await cancelBooking(bookingId);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {error ? <FormError>{error}</FormError> : null}

      <p className="text-sm text-slate-700">
        {refundAmount > 0 ? (
          <>
            Cancelling now refunds <span className="font-medium">{formatPaise(refundAmount)}</span>
            {isFullRefund ? ' — the full amount.' : ', per the cancellation policy.'}
          </>
        ) : (
          'It is too close to your arrival time for a refund. Cancelling now returns nothing.'
        )}
      </p>

      {confirming ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="danger" size="sm" disabled={isPending} onClick={cancel}>
            {isPending ? 'Cancelling…' : 'Yes, cancel this booking'}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
            Keep it
          </Button>
        </div>
      ) : (
        <Button type="button" variant="secondary" size="sm" onClick={() => setConfirming(true)}>
          Cancel booking
        </Button>
      )}
    </div>
  );
}
