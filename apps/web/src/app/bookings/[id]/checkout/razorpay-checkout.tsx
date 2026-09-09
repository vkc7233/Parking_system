'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { formatPaise } from '@parking/core';
import { Button, FormError } from '@parking/ui';

/**
 * Razorpay Checkout, the browser half (spec §6.1 step 5, §7.1, §12).
 *
 * The order is created server-side before this renders; all this does is open Razorpay's own
 * widget against it. That division is the whole point of §12's PCI position: the card number and
 * the UPI PIN are entered inside Razorpay's iframe and never touch this application, this
 * server, or this database.
 *
 * What comes back from the widget is **not** proof of payment. Razorpay's handler runs in the
 * browser, and a browser can be told to say anything. It is treated as a hint that the payment
 * id is worth asking the server about — `onPaid` calls `confirmBookingPayment`, which asks
 * Razorpay directly whether that payment exists, is captured, belongs to this order, and is for
 * the right amount. §7.1's "confirmed only after successful payment capture" is enforced there,
 * never here.
 */

/** The slice of Razorpay's global we use. Typed narrowly rather than pulling in their SDK. */
interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill: { name?: string; contact?: string; email?: string };
  notes: Record<string, string>;
  theme: { color: string };
  handler: (response: { razorpay_payment_id: string }) => void;
  modal: { ondismiss: () => void };
}

interface RazorpayInstance {
  open: () => void;
  on: (event: string, handler: (response: { error?: { description?: string } }) => void) => void;
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

const SCRIPT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

export function RazorpayCheckout({
  keyId,
  orderId,
  amount,
  reference,
  listingTitle,
  seekerName,
  seekerPhone,
  disabled,
  onPaid,
}: {
  keyId: string;
  orderId: string;
  amount: number;
  reference: string;
  listingTitle: string;
  seekerName: string | null;
  seekerPhone: string;
  disabled: boolean;
  /** Hands the claimed payment id to the server, which is what actually decides. */
  onPaid: (providerPaymentId: string) => void;
}) {
  const [scriptState, setScriptState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [error, setError] = useState<string | undefined>();
  const [opening, setOpening] = useState(false);
  const openedRef = useRef(false);

  // Loaded on this screen rather than in the root layout: a third-party script on every page of
  // the site is a needless dependency and a needless privacy surface. It is only needed here.
  useEffect(() => {
    if (window.Razorpay) {
      setScriptState('ready');
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);

    const onLoad = () => setScriptState('ready');
    const onError = () => setScriptState('failed');

    if (existing) {
      existing.addEventListener('load', onLoad);
      existing.addEventListener('error', onError);
      return () => {
        existing.removeEventListener('load', onLoad);
        existing.removeEventListener('error', onError);
      };
    }

    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.addEventListener('load', onLoad);
    script.addEventListener('error', onError);
    document.body.appendChild(script);

    return () => {
      script.removeEventListener('load', onLoad);
      script.removeEventListener('error', onError);
    };
  }, []);

  const open = useCallback(() => {
    if (!window.Razorpay || openedRef.current) return;

    setError(undefined);
    setOpening(true);
    openedRef.current = true;

    const instance = new window.Razorpay({
      key: keyId,
      amount,
      currency: 'INR',
      name: 'Parking Marketplace',
      description: listingTitle,
      order_id: orderId,
      prefill: {
        ...(seekerName ? { name: seekerName } : {}),
        // Razorpay wants the number without the country prefix separator; the stored form is
        // already digits-only, which is what it expects.
        contact: seekerPhone,
      },
      notes: { reference },
      // Matches --color-brand-600, so the widget does not look like a different product.
      theme: { color: '#4f46e5' },
      handler: (response) => {
        setOpening(false);
        openedRef.current = false;
        onPaid(response.razorpay_payment_id);
      },
      modal: {
        // Closing the widget is not a failure — the slot is still held and they can try again.
        ondismiss: () => {
          setOpening(false);
          openedRef.current = false;
        },
      },
    });

    instance.on('payment.failed', (response) => {
      setOpening(false);
      openedRef.current = false;
      setError(
        response.error?.description ??
          'That payment did not go through. Nothing has been charged — try again.',
      );
    });

    instance.open();
  }, [keyId, amount, orderId, listingTitle, reference, seekerName, seekerPhone, onPaid]);

  if (scriptState === 'failed') {
    return (
      <FormError>
        The payment window could not load. Check your connection and reload — your slot is still
        held.
      </FormError>
    );
  }

  return (
    <div className="space-y-3">
      {error ? <FormError>{error}</FormError> : null}

      <Button
        type="button"
        full
        disabled={disabled || scriptState !== 'ready' || opening}
        onClick={open}
      >
        {scriptState !== 'ready'
          ? 'Loading payment…'
          : opening
            ? 'Waiting for payment…'
            : `Pay ${formatPaise(amount)}`}
      </Button>

      <p className="text-center text-xs text-slate-500">
        Card and UPI details are entered inside Razorpay. They never reach this app.
      </p>
    </div>
  );
}
