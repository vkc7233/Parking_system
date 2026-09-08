'use server';

/**
 * Verifying a Seeker's access pass on arrival (assumption A5).
 *
 * This is the screen the specification never had. §7.1 requires the pass to be generated and
 * delivered, but nothing in §7 or §8 ever checks one — which would make the pass decorative, and
 * leave the Host with no way to tell a real booking from a screenshot. §5 names exactly that
 * failure as the thing that makes a Seeker abandon the platform.
 *
 * Two ways in, because a phone camera in a dark basement is not reliable: the signed token from
 * the QR, or the 8-character reference read aloud. The token is cryptographically checked; the
 * reference is looked up and then checked against the same rules.
 */
import { revalidatePath } from 'next/cache';
import { ACCESS_PASS } from '@parking/config';
import { requireHost } from '@/lib/auth';
import { verifyPass } from '@/lib/access-pass';
import { createServiceClient } from '@/lib/supabase/service';

export interface VerifyResult {
  status: 'valid' | 'invalid' | 'not_found' | 'wrong_host' | 'not_yet' | 'expired' | 'cancelled';
  message: string;
  booking?: {
    id: string;
    reference: string;
    listingTitle: string;
    seekerName: string | null;
    startTime: string;
    endTime: string;
    alreadyCheckedIn: boolean;
  };
}

export async function verifyAccessPassInput(
  _prev: VerifyResult | null,
  formData: FormData,
): Promise<VerifyResult> {
  const host = await requireHost('/host/verify');
  const raw = String(formData.get('pass') ?? '').trim();

  if (!raw) {
    return { status: 'invalid', message: 'Scan the QR code or type the booking reference.' };
  }

  const service = createServiceClient();
  let bookingId: string | null = null;

  // A token has two dot-separated parts; anything else is treated as a reference.
  if (raw.includes('.')) {
    const verified = await verifyPass(raw);

    if (!verified.valid) {
      const reasons: Record<string, VerifyResult> = {
        malformed: { status: 'invalid', message: 'That is not a valid pass.' },
        bad_signature: {
          status: 'invalid',
          message: 'This pass was not issued by us. Do not let the vehicle in.',
        },
        not_yet_valid: {
          status: 'not_yet',
          message: `This booking has not started yet. The pass works from ${ACCESS_PASS.validFromMinutesBeforeStart} minutes before.`,
        },
        expired: {
          status: 'expired',
          message: 'This pass has expired — the booking window has passed.',
        },
      };
      return reasons[verified.reason] ?? { status: 'invalid', message: 'That pass is not valid.' };
    }

    bookingId = verified.claims.bookingId;
  }

  const query = service
    .from('bookings')
    .select(
      'id, reference, host_id, status, start_time, end_time, checked_in_at, listings(title), users!bookings_seeker_id_fkey(name)',
    );

  const { data: booking } = bookingId
    ? await query.eq('id', bookingId).maybeSingle()
    : await query.eq('reference', raw.toUpperCase()).maybeSingle();

  if (!booking) {
    return { status: 'not_found', message: 'No booking found for that reference.' };
  }

  // A Host may only verify passes for their own spaces.
  if (booking.host_id !== host.id) {
    return { status: 'wrong_host', message: 'That booking is not for one of your spaces.' };
  }

  const details = {
    id: booking.id,
    reference: booking.reference,
    listingTitle: (booking.listings as { title?: string } | null)?.title ?? 'Your space',
    seekerName: (booking.users as { name?: string | null } | null)?.name ?? null,
    startTime: booking.start_time,
    endTime: booking.end_time,
    alreadyCheckedIn: booking.checked_in_at !== null,
  };

  if (booking.status === 'cancelled' || booking.status === 'payment_failed') {
    return {
      status: 'cancelled',
      message: 'This booking was cancelled and is not paid for.',
      booking: details,
    };
  }

  if (booking.status === 'pending_payment') {
    return {
      status: 'invalid',
      message: 'This booking has not been paid for.',
      booking: details,
    };
  }

  // The reference path skips the token's own validity window, so it is applied here instead -
  // otherwise typing a reference would bypass the timing check the QR enforces.
  const now = Date.now();
  const validFrom =
    new Date(booking.start_time).getTime() - ACCESS_PASS.validFromMinutesBeforeStart * 60_000;
  const validUntil =
    new Date(booking.end_time).getTime() + ACCESS_PASS.validUntilMinutesAfterEnd * 60_000;

  if (now < validFrom) {
    return {
      status: 'not_yet',
      message: 'This booking has not started yet.',
      booking: details,
    };
  }

  if (now > validUntil) {
    return { status: 'expired', message: 'This booking has already ended.', booking: details };
  }

  if (!details.alreadyCheckedIn) {
    await service
      .from('bookings')
      .update({ checked_in_at: new Date().toISOString() })
      .eq('id', booking.id);
  }

  revalidatePath('/host/verify');

  return {
    status: 'valid',
    message: details.alreadyCheckedIn
      ? 'Valid — already checked in earlier.'
      : 'Valid. Checked in.',
    booking: { ...details, alreadyCheckedIn: true },
  };
}
