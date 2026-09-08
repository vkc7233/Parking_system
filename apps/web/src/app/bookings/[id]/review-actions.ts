'use server';

/**
 * Rate and review (spec §7.1, assumption A16).
 *
 * Written with the caller's own session, not the service role: the reviews table has an insert
 * policy that establishes authorship, and a trigger that checks the booking is completed, its end
 * time has passed, the reviewer was a party to it, and the 14-day window is still open. Going
 * through RLS here means all of that applies rather than being bypassed.
 */
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { REVIEWS } from '@parking/config';
import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export interface ReviewState {
  error?: string;
  success?: boolean;
}

const schema = z.object({
  bookingId: z.string().uuid(),
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().max(REVIEWS.maxCommentLength).optional().default(''),
});

export async function submitReview(_prev: ReviewState, formData: FormData): Promise<ReviewState> {
  const profile = await requireProfile('/bookings');

  const parsed = schema.safeParse({
    bookingId: formData.get('bookingId'),
    rating: formData.get('rating'),
    comment: formData.get('comment') ?? '',
  });

  if (!parsed.success) {
    return { error: 'Choose a rating from 1 to 5.' };
  }

  const supabase = await createClient();

  // The column is NOT NULL, so a value has to be supplied - but the eligibility trigger
  // overwrites it from the booking regardless, which is what stops a review being attached to
  // someone else's listing. Reading it here keeps the insert honest rather than relying on
  // that overwrite to correct a wrong value.
  const { data: booking } = await supabase
    .from('bookings')
    .select('listing_id')
    .eq('id', parsed.data.bookingId)
    .maybeSingle();

  if (!booking) {
    return { error: 'Booking not found.' };
  }

  const { error } = await supabase.from('reviews').insert({
    booking_id: parsed.data.bookingId,
    listing_id: booking.listing_id,
    created_by: profile.id,
    rating: parsed.data.rating,
    comment: parsed.data.comment || null,
  });

  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes('review window')) {
      return {
        error: `Reviews close ${REVIEWS.windowDaysAfterBookingEnd} days after a booking ends.`,
      };
    }
    if (message.includes('completed booking') || message.includes('before its end time')) {
      return { error: 'You can review this once the booking has finished.' };
    }
    if (error.code === '23505') {
      return { success: true };
    }
    return { error: 'Could not save your rating. Please try again.' };
  }

  revalidatePath(`/bookings/${parsed.data.bookingId}`);
  return { success: true };
}
