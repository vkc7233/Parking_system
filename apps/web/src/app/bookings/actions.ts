'use server';

/**
 * Booking creation, payment confirmation and cancellation (spec §7.1, §11).
 *
 * These correspond to the `create-booking` and `razorpay-webhook` Edge Functions in §11. They
 * run as Next.js server actions rather than Supabase Edge Functions because the app already has
 * a trusted server; the boundary that matters is the same either way — RLS gives browsers no
 * write path to `bookings` or `payments` at all, so every row here is written with the service
 * role after the caller has been authenticated and the price recomputed.
 *
 * Three rules this file exists to keep:
 *
 *  1. The price is calculated here, from the listing, every time. A quote shown in the browser
 *     is never trusted.
 *  2. A booking is only ever confirmed from a payment the provider confirms to us directly
 *     (§7.1: "a booking is only confirmed after successful payment capture, never before").
 *  3. Refunds are computed by the shared policy in @parking/core, so the amount matches what the
 *     published Cancellation Policy says (assumption A2).
 */
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { calculateRefund, holdExpiresAt, quoteBooking, QuoteError } from '@parking/core';
import { createPaymentsAdapter } from '@parking/api-client';
import { requireProfile } from '@/lib/auth';
import { getServerEnv } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { notify } from '@/lib/notifications';

export interface BookingActionState {
  error?: string;
}

function payments() {
  const env = getServerEnv();
  return createPaymentsAdapter({
    PAYMENTS_PROVIDER: env.PAYMENTS_PROVIDER,
    ...(env.RAZORPAY_KEY_ID ? { RAZORPAY_KEY_ID: env.RAZORPAY_KEY_ID } : {}),
    ...(env.RAZORPAY_KEY_SECRET ? { RAZORPAY_KEY_SECRET: env.RAZORPAY_KEY_SECRET } : {}),
    ...(env.RAZORPAY_PAYOUT_ACCOUNT_NUMBER
      ? { RAZORPAY_PAYOUT_ACCOUNT_NUMBER: env.RAZORPAY_PAYOUT_ACCOUNT_NUMBER }
      : {}),
  });
}

