'use server';

/**
 * Local-only payment capture.
 *
 * The fake payments adapter has a `simulateCheckout` that the real one deliberately does not:
 * with Razorpay the hosted widget performs the capture, which is exactly what keeps card and UPI
 * details off our servers (§12). This action exists so the booking loop is walkable end to end
 * before the merchant account clears (§13, §16), and it refuses to run against a real provider.
 */
import { createPaymentsAdapter, FakePaymentsAdapter } from '@parking/api-client';
import { requireProfile } from '@/lib/auth';
import { getServerEnv } from '@/lib/env';
import { createServiceClient } from '@/lib/supabase/service';

export interface SimulateResult {
  paymentId?: string;
  error?: string;
}

export async function simulateFakePayment(
  bookingId: string,
  orderId: string,
): Promise<SimulateResult> {
  const profile = await requireProfile('/bookings');
  const env = getServerEnv();

  if (env.PAYMENTS_PROVIDER !== 'fake') {
    return { error: 'Simulated payments are disabled when a real provider is configured.' };
  }

  const service = createServiceClient();

  const { data: booking } = await service
    .from('bookings')
    .select('id, seeker_id, status, total')
    .eq('id', bookingId)
    .single();

  if (!booking || booking.seeker_id !== profile.id) {
    return { error: 'Booking not found.' };
  }

  if (booking.status !== 'pending_payment') {
    return { error: 'This booking is no longer awaiting payment.' };
  }

  // The same singleton instance that created the order, so the capture is visible to
  // confirmBookingPayment when it verifies afterwards.
  const adapter = createPaymentsAdapter({ PAYMENTS_PROVIDER: 'fake' });

  if (!(adapter instanceof FakePaymentsAdapter)) {
    return { error: 'Simulated payments are not available.' };
  }

  try {
    // The booking total is passed so the order can be rehydrated if this process has restarted
    // since it was created - a routine event with hot reload.
    const captured = await adapter.simulateCheckout(orderId, Number(booking.total));
    return { paymentId: captured.paymentId };
  } catch {
    return { error: 'Simulated payment failed. Try again.' };
  }
}
