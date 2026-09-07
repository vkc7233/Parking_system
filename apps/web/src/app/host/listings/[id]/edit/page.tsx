import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PLATFORM } from '@parking/config';
import type { ListingStatus, SpotType } from '@parking/types';
import { Card, CardBody, CardHeader, FormSuccess, ListingStatusBadge } from '@parking/ui';
import { getOnboardingState, requireHost } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ListingForm } from '../../listing-form';
import { ListingActionsBar } from '../../listing-actions-bar';
import { PhotoUploader, type ExistingPhoto } from '../../photo-uploader';

export const metadata = { title: 'Edit listing' };

interface ListingRecord {
  id: string;
  host_id: string;
  title: string;
  description: string | null;
  address_line: string;
  locality: string | null;
  city: string;
  state: string | null;
  pincode: string | null;
  spot_type: SpotType;
  capacity: number;
  price_per_hour: number;
  price_per_day: number | null;
  available_from: string | null;
  available_until: string | null;
  rules: string | null;
  lat: number;
  lng: number;
  agreement_signed_at: string | null;
  status: ListingStatus;
  rejection_reason: string | null;
  listing_photos: { id: string; storage_path: string; alt_text: string | null; position: number }[];
}

/**
 * Spec §8.2 — Edit listing, plus photos and the lifecycle controls.
 *
 * Editing a live listing may send it back for approval: address, photos, spot type and capacity
 * are material changes, price and copy are not (assumption A14). The notice below says so before
 * the Host discovers it by watching their listing disappear from search.
 */
export default async function EditListingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string; signed?: string }>;
}) {
  const { id } = await params;
  const { created, signed } = await searchParams;

  const profile = await requireHost(`/host/listings/${id}/edit`);
  const onboarding = await getOnboardingState(profile.id);
  const supabase = await createClient();

  const { data } = await supabase
    .from('listings')
    .select(
      'id, host_id, title, description, address_line, locality, city, state, pincode, spot_type, capacity, price_per_hour, price_per_day, available_from, available_until, rules, lat, lng, agreement_signed_at, status, rejection_reason, listing_photos(id, storage_path, alt_text, position)',
    )
    .eq('id', id)
    .single();

  // RLS already restricts this to the Host's own listings, so "not found" covers both a missing
  // listing and someone else's.
  if (!data) notFound();

  const listing = data as unknown as ListingRecord;

  const photos: ExistingPhoto[] = [...listing.listing_photos]
    .sort((a, b) => a.position - b.position)
    .map((p) => ({
      id: p.id,
      storagePath: p.storage_path,
      altText: p.alt_text,
      url: supabase.storage.from('listing-photos').getPublicUrl(p.storage_path).data.publicUrl,
    }));

  // Times come back from Postgres as HH:MM:SS; the time input wants HH:MM.
  const asTimeInput = (t: string | null) => (t ? t.slice(0, 5) : null);

  return (
    <div className="space-y-6">
      <header>
        <Link href="/host" className="text-sm text-slate-600 underline underline-offset-4">
          Back to my listings
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{listing.title}</h1>
          <ListingStatusBadge status={listing.status} />
        </div>
      </header>

      {created ? (
        <FormSuccess>
          Draft saved. Add at least {PLATFORM.minListingPhotos} photos below, then submit it for
          approval.
        </FormSuccess>
      ) : null}

      {signed ? <FormSuccess>Host Listing Agreement signed for this listing.</FormSuccess> : null}

      {listing.status === 'rejected' && listing.rejection_reason ? (
        <Card>
          <CardBody>
            <p className="text-sm font-medium text-red-800">Changes needed</p>
            <p className="mt-1 text-sm text-slate-700">{listing.rejection_reason}</p>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title="Photos"
          description="At least two, taken in daylight, of the actual space."
        />
        <CardBody>
          <PhotoUploader
            listingId={listing.id}
            hostId={listing.host_id}
            photos={photos}
            listingTitle={listing.title}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Status" />
        <CardBody>
          <ListingActionsBar
            listingId={listing.id}
            status={listing.status}
            photoCount={photos.length}
            minPhotos={PLATFORM.minListingPhotos}
            onboardingComplete={onboarding.complete}
            agreementSigned={listing.agreement_signed_at !== null}
          />
        </CardBody>
      </Card>

      {listing.status === 'live' ? (
        <p className="rounded-md bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
          This listing is live. Changing the address, photos, spot type or capacity sends it back
          for approval and hides it from search until then. Price, description and house rules take
          effect immediately, and never change a booking someone has already paid for.
        </p>
      ) : null}

      <ListingForm
        submitLabel="Save changes"
        defaults={{
          id: listing.id,
          title: listing.title,
          description: listing.description ?? '',
          spotType: listing.spot_type,
          capacity: listing.capacity,
          pricePerHour: listing.price_per_hour,
          pricePerDay: listing.price_per_day,
          availableFrom: asTimeInput(listing.available_from),
          availableUntil: asTimeInput(listing.available_until),
          rules: listing.rules ?? '',
          // lat/lng are generated from the PostGIS point, so an edit that does not touch the
          // address re-submits exactly the coordinates already on file.
          location: {
            formattedAddress: listing.address_line,
            location: { lat: listing.lat, lng: listing.lng },
            locality: listing.locality,
            city: listing.city,
            state: listing.state,
            pincode: listing.pincode,
          },
        }}
      />
    </div>
  );
}
