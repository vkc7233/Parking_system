'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { formatPaise } from '@parking/core';
import { Button, FormError } from '@parking/ui';
import { confirmBookingPayment } from '../../actions';
import { simulateFakePayment } from './actions';
import { RazorpayCheckout } from './razorpay-checkout';

/**
 * The payment step (spec §6.1 step 5, §7.1).
 *
 * With the real provider this hands off to Razorpay Checkout, which is what keeps card and UPI
 * details off our servers entirely (§12). With the fake provider — which is what runs until the
 * merchant account clears (§13) — there is a button that captures the order server-side instead.
 *
 * Both paths end in exactly the same call: `confirmBookingPayment`, which asks the provider
 * whether the money actually arrived. Neither path is trusted to confirm anything itself, which
 * is why swapping the provider changes which widget appears and nothing about what a confirmed
 * booking means.
 */
export function CheckoutPanel({
  bookingId,
  orderId,
  amount,
  provider,
  expiresAt,
  razorpayKeyId,
  reference,
  listingTitle,
  seekerName,
  seekerPhone,
}: {
  bookingId: string;
  orderId: string;
  amount: number;
  provider: string;
  expiresAt: string | null;
  /** Razorpay's publishable key. Absent when the fake provider is configured. */
  razorpayKeyId: string | null;
  reference: string;
  listingTitle: string;
  seekerName: string | null;
  seekerPhone: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  // The slot is held for a fixed window (assumption A10). Showing the countdown is fairer than
  // letting it lapse silently while someone hunts for their card.
  useEffect(() => {
    if (!expiresAt) return;

    const tick = () => {
      const remaining = Math.max(
        0,
        Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000),
      );
      setSecondsLeft(remaining);
      if (remaining === 0) router.refresh();
    };

    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [expiresAt, router]);

  /**
   * The single confirmation path, shared by both providers.
   *
   * Whatever the browser claims, this is where it is checked: `confirmBookingPayment` asks the
   * provider directly whether that payment exists, is captured, belongs to this order and is for
   * the right amount, before anything is confirmed.
   */
  function confirm(providerPaymentId: string) {
    setError(undefined);
    startTransition(async () => {
      const confirmed = await confirmBookingPayment(bookingId, providerPaymentId);

      if (confirmed.error) {
        setError(confirmed.error);
        return;
      }

      router.push(`/bookings/${bookingId}?paid=1`);
    });
  }

  function payWithFake() {
    setError(undefined);
    startTransition(async () => {
      const captured = await simulateFakePayment(bookingId, orderId);

      if (captured.error || !captured.paymentId) {
        setError(captured.error ?? 'Payment did not complete.');
        return;
      }

      confirm(captured.paymentId);
    });
  }

  const expired = secondsLeft === 0;

  return (
    <div className="space-y-4">
      {secondsLeft !== null && !expired ? (
        <p className="text-sm text-slate-600">
          Slot held for{' '}
          <span className="font-mono font-medium text-slate-900">
            {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}
          </span>
        </p>
      ) : null}

      {expired ? (
        <FormError>
          The hold on this slot has expired and it has been released. Search again to rebook.
        </FormError>
      ) : null}

      {error ? <FormError>{error}</FormError> : null}

      {provider === 'fake' ? (
        <>
          <Button type="button" full disabled={isPending || expired} onClick={payWithFake}>
            {isPending ? 'Processing…' : `Pay ${formatPaise(amount)}`}
          </Button>
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <span className="font-medium">Test mode.</span> No real payment provider is configured,
            so this captures the order locally. The confirmation path is identical to the live one —
            the booking is still only confirmed after the payment is verified server-side.
          </p>
        </>
      ) : razorpayKeyId ? (
        <RazorpayCheckout
          keyId={razorpayKeyId}
          orderId={orderId}
          amount={amount}
          reference={reference}
          listingTitle={listingTitle}
          seekerName={seekerName}
          seekerPhone={seekerPhone}
          disabled={isPending || expired}
          onPaid={confirm}
        />
      ) : (
        // Reachable only through a misconfiguration that `assertProvidersConfigured` is meant to
        // catch at boot. Said plainly rather than shown as a dead button.
        <FormError>
          Payments are not configured on this deployment, so this booking cannot be paid for right
          now. Nothing has been charged.
        </FormError>
      )}
    </div>
  );
}
