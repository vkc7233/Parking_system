'use server';

/**
 * Host listing management (spec §7.2).
 *
 * Everything a Host can do to a listing goes through here. Two rules shape the code:
 *
 *  - The database is the authority on lifecycle. Submitting requires two photos and completed
 *    onboarding; going live requires a signed agreement; a material edit sends a live listing
 *    back for approval. All of that is enforced by triggers, so these actions translate the
 *    resulting errors into something a Host can act on rather than re-implementing the rules.
 *  - Prices are entered in rupees and stored in paise. `rupeesToPaise` is the only conversion,
 *    and it happens here at the edge (assumption A9).
 */
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { BOOKING, CAPACITY, PLATFORM } from '@parking/config';
import { rupeesToPaise } from '@parking/core';
import { requireHost } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export interface ListingFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: string;
}

const SPOT_TYPES = ['open', 'covered', 'basement', 'stilt', 'garage', 'driveway'] as const;

/** Accepts "30" or "30.50"; rejects anything that is not a sane rupee amount. */
const rupees = z
  .string()
  .trim()
  .regex(/^\d{1,6}(\.\d{1,2})?$/, 'Enter an amount in rupees, e.g. 30 or 30.50')
  .transform((v) => rupeesToPaise(Number(v)));

const optionalRupees = z
  .string()
  .trim()
  .transform((v) => (v === '' ? null : v))
  .pipe(z.union([z.null(), rupees]));

const optionalTime = z
  .string()
  .trim()
  .transform((v) => (v === '' ? null : v))
  .pipe(z.union([z.null(), z.string().regex(/^\d{2}:\d{2}$/, 'Use a time like 07:00')]));

const listingSchema = z
  .object({
    id: z
      .string()
      .trim()
      .transform((v) => (v === '' ? null : v))
      .pipe(z.union([z.null(), z.string().uuid()])),
    title: z.string().trim().min(6, 'Give the spot a name of at least 6 characters').max(120),
    description: z.string().trim().max(2000).optional().default(''),
    addressLine: z.string().trim().min(6, 'Enter the street address'),
    locality: z.string().trim().max(120).optional().default(''),
    city: z.string().trim().min(2, 'Enter the city'),
    state: z.string().trim().max(120).optional().default(''),
    pincode: z
      .string()
      .trim()
      .transform((v) => (v === '' ? null : v))
      .pipe(z.union([z.null(), z.string().regex(/^\d{6}$/, 'A pincode is 6 digits')])),
    lat: z.coerce.number().min(-90).max(90),
    lng: z.coerce.number().min(-180).max(180),
    spotType: z.enum(SPOT_TYPES),
    capacity: z.coerce
      .number()
      .int()
      .min(1, 'A listing must hold at least one vehicle')
      .max(CAPACITY.maxCapacity, `The most we support is ${CAPACITY.maxCapacity}`),
    pricePerHour: rupees,
    pricePerDay: optionalRupees,
    availableFrom: optionalTime,
    availableUntil: optionalTime,
    rules: z.string().trim().max(2000).optional().default(''),
  })
  // Mirrors the database constraint, so the Host sees a field-level message instead of a
  // constraint violation (assumption A3: the daily rate is a cap, never a surcharge).
  .refine((v) => v.pricePerDay === null || v.pricePerDay <= v.pricePerHour * 24, {
    message: 'The daily rate must be less than 24x the hourly rate, or it is not a discount',
    path: ['pricePerDay'],
  })
  .refine((v) => !(v.availableFrom && v.availableUntil) || v.availableFrom < v.availableUntil, {
    message: 'The closing time must be after the opening time',
    path: ['availableUntil'],
  });

function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === 'string' && !out[key]) out[key] = issue.message;
  }
  return out;
}

