import Link from 'next/link';
import {
  Badge,
  buttonVariants,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ListingStatusBadge,
  Money,
} from '@parking/ui';
import { PLATFORM } from '@parking/config';
import type { ListingStatus, SpotType } from '@parking/types';
import { getOnboardingState, requireHost } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ListingThumbnail } from './listing-thumbnail';

export const metadata = { title: 'My listings' };

interface ListingRow {
  id: string;
  title: string;
  address_line: string;
  locality: string | null;
  city: string;
  status: ListingStatus;
  spot_type: SpotType;
  capacity: number;
  price_per_hour: number;
  price_per_day: number | null;
  rejection_reason: string | null;
  created_at: string;
  listing_photos: { storage_path: string; position: number }[];
}

/** Spec §8.2 — My Listings, with status. */
export default async function HostListingsPage() {
  const profile = await requireHost('/host');
  const onboarding = await getOnboardingState(profile.id);
  const supabase = await createClient();

  const { data } = await supabase
    .from('listings')
    .select(
      'id, title, address_line, locality, city, status, spot_type, capacity, price_per_hour, price_per_day, rejection_reason, created_at, listing_photos(storage_path, position)',
    )
    .eq('host_id', profile.id)
    .order('created_at', { ascending: false });

  const listings = (data ?? []) as unknown as ListingRow[];

  const publicUrl = (path: string) =>
    supabase.storage.from('listing-photos').getPublicUrl(path).data.publicUrl;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">My listings</h1>
          <p className="mt-1 text-slate-600">
            Spaces you have listed, and where each one is in the process.
          </p>
        </div>
        <Link href="/host/listings/new" className={buttonVariants({ size: 'md' })}>
          List a space
        </Link>
      </header>

      {listings.length === 0 ? (
        <Card>
          <EmptyState
            title="No listings yet"
            description="List a parking space and start earning from it. It takes a couple of minutes, and nothing goes live until you submit it and we approve it."
            action={
              <Link href="/host/listings/new" className={buttonVariants({ size: 'md' })}>
                List your first space
              </Link>
            }
          />
        </Card>
      ) : (
        <ul className="space-y-4">
          {listings.map((listing) => {
            const cover = [...listing.listing_photos].sort((a, b) => a.position - b.position)[0];
            const photoCount = listing.listing_photos.length;

            return (
              <li key={listing.id}>
                <Card>
                  <div className="flex flex-col gap-4 p-4 sm:flex-row">
                    <div className="relative h-32 w-full shrink-0 overflow-hidden rounded-lg bg-slate-100 sm:h-24 sm:w-32">
                      {cover ? (
                        <ListingThumbnail
                          src={publicUrl(cover.storage_path)}
                          alt=""
                          sizes="128px"
                          className="object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-slate-400">
                          No photos
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate text-base font-semibold text-slate-900">
                          {listing.title}
                        </h2>
                        <ListingStatusBadge status={listing.status} />
                        {photoCount < PLATFORM.minListingPhotos ? (
                          <Badge tone="warning">
                            {photoCount}/{PLATFORM.minListingPhotos} photos
                          </Badge>
                        ) : null}
                      </div>

                      <p className="mt-0.5 truncate text-sm text-slate-600">
                        {listing.locality ? `${listing.locality}, ` : ''}
                        {listing.city}
                      </p>

                      <p className="mt-2 text-sm text-slate-700">
                        <Money paise={listing.price_per_hour} showDecimals={false} />
                        <span className="text-slate-500"> / hour</span>
                        {listing.price_per_day ? (
                          <>
                            <span className="mx-2 text-slate-300">·</span>
                            <Money paise={listing.price_per_day} showDecimals={false} />
                            <span className="text-slate-500"> daily cap</span>
                          </>
                        ) : null}
                        {listing.capacity > 1 ? (
                          <>
                            <span className="mx-2 text-slate-300">·</span>
                            <span className="text-slate-500">
                              {listing.capacity} vehicles at once
                            </span>
                          </>
                        ) : null}
                      </p>

                      {/* A rejection is useless without its reason (spec §6.3 step 2). */}
                      {listing.status === 'rejected' && listing.rejection_reason ? (
                        <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
                          {listing.rejection_reason}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex shrink-0 items-start">
                      <Link
                        href={`/host/listings/${listing.id}/edit`}
                        className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                      >
                        Manage
                      </Link>
                    </div>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {!onboarding.verified && listings.length > 0 ? (
        <Card>
          <CardHeader title="Onboarding" />
          <CardBody>
            <p className="text-sm text-slate-600">
              {onboarding.complete
                ? 'Your documents are with an admin for review. Listings can be submitted in the meantime.'
                : 'Upload your identity, address and bank details to submit a listing for approval.'}{' '}
              <Link href="/host/onboarding" className="font-medium underline underline-offset-4">
                Go to onboarding
              </Link>
            </p>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
