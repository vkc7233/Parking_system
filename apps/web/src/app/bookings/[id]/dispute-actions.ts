'use server';

/**
 * Raising a dispute (spec §7.3, assumption A11).
 *
 * Written through the caller's own session rather than the service role, so the RLS policy
 * applies: it checks the raiser was a party to the booking and that the 48-hour window is still
 * open. A partial unique index allows only one open dispute per booking, so a second complaint
 * lands on the existing thread rather than creating a competing record.
 */
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { DISPUTE } from '@parking/config';
import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export interface DisputeState {
  error?: string;
  success?: boolean;
}

const schema = z.object({
  bookingId: z.string().uuid(),
  reason: z.string().trim().min(15, 'Tell us what happened — at least 15 characters').max(1000),
});

export async function raiseDispute(_prev: DisputeState, formData: FormData): Promise<DisputeState> {
  const profile = await requireProfile('/bookings');

  const parsed = schema.safeParse({
    bookingId: formData.get('bookingId'),
    reason: formData.get('reason') ?? '',
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form.' };
  }

  const supabase = await createClient();

  const { error } = await supabase.from('disputes').insert({
    booking_id: parsed.data.bookingId,
    raised_by: profile.id,
    reason: parsed.data.reason,
    status: 'open',
  });

  if (error) {
    if (error.code === '23505') {
      return { success: true };
    }
    // The insert policy is what refuses a booking that is not theirs or is past the window;
    // both surface as a row-level security failure rather than a specific message.
    if (error.message.toLowerCase().includes('row-level security')) {
      return {
        error: `Disputes can only be raised within ${DISPUTE.windowHoursAfterBookingEnd} hours of a booking ending.`,
      };
    }
    return { error: 'Could not raise that. Please try again.' };
  }

  revalidatePath(`/bookings/${parsed.data.bookingId}`);
  return { success: true };
}