const createSchema = z.object({
  listingId: z.string().uuid(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
});

/**
 * Creates an unpaid booking and the payment order for it.
 *
 * The booking holds its slot for ten minutes (assumption A10) and is worth nothing until paid:
 * it starts in `pending_payment`, which is not a state any listing calendar treats as sold.
 */
export async function createBooking(
  _prev: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  const profile = await requireProfile('/');

  const parsed = createSchema.safeParse({
    listingId: formData.get('listingId'),
    startTime: formData.get('startTime'),
    endTime: formData.get('endTime'),
  });

  if (!parsed.success) {
    return { error: 'Choose when you want the space.' };
  }

  if (profile.suspendedAt) {
    return { error: 'Your account is suspended, so it cannot make bookings.' };
  }

  const start = new Date(parsed.data.startTime);
  const end = new Date(parsed.data.endTime);

  const supabase = await createClient();

  const { data: listing } = await supabase
    .from('listings')
    .select('id, host_id, title, price_per_hour, price_per_day')
    .eq('id', parsed.data.listingId)
    .eq('status', 'live')
    .maybeSingle();

  if (!listing) {
    return { error: 'This space is no longer available.' };
  }

  if (listing.host_id === profile.id) {
    return { error: 'You cannot book your own space.' };
  }

  // Priced here, from the listing, ignoring anything the form claimed the total was.
  let quote;
  try {
    quote = quoteBooking({
      startTime: start,
      endTime: end,
      pricePerHour: Number(listing.price_per_hour),
      pricePerDay: listing.price_per_day === null ? null : Number(listing.price_per_day),
    });
  } catch (error) {
    return { error: error instanceof QuoteError ? error.message : 'That booking is not valid.' };
  }

  const service = createServiceClient();

  // The availability trigger is the real guarantee here: it locks the listing row and counts
  // overlapping bookings, so two simultaneous checkouts cannot both succeed.
  const { data: booking, error: bookingError } = await service
    .from('bookings')
    .insert({
      listing_id: listing.id,
      seeker_id: profile.id,
      host_id: listing.host_id,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      subtotal: quote.subtotal,
      service_fee: quote.serviceFee,
      tax: quote.tax,
      total: quote.total,
      host_payout: quote.hostPayout,
      status: 'pending_payment',
      hold_expires_at: holdExpiresAt().toISOString(),
    })
    .select('id, reference')
    .single();

  if (bookingError || !booking) {
    const message = bookingError?.message.toLowerCase() ?? '';
    if (message.includes('fully booked')) {
      return { error: 'That time has just been taken. Choose another slot.' };
    }
    if (message.includes('unavailable')) {
      return { error: 'The host has marked that period unavailable.' };
    }
    return { error: 'Could not hold that slot. Please try again.' };
  }

  // The payment order is created after the slot is held, so a Seeker is never sent to pay for
  // something that was already gone.
  try {
    const order = await payments().createOrder({
      amount: quote.total,
      receipt: booking.reference,
      notes: { booking_id: booking.id, listing: listing.title },
    });

    await service.from('payments').insert({
      booking_id: booking.id,
      provider_order_id: order.orderId,
      amount: order.amount,
      status: 'created',
    });
  } catch {
    // No order means no way to pay, so release the slot immediately rather than leaving it held
    // for ten minutes for a checkout that can never complete.
    await service.from('bookings').update({ status: 'payment_failed' }).eq('id', booking.id);

    return { error: 'Payments are unavailable right now. Nothing has been charged.' };
  }

  redirect(`/bookings/${booking.id}/checkout`);
}

/**
 * Confirms a booking from a captured payment.
 *
 * Called both by the checkout screen after the provider's widget reports success, and by the
 * webhook. Either way the payment is verified with the provider directly before anything is
 * confirmed — a browser saying "it worked" is not evidence.
 */
export async function confirmBookingPayment(
  bookingId: string,
  providerPaymentId: string,
): Promise<BookingActionState> {
  const profile = await requireProfile('/bookings');
  const service = createServiceClient();

  const { data: booking } = await service
    .from('bookings')
    .select('id, reference, seeker_id, status, total, start_time, end_time, listings(title)')
    .eq('id', bookingId)
    .single();

  if (!booking || booking.seeker_id !== profile.id) {
    return { error: 'Booking not found.' };
  }

  if (booking.status === 'confirmed') {
    return {};
  }

  if (booking.status !== 'pending_payment') {
    return { error: 'This booking can no longer be paid for.' };
  }

  const captured = await payments().fetchPayment(providerPaymentId);

  if (!captured) {
    return { error: 'That payment has not completed. Nothing has been charged.' };
  }

  // Guards against a captured payment for a different, cheaper booking being replayed here.
  if (captured.amount !== Number(booking.total)) {
    return { error: 'The payment amount does not match this booking.' };
  }

  await service
    .from('payments')
    .update({
      provider_payment_id: captured.paymentId,
      status: 'captured',
      method: captured.method,
      captured_at: captured.capturedAt.toISOString(),
    })
    .eq('booking_id', booking.id);

  const { error } = await service
    .from('bookings')
    .update({ status: 'confirmed' })
    .eq('id', booking.id);

  if (error) {
    return { error: 'Payment captured but the booking could not be confirmed. Contact support.' };
  }

  await notify({
    userId: profile.id,
    bookingId: booking.id,
    template: 'booking_confirmed',
    variables: {
      listing: (booking.listings as { title?: string } | null)?.title ?? 'your space',
      start: new Date(booking.start_time).toLocaleString('en-IN'),
      reference: booking.reference,
    },
  });

  revalidatePath('/bookings');
  revalidatePath(`/bookings/${booking.id}`);
  return {};
}

/** Spec §7.1 — cancel ahead of the cutoff, refunded per the published policy (A2). */
export async function cancelBooking(bookingId: string): Promise<BookingActionState> {
  const profile = await requireProfile('/bookings');
  const service = createServiceClient();

  const { data: booking } = await service
    .from('bookings')
    .select(
      'id, reference, seeker_id, host_id, status, subtotal, service_fee, tax, total, start_time, listings(title)',
    )
    .eq('id', bookingId)
    .single();

  if (!booking) return { error: 'Booking not found.' };

  const cancelledBy =
    booking.seeker_id === profile.id ? 'seeker' : booking.host_id === profile.id ? 'host' : null;

  if (!cancelledBy) return { error: 'Booking not found.' };

  if (booking.status !== 'confirmed' && booking.status !== 'pending_payment') {
    return { error: 'This booking cannot be cancelled.' };
  }

  const refund = calculateRefund({
    charged: {
      subtotal: Number(booking.subtotal),
      serviceFee: Number(booking.service_fee),
      tax: Number(booking.tax),
      total: Number(booking.total),
    },
    bookingStartTime: new Date(booking.start_time),
    cancelledAt: new Date(),
    cancelledBy,
  });

  // Only a captured payment can be refunded; an unpaid booking simply releases its slot.
  const { data: payment } = await service
    .from('payments')
    .select('provider_payment_id, status, amount, refunded_amount')
    .eq('booking_id', booking.id)
    .maybeSingle();

  if (payment?.provider_payment_id && payment.status === 'captured' && refund.totalRefund > 0) {
    try {
      const result = await payments().refund({
        paymentId: payment.provider_payment_id,
        amount: refund.totalRefund,
        capturedAmount: Number(payment.amount),
        notes: { booking_id: booking.id, reason: refund.reason },
      });

      await service
        .from('payments')
        .update({
          refunded_amount: Number(payment.refunded_amount) + result.amount,
          provider_refund_id: result.refundId,
          status: result.amount >= Number(booking.total) ? 'refunded' : 'partially_refunded',
        })
        .eq('booking_id', booking.id);
    } catch {
      return {
        error: 'Could not process the refund. Nothing has been cancelled — contact support.',
      };
    }
  }

  const { error } = await service
    .from('bookings')
    .update({
      status: 'cancelled',
      cancelled_by: cancelledBy,
      cancellation_reason: refund.reason,
      refund_amount: refund.totalRefund,
    })
    .eq('id', booking.id);

  if (error) return { error: 'Could not cancel that booking.' };

  await notify({
    userId: booking.seeker_id,
    bookingId: booking.id,
    template: refund.totalRefund > 0 ? 'booking_refunded' : 'booking_cancelled',
    variables: {
      listing: (booking.listings as { title?: string } | null)?.title ?? 'your space',
      reference: booking.reference,
      amount: `₹${(refund.totalRefund / 100).toFixed(2)}`,
    },
  });

  revalidatePath('/bookings');
  revalidatePath(`/bookings/${booking.id}`);
  return {};
}