export async function saveListing(
  _prev: ListingFormState,
  formData: FormData,
): Promise<ListingFormState> {
  await requireHost('/host/listings/new');

  const parsed = listingSchema.safeParse({
    id: formData.get('id') ?? '',
    title: formData.get('title') ?? '',
    description: formData.get('description') ?? '',
    addressLine: formData.get('addressLine') ?? '',
    locality: formData.get('locality') ?? '',
    city: formData.get('city') ?? '',
    state: formData.get('state') ?? '',
    pincode: formData.get('pincode') ?? '',
    lat: formData.get('lat') ?? '',
    lng: formData.get('lng') ?? '',
    spotType: formData.get('spotType') ?? '',
    capacity: formData.get('capacity') ?? '1',
    pricePerHour: formData.get('pricePerHour') ?? '',
    pricePerDay: formData.get('pricePerDay') ?? '',
    availableFrom: formData.get('availableFrom') ?? '',
    availableUntil: formData.get('availableUntil') ?? '',
    rules: formData.get('rules') ?? '',
  });

  if (!parsed.success) {
    const fieldErrors = fieldErrorsFrom(parsed.error);
    return {
      fieldErrors,
      error:
        fieldErrors['lat'] || fieldErrors['lng']
          ? 'Pick the location on the map first.'
          : undefined,
    };
  }

  const v = parsed.data;
  const supabase = await createClient();

  const { data: listingId, error } = await supabase.rpc('upsert_listing', {
    p_id: v.id,
    p_title: v.title,
    p_description: v.description || null,
    p_address_line: v.addressLine,
    p_locality: v.locality || null,
    p_city: v.city,
    p_state: v.state || null,
    p_pincode: v.pincode,
    p_lat: v.lat,
    p_lng: v.lng,
    p_spot_type: v.spotType,
    p_capacity: v.capacity,
    p_price_per_hour: v.pricePerHour,
    p_price_per_day: v.pricePerDay,
    p_available_from: v.availableFrom,
    p_available_until: v.availableUntil,
    p_rules: v.rules || null,
  });

  if (error || !listingId) {
    return { error: describeDatabaseError(error?.message) };
  }

  // Spec §8.4: listing a space is what makes someone a Host; there is no separate signup.
  await supabase.rpc('promote_to_host');

  revalidatePath('/host');
  revalidatePath(`/host/listings/${listingId}/edit`);

  if (!v.id) {
    redirect(`/host/listings/${listingId}/edit?created=1`);
  }

  return { success: 'Saved.' };
}

/** Draft -> pending. The database checks photos and onboarding (spec §7.2). */
export async function submitListing(listingId: string): Promise<ListingFormState> {
  await requireHost('/host');

  const supabase = await createClient();
  const { error } = await supabase
    .from('listings')
    .update({ status: 'pending' })
    .eq('id', listingId);

  if (error) {
    return { error: describeDatabaseError(error.message) };
  }

  revalidatePath('/host');
  revalidatePath(`/host/listings/${listingId}/edit`);
  return { success: 'Submitted for approval.' };
}

/** Pause or resume. Pausing removes the listing from search immediately (spec §7.2). */
export async function setListingPaused(
  listingId: string,
  paused: boolean,
): Promise<ListingFormState> {
  await requireHost('/host');

  const supabase = await createClient();

  // A paused listing returns to 'pending' rather than straight to 'live': re-approval is the
  // Admin's call, and the RLS policy will not let a Host set 'live' themselves anyway.
  const { error } = await supabase
    .from('listings')
    .update({ status: paused ? 'paused' : 'pending' })
    .eq('id', listingId);

  if (error) {
    return { error: describeDatabaseError(error.message) };
  }

  revalidatePath('/host');
  return { success: paused ? 'Listing paused.' : 'Sent for re-approval.' };
}

export async function deleteListing(listingId: string): Promise<ListingFormState> {
  await requireHost('/host');

  const supabase = await createClient();

  // Photos are removed from Storage first: the database row cascades, and once it is gone
  // there is nothing left that knows which objects belonged to this listing.
  const { data: photos } = await supabase
    .from('listing_photos')
    .select('storage_path')
    .eq('listing_id', listingId);

  if (photos?.length) {
    await supabase.storage.from('listing-photos').remove(photos.map((p) => p.storage_path));
  }

  const { error } = await supabase.from('listings').delete().eq('id', listingId);

  if (error) {
    return { error: describeDatabaseError(error.message) };
  }

  revalidatePath('/host');
  redirect('/host');
}

