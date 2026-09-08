'use server';

/**
 * Payout processing (spec §6.3 step 3, §7.3).
 *
 * §7.3's acceptance criterion is that a payout cannot be triggered twice for the same booking.
 * That is enforced by a unique constraint on `payout_bookings.booking_id`, not by this code —
 * so a double-click, a retried request, or two admins clicking at once all end with one payout,
 * and the second attempt fails at the database rather than sending money twice.
 *
 * The eligible set comes from `unpaid_host_earnings`, which already excludes bookings inside
 * the dispute window and bookings with an open dispute (A11). This action never decides who is
 * owed what; it reads that and pays it.
 */
import { revalidatePath } from 'next/cache';
import { PAYOUT } from '@parking/config';
import { createPaymentsAdapter } from '@parking/api-client';
import { requireAdmin } from '@/lib/auth';
import { getServerEnv } from '@/lib/env';
import { createServiceClient } from '@/lib/supabase/service';
import { notify } from '@/lib/notifications';
import { track } from '@/lib/analytics';

export interface PayoutActionState {
  error?: string;
  success?: string;
}

export async function processHostPayout(hostId: string): Promise<PayoutActionState> {
  const admin = await requireAdmin();
  const service = createServiceClient();
  const env = getServerEnv();

  // -infinity/infinity: everything eligible, whenever it completed. The period recorded on the
  // payout is derived from what is actually in it rather than from a calendar window, so a
  // booking that became eligible late is never silently skipped.
  const { data: earnings } = await service.rpc('unpaid_host_earnings', {
    p_host_id: hostId,
    p_period_start: '-infinity',
    p_period_end: 'infinity',
  });

  const lines = (earnings ?? []) as { booking_id: string; completed_at: string; amount: number }[];

  if (lines.length === 0) {
    return { error: 'Nothing is eligible for payout for this host right now.' };
  }

  const total = lines.reduce((sum, line) => sum + Number(line.amount), 0);
  const oldest = lines.reduce(
    (min, line) => (new Date(line.completed_at) < min ? new Date(line.completed_at) : min),
    new Date(lines[0]!.completed_at),
  );

  const ageDays = (Date.now() - oldest.getTime()) / 86_400_000;

  if (total < PAYOUT.minimumPayout && ageDays <= PAYOUT.forceOutAfterDays) {
    return {
      error:
        `Only ₹${(total / 100).toFixed(2)} is eligible, below the ₹${PAYOUT.minimumPayout / 100} ` +
        'minimum. It carries forward to the next run.',
    };
  }

  const { data: host } = await service.from('users').select('id, name').eq('id', hostId).single();

  // The payout row is created first, with a placeholder amount the line items then correct via
  // trigger. Creating it up front means its id exists to use as the provider idempotency key.
  const { data: payout, error: payoutError } = await service
    .from('payouts')
    .insert({
      host_id: hostId,
      period_start: oldest.toISOString(),
      period_end: new Date().toISOString(),
      amount: 1,
      status: 'processing',
      initiated_by: admin.id,
    })
    .select('id')
    .single();

  if (payoutError || !payout) {
    return { error: `Could not open a payout: ${payoutError?.message}` };
  }

  // This is the step that cannot double-pay: the unique constraint on booking_id rejects any
  // booking already attached to another payout.
  const { error: linesError } = await service.from('payout_bookings').insert(
    lines.map((line) => ({
      payout_id: payout.id,
      booking_id: line.booking_id,
      amount: Number(line.amount),
    })),
  );

  if (linesError) {
    await service.from('payouts').delete().eq('id', payout.id);

    if (linesError.code === '23505') {
      return {
        error: 'Some of those bookings have already been paid out. Reload and try again.',
      };
    }
    return { error: `Could not attach bookings: ${linesError.message}` };
  }

  const payments = createPaymentsAdapter({
    PAYMENTS_PROVIDER: env.PAYMENTS_PROVIDER,
    ...(env.RAZORPAY_KEY_ID ? { RAZORPAY_KEY_ID: env.RAZORPAY_KEY_ID } : {}),
    ...(env.RAZORPAY_KEY_SECRET ? { RAZORPAY_KEY_SECRET: env.RAZORPAY_KEY_SECRET } : {}),
    ...(env.RAZORPAY_PAYOUT_ACCOUNT_NUMBER
      ? { RAZORPAY_PAYOUT_ACCOUNT_NUMBER: env.RAZORPAY_PAYOUT_ACCOUNT_NUMBER }
      : {}),
  });

  try {
    const result = await payments.createPayout({
      reference: payout.id,
      hostId,
      amount: total,
      // Real beneficiary ids come from Razorpay fund accounts created during host onboarding;
      // that is Phase 3 work (spec §9.7), so the host id stands in until then.
      beneficiaryId: hostId,
      narration: 'Parking payout',
    });

    const failed = result.status === 'failed';

    await service
      .from('payouts')
      .update({
        provider_payout_id: result.payoutId,
        status: failed ? 'failed' : result.status === 'processed' ? 'paid' : 'processing',
        processed_at: failed ? null : new Date().toISOString(),
        failure_reason: result.failureReason ?? null,
      })
      .eq('id', payout.id);

    if (failed) {
      // The line items stay attached so the money is not silently re-queued into another payout
      // while this one is unresolved. An admin retries it explicitly once the cause is fixed.
      return { error: `The transfer failed: ${result.failureReason ?? 'unknown reason'}` };
    }

    await service.from('admin_audit_log').insert({
      admin_id: admin.id,
      action: 'process_payout',
      entity_type: 'payout',
      entity_id: payout.id,
      details: { host_id: hostId, amount: total, bookings: lines.length },
    });

    await notify({
      userId: hostId,
      template: 'payout_processed',
      variables: {
        amount: `₹${(total / 100).toFixed(2)}`,
        reference: result.payoutId,
      },
    });

    await track('payout_processed', {
      distinctId: hostId,
      properties: {
        payout_id: payout.id,
        amount_paise: total,
        bookings: lines.length,
        oldest_completed_at: oldest.toISOString(),
      },
    });

    revalidatePath('/admin/payouts');
    revalidatePath('/admin');

    return {
      success: `Sent ₹${(total / 100).toFixed(2)} to ${host?.name ?? 'the host'} across ${lines.length} booking${lines.length === 1 ? '' : 's'}.`,
    };
  } catch (error) {
    await service
      .from('payouts')
      .update({
        status: 'failed',
        failure_reason: error instanceof Error ? error.message : 'Provider error',
      })
      .eq('id', payout.id);

    return { error: 'The payout provider rejected the transfer. Nothing has been sent.' };
  }
}
