'use server';

/**
 * Host-declared unavailable periods (spec §7.2, §10).
 *
 * §10 gives listings an `availability_blocks` table and the booking trigger has always honoured
 * it, but nothing ever wrote to it — a host could set daily opening hours and still not close
 * next Tuesday for a family event. This is that screen's server half.
 *
 * Times arrive from `datetime-local` inputs, which carry no zone. They are the host's wall clock,
 * and the host is in Pune, so they are read as Asia/Kolkata rather than as the server's zone —
 * the same rule the listing hours use. Reading them as UTC would silently shift every block by
 * five and a half hours, which is long enough to swallow a booking and short enough that nobody
 * notices until someone arrives.
 */
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireHost } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export interface BlockFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: string;
}

/** IST is a fixed +05:30 offset with no daylight saving, so the suffix is all it takes. */
const IST_SUFFIX = '+05:30';

const localDateTime = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Pick a date and time');

const blockSchema = z
  .object({
    listingId: z.string().uuid('Choose which space to close'),
    startLocal: localDateTime,
    endLocal: localDateTime,
    reason: z.string().trim().max(200).optional().default(''),
  })
  .refine((value) => value.endLocal > value.startLocal, {
    message: 'The end has to be after the start',
    path: ['endLocal'],
  });

export async function createAvailabilityBlock(
  _prev: BlockFormState,
  formData: FormData,
): Promise<BlockFormState> {
  const profile = await requireHost('/host/calendar');

  const parsed = blockSchema.safeParse({
    listingId: formData.get('listingId') ?? '',
    startLocal: formData.get('startLocal') ?? '',
    endLocal: formData.get('endLocal') ?? '',
    reason: formData.get('reason') ?? '',
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === 'string' && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors, error: 'Check the dates below.' };
  }

  const supabase = await createClient();

  // Ownership is enforced by RLS on the insert; this check exists to turn "row-level security
  // policy violated" into a sentence, and to catch a stale listing id from an open tab.
  const { data: listing } = await supabase
    .from('listings')
    .select('id, title')
    .eq('id', parsed.data.listingId)
    .eq('host_id', profile.id)
    .maybeSingle();

  if (!listing) {
    return { error: 'That space is not one of yours.' };
  }

  const { error } = await supabase.from('availability_blocks').insert({
    listing_id: parsed.data.listingId,
    start_time: `${parsed.data.startLocal}:00${IST_SUFFIX}`,
    end_time: `${parsed.data.endLocal}:00${IST_SUFFIX}`,
    reason: parsed.data.reason || null,
  });

  if (error) {
    // The database refuses a block covering a booking the seeker has already paid for, and its
    // message names the booking reference — which is the one thing the host needs to act on it.
    if (error.message.includes('already runs from')) {
      return {
        error:
          `${error.message}. Cancel that booking first if you have to close the space — the ` +
          'seeker is refunded and told why.',
      };
    }
    return { error: `Could not close that period: ${error.message}` };
  }

  revalidatePath('/host/calendar');
  revalidatePath(`/listings/${parsed.data.listingId}`);

  return { success: `${listing.title} is closed for that period. Nobody can book it.` };
}

export async function removeAvailabilityBlock(blockId: string): Promise<BlockFormState> {
  await requireHost('/host/calendar');
  const supabase = await createClient();

  // No ownership clause: the RLS policy on this table already restricts deletes to blocks on the
  // caller's own listings, so a foreign id deletes nothing rather than someone else's row.
  const { error, count } = await supabase
    .from('availability_blocks')
    .delete({ count: 'exact' })
    .eq('id', blockId);

  if (error) {
    return { error: `Could not reopen that period: ${error.message}` };
  }

  if (!count) {
    return { error: 'That period is no longer closed — reload the page.' };
  }

  revalidatePath('/host/calendar');

  return { success: 'That period is open for bookings again.' };
}
