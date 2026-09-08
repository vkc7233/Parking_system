'use server';

/**
 * Dispute resolution (spec §6.3 step 4, §7.3).
 *
 * Resolving in the seeker's favour refunds them in full and, because the booking is then
 * excluded from `unpaid_host_earnings`, the host is never paid for it. That ordering is the
 * whole reason payouts are held for the dispute window (A11): the money to refund is still ours.
 */
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createPaymentsAdapter } from '@parking/api-client';
import { requireAdmin } from '@/lib/auth';
import { getServerEnv } from '@/lib/env';
import { createServiceClient } from '@/lib/supabase/service';
import { notify } from '@/lib/notifications';

export interface DisputeActionState {
  error?: string;
  success?: string;
}

const schema = z.object({
  disputeId: z.string().uuid(),
  outcome: z.enum(['resolved_refund', 'resolved_no_action']),
  note: z.string().trim().min(10, 'Record why this was decided — at least 10 characters').max(1000),
});

export async function resolveDispute(
  _prev: DisputeActionState,
  formData: FormData,
): Promise<DisputeActionState> {
  const admin = await requireAdmin();

  const parsed = schema.safeParse({
    disputeId: formData.get('disputeId'),
    outcome: formData.get('outcome'),
    note: formData.get('note') ?? '',
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form.' };
  }

  const service = createServiceClient();

  const { data: dispute } = await service
    .from('disputes')
    .select(
      'id, status, booking_id, raised_by, bookings(id, reference, seeker_id, total, status, listings(title))',
    )
    .eq('id', parsed.data.disputeId)
    .maybeSingle();

  if (!dispute) return { error: 'Dispute not found.' };
  if (dispute.status !== 'open') return { error: 'That dispute has already been resolved.' };

  const booking = dispute.bookings as unknown as {
    id: string;
    reference: string;
    seeker_id: string;
    total: number;
    status: string;
    listings: { title: string } | null;
  } | null;

  if (!booking) return { error: 'The booking behind this dispute is missing.' };

  if (parsed.data.outcome === 'resolved_refund') {
    const env = getServerEnv();

    const { data: payment } = await service
      .from('payments')
      .select('provider_payment_id, status, amount, refunded_amount')
      .eq('booking_id', booking.id)
      .maybeSingle();

    const outstanding = Number(booking.total) - Number(payment?.refunded_amount ?? 0);

    if (payment?.provider_payment_id && payment.status === 'captured' && outstanding > 0) {
      const payments = createPaymentsAdapter({
        PAYMENTS_PROVIDER: env.PAYMENTS_PROVIDER,
        ...(env.RAZORPAY_KEY_ID ? { RAZORPAY_KEY_ID: env.RAZORPAY_KEY_ID } : {}),
        ...(env.RAZORPAY_KEY_SECRET ? { RAZORPAY_KEY_SECRET: env.RAZORPAY_KEY_SECRET } : {}),
      });

      try {
        const refund = await payments.refund({
          paymentId: payment.provider_payment_id,
          amount: outstanding,
          capturedAmount: Number(payment.amount),
          notes: { dispute_id: dispute.id, resolved_by: admin.id },
        });

        await service
          .from('payments')
          .update({
            refunded_amount: Number(payment.refunded_amount) + refund.amount,
            provider_refund_id: refund.refundId,
            status: 'refunded',
          })
          .eq('booking_id', booking.id);
      } catch {
        return { error: 'The refund failed at the provider. The dispute is still open.' };
      }
    }

    await service
      .from('bookings')
      .update({ refund_amount: Number(booking.total) })
      .eq('id', booking.id);
  }

  const { error } = await service
    .from('disputes')
    .update({
      status: parsed.data.outcome,
      resolution_note: parsed.data.note,
      resolved_by: admin.id,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', dispute.id);

  if (error) return { error: `Could not record the resolution: ${error.message}` };

  await service.from('admin_audit_log').insert({
    admin_id: admin.id,
    action: parsed.data.outcome,
    entity_type: 'dispute',
    entity_id: dispute.id,
    details: { booking_id: booking.id, note: parsed.data.note },
  });

  await notify({
    userId: booking.seeker_id,
    bookingId: booking.id,
    template: parsed.data.outcome === 'resolved_refund' ? 'booking_refunded' : 'booking_cancelled',
    variables: {
      listing: booking.listings?.title ?? 'your booking',
      reference: booking.reference,
      amount: `₹${(Number(booking.total) / 100).toFixed(2)}`,
    },
  });

  revalidatePath('/admin/disputes');
  revalidatePath('/admin');

  return {
    success:
      parsed.data.outcome === 'resolved_refund'
        ? 'Refunded in full. The host will not be paid for this booking.'
        : 'Closed with no refund. The host will be paid as normal.',
  };
}
