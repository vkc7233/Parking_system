import { NextResponse, type NextRequest } from 'next/server';
import { createPaymentsAdapter, type PaymentsAdapter } from '@parking/api-client';
import { getServerEnv } from '@/lib/env';
import { createServiceClient } from '@/lib/supabase/service';
import { notify } from '@/lib/notifications';

/**
 * Razorpay payment webhook (spec §11's `razorpay-webhook`).
 *
 * This is the authoritative confirmation path. The checkout screen also confirms, because a
 * Seeker should not stare at a spinner waiting for a webhook — but a browser can be closed
 * mid-redirect, and this is what makes the booking still get confirmed when it is.
 *
 * Three things it must do and does:
 *
 *  1. Verify the signature before reading anything. An unverified webhook body is an attacker's
 *     free write into the bookings table.
 *  2. Be idempotent. Razorpay retries, and a booking already confirmed must not be confirmed
 *     twice or double-notified.
 *  3. Return 200 for anything it has handled or deliberately ignored, so the provider stops
 *     retrying. Non-200 is reserved for "we failed, please retry".
 */
export async function POST(request: NextRequest) {
  const env = getServerEnv();
  const secret = env.RAZORPAY_WEBHOOK_SECRET;

  if (!secret) {
    // Nothing is configured to send these yet; accepting them unverified would be worse.
    return NextResponse.json({ error: 'Webhooks are not configured' }, { status: 503 });
  }

  const signature = request.headers.get('x-razorpay-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  // The raw body, byte for byte - a re-serialised JSON object would not match the signature.
  const rawBody = await request.text();

  const adapter = createPaymentsAdapter({
    PAYMENTS_PROVIDER: env.PAYMENTS_PROVIDER,
    ...(env.RAZORPAY_KEY_ID ? { RAZORPAY_KEY_ID: env.RAZORPAY_KEY_ID } : {}),
    ...(env.RAZORPAY_KEY_SECRET ? { RAZORPAY_KEY_SECRET: env.RAZORPAY_KEY_SECRET } : {}),
  });

  if (!(await adapter.verifyWebhookSignature(rawBody, signature, secret))) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const event = adapter.parseWebhook(rawBody);
  const service = createServiceClient();

  if (event.type === 'payment.failed' && event.orderId) {
    return recordFailedAttempt(service, event);
  }

  // Everything else is acknowledged and dropped so Razorpay stops retrying it.
  if (event.type !== 'payment.captured' || !event.paymentId || !event.orderId) {
    return NextResponse.json({ received: true, ignored: event.type });
  }

  const { data: payment } = await service
    .from('payments')
    .select('booking_id, amount, status')
    .eq('provider_order_id', event.orderId)
    .maybeSingle();

  if (!payment) {
    // Not ours. Acknowledged rather than retried forever.
    return NextResponse.json({ received: true, unknown_order: true });
  }

  if (payment.status === 'captured') {
    return NextResponse.json({ received: true, already_processed: true });
  }

  if (event.amount !== null && event.amount !== Number(payment.amount)) {
    // A mismatch is a reconciliation problem for a human, not something to auto-confirm.
    await service
      .from('payments')
      .update({ provider_payload: event.raw as never, failure_reason: 'amount mismatch' })
      .eq('booking_id', payment.booking_id);

    return NextResponse.json({ received: true, amount_mismatch: true });
  }

  await service
    .from('payments')
    .update({
      provider_payment_id: event.paymentId,
      status: 'captured',
      captured_at: new Date().toISOString(),
      provider_payload: event.raw as never,
      // Cleared, because a retry succeeded: a captured payment still carrying "card declined"
      // reads as a contradiction to whoever opens it next, and to any report that joins on it.
      failure_reason: null,
    })
    .eq('booking_id', payment.booking_id);

  const { data: booking } = await service
    .from('bookings')
    .select('id, reference, seeker_id, status, start_time, listings(title)')
    .eq('id', payment.booking_id)
    .single();

  // The transition trigger refuses anything but pending_payment -> confirmed, so a booking that
  // was cancelled or already confirmed is left exactly as it is.
  if (booking?.status === 'pending_payment') {
    await service.from('bookings').update({ status: 'confirmed' }).eq('id', booking.id);

    await notify({
      userId: booking.seeker_id,
      bookingId: booking.id,
      template: 'booking_confirmed',
      variables: {
        listing: (booking.listings as { title?: string } | null)?.title ?? 'your space',
        start: new Date(booking.start_time).toLocaleString('en-IN'),
        reference: booking.reference,
      },
    });
  }

  return NextResponse.json({ received: true });
}

/**
 * A payment attempt that did not go through (spec §11's "reverts the booking accordingly").
 *
 * What this deliberately does NOT do is fail the booking on the first declined card, and the
 * reason is worth stating because the obvious implementation is actively harmful:
 *
 *   `payment.failed` fires per ATTEMPT, not per order. Razorpay Checkout lets the same order be
 *   retried with another card, so a seeker who is declined once and succeeds on the second try
 *   is completely normal. And `payment_failed` is a terminal booking status - the transition
 *   trigger allows nothing out of it - so killing the booking on attempt one would leave that
 *   seeker with a captured payment and a booking that can never be confirmed. We would have
 *   taken their money and given them nothing.
 *
 * Holding the slot through a retry is also what the seeker wants: releasing it the instant a
 * card bounces means reaching for a second card and finding the space gone.
 *
 * So the booking is only reverted once a retry is no longer possible - the hold has lapsed - and
 * what happens on every attempt is that the reason is written down. That is the part that was
 * actually missing: `payments.failure_reason` existed and nothing ever set it, so neither the
 * seeker on the checkout screen nor support afterwards could say why a payment had not worked.
 */
async function recordFailedAttempt(
  service: ReturnType<typeof createServiceClient>,
  event: ReturnType<PaymentsAdapter['parseWebhook']>,
): Promise<NextResponse> {
  const { data: payment } = await service
    .from('payments')
    .select('booking_id, status')
    .eq('provider_order_id', event.orderId!)
    .maybeSingle();

  if (!payment) {
    return NextResponse.json({ received: true, unknown_order: true });
  }

  // A captured payment that later reports a failed attempt is a retry arriving out of order.
  // The money is in; nothing about that row should move.
  if (payment.status === 'captured') {
    return NextResponse.json({ received: true, already_captured: true });
  }

  await service
    .from('payments')
    .update({
      status: 'failed',
      failure_reason: event.failureReason ?? 'The payment provider did not say why.',
      provider_payload: event.raw as never,
      ...(event.paymentId ? { provider_payment_id: event.paymentId } : {}),
    })
    .eq('booking_id', payment.booking_id);

  const { data: booking } = await service
    .from('bookings')
    .select('id, status, hold_expires_at')
    .eq('id', payment.booking_id)
    .single();

  if (!booking || booking.status !== 'pending_payment') {
    return NextResponse.json({ received: true, recorded: true });
  }

  const holdLapsed =
    booking.hold_expires_at !== null && new Date(booking.hold_expires_at) <= new Date();

  if (!holdLapsed) {
    // Still retryable. The slot stays held, and `expire_unpaid_bookings` releases it if the
    // seeker never comes back.
    return NextResponse.json({ received: true, recorded: true, retryable: true });
  }

  await service.from('bookings').update({ status: 'payment_failed' }).eq('id', booking.id);

  return NextResponse.json({ received: true, recorded: true, reverted: true });
}
