import Link from 'next/link';
import { PILOT_CITY } from '@parking/config';
import { formatDistance, searchNearbyListings } from '@parking/api-client';
import { Badge, Card, EmptyState, Money } from '@parking/ui';
import type { SearchResult } from '@parking/types';
import { createClient } from '@/lib/supabase/server';
import { SiteHeader } from '@/components/site-header';
import { ListingThumbnail } from './host/listing-thumbnail';
import { SearchControls } from './search-controls';

export const metadata = {
  title: 'Find parking in ' + PILOT_CITY.name,
  description:
    'Book guaranteed parking near where you are going, at a price you know before you leave.',
};

/**
 * Seeker home — map and list search (spec §8.1).
 *
 * Filters live in the URL rather than component state. That makes a set of results shareable,
 * survivable across a refresh, and — since this page is a server component and listings are
 * publicly readable — crawlable, which is what §7.4 asks for.
 *
 * The map itself arrives with the Google Maps key; until then results are a distance-ordered
 * list, which is the half of §8.1 that actually drives the booking decision.
 */
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ radius?: string; maxPrice?: string; spotType?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const radius = Number(params.radius) || PILOT_CITY.defaultSearchRadiusMeters;
  const maxPricePerHour = params.maxPrice ? Number(params.maxPrice) * 100 : undefined;
  const spotTypes = params.spotType ? [params.spotType as SearchResult['spotType']] : undefined;

  const results = await searchNearbyListings(
    supabase,
    {
      center: PILOT_CITY.center,
      radiusMeters: radius,
      ...(maxPricePerHour ? { maxPricePerHour } : {}),
      ...(spotTypes ? { spotTypes } : {}),
      limit: 50,
    },
    {
      photoUrl: (path) => supabase.storage.from('listing-photos').getPublicUrl(path).data.publicUrl,
    },
  );

  return (
    <div className="min-h-dvh bg-slate-50">
      <SiteHeader />

      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-10">
          <p className="text-sm font-medium text-slate-500">
            {PILOT_CITY.name}, {PILOT_CITY.state}
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Parking you have already booked
          </h1>
          <p className="mt-2 max-w-xl text-slate-600">
            Reserve a real space near where you are going, at a price you know before you leave. No
            circling, no bargaining on arrival.
          </p>
        </div>
      </section>

      <main className="mx-auto max-w-5xl px-4 py-8">
        <SearchControls
          radius={radius}
          maxPrice={params.maxPrice ?? ''}
          spotType={params.spotType ?? ''}
          resultCount={results.length}
        />

        {results.length === 0 ? (
          <Card>
            <EmptyState
              title="No spaces match yet"
              description={
                'Nothing is listed within ' +
                formatDistance(radius) +
                ' at that price. Try widening the radius, or check back — hosts are being added in ' +
                PILOT_CITY.name +
                ' now.'
              }
            />
          </Card>
        ) : (
          <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((listing) => (
              <li key={listing.id}>
                <Link href={'/listings/' + listing.id} className="group block h-full">
                  <Card className="h-full overflow-hidden transition group-hover:border-slate-300 group-hover:shadow-md">
                    <div className="relative aspect-4/3 bg-slate-100">
                      {listing.primaryPhotoUrl ? (
                        <ListingThumbnail
                          src={listing.primaryPhotoUrl}
                          alt={listing.title}
                          sizes="(max-width: 640px) 100vw, 320px"
                          className="object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-slate-400">
                          No photo
                        </div>
                      )}

                      <span className="absolute bottom-2 left-2 rounded-full bg-white/95 px-2.5 py-1 text-xs font-medium text-slate-800 shadow-sm">
                        {formatDistance(listing.distanceMeters)} away
                      </span>
                    </div>

                    <div className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <h2 className="text-sm font-semibold text-slate-900">{listing.title}</h2>
                        {listing.averageRating !== null ? (
                          <span className="shrink-0 text-xs text-slate-600">
                            ★ {listing.averageRating.toFixed(1)}
                            <span className="text-slate-400"> ({listing.reviewCount})</span>
                          </span>
                        ) : (
                          <span className="shrink-0 text-xs text-slate-400">New</span>
                        )}
                      </div>

                      <p className="mt-0.5 truncate text-sm text-slate-600">
                        {listing.locality ? listing.locality + ', ' : ''}
                        {listing.city}
                      </p>

                      <div className="mt-3 flex items-end justify-between gap-2">
                        <p className="text-sm text-slate-900">
                          <span className="text-base font-semibold">
                            <Money paise={listing.pricePerHour} showDecimals={false} />
                          </span>
                          <span className="text-slate-500"> / hour</span>
                        </p>
                        <Badge tone="neutral">{listing.spotType}</Badge>
                      </div>
                    </div>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>

      <footer className="mx-auto max-w-5xl px-4 pb-10 text-xs text-slate-500">
        <p>
          Booking and payment arrive in the next build — see docs/ROADMAP-STATUS.md for what is live
          today.
        </p>
      </footer>
    </div>
  );
}