/**
 * Records a photo the browser has already uploaded to Storage.
 *
 * The upload itself happens client-side rather than through this action: a server action body
 * is capped at 1MB by default, and listing photos are allowed up to 5MB. Storage RLS restricts
 * writes to the Host's own `<host_id>/` prefix, so the browser cannot upload anywhere else.
 */
export async function recordListingPhoto(
  listingId: string,
  storagePath: string,
  altText: string,
): Promise<ListingFormState> {
  const profile = await requireHost('/host');

  if (!storagePath.startsWith(`${profile.id}/`)) {
    return { error: 'That upload path is not yours.' };
  }

  const supabase = await createClient();

  const { count } = await supabase
    .from('listing_photos')
    .select('id', { count: 'exact', head: true })
    .eq('listing_id', listingId);

  if ((count ?? 0) >= PLATFORM.maxListingPhotos) {
    await supabase.storage.from('listing-photos').remove([storagePath]);
    return { error: `A listing can have at most ${PLATFORM.maxListingPhotos} photos.` };
  }

  const { error } = await supabase.from('listing_photos').insert({
    listing_id: listingId,
    storage_path: storagePath,
    alt_text: altText || null,
    position: count ?? 0,
  });

  if (error) {
    await supabase.storage.from('listing-photos').remove([storagePath]);
    return { error: describeDatabaseError(error.message) };
  }

  revalidatePath(`/host/listings/${listingId}/edit`);
  return { success: 'Photo added.' };
}

export async function removeListingPhoto(
  listingId: string,
  photoId: string,
): Promise<ListingFormState> {
  await requireHost('/host');

  const supabase = await createClient();

  const { data: photo } = await supabase
    .from('listing_photos')
    .select('storage_path')
    .eq('id', photoId)
    .single();

  const { error } = await supabase.from('listing_photos').delete().eq('id', photoId);

  if (error) {
    return { error: describeDatabaseError(error.message) };
  }

  if (photo) {
    await supabase.storage.from('listing-photos').remove([photo.storage_path]);
  }

  // Positions carry a unique constraint, so a gap left by a deletion has to be closed.
  await supabase.rpc('repack_listing_photo_positions', { p_listing_id: listingId });

  revalidatePath(`/host/listings/${listingId}/edit`);
  return { success: 'Photo removed.' };
}

/**
 * Database errors are written for operators, not Hosts. These are the ones a Host can actually
 * cause, translated into what they should do about it.
 */
function describeDatabaseError(message: string | undefined): string {
  if (!message) return 'Something went wrong. Please try again.';

  const m = message.toLowerCase();

  if (m.includes('at least 2 photos')) {
    return `Add at least ${PLATFORM.minListingPhotos} photos before submitting this listing.`;
  }
  if (m.includes('onboarding must be completed')) {
    return 'Finish onboarding — identity, address and bank details — before submitting a listing.';
  }
  if (m.includes('signed host listing agreement')) {
    return 'The Host Listing Agreement has to be signed before this listing can go live.';
  }
  if (m.includes('listings_daily_cap_is_a_discount')) {
    return 'The daily rate must be less than 24x the hourly rate.';
  }
  if (m.includes('listings_has_a_price')) {
    return 'Set an hourly price, or a daily price.';
  }
  if (m.includes('cannot reduce capacity')) {
    return 'You have upcoming bookings — reduce capacity after they finish.';
  }
  if (m.includes('permission') || m.includes('row-level security')) {
    return 'You do not have permission to change this listing.';
  }
  if (m.includes('booking')) {
    return `Cannot make that change: bookings are limited to ${BOOKING.maxAdvanceDays} days ahead.`;
  }

  return 'Something went wrong. Please try again.';
}
