import Link from 'next/link';
import { findPilotDestination, PILOT_CITY } from '@parking/config';
import { formatDistance, searchNearbyListings } from '@parking/api-client';
import { Badge, Card, EmptyState, Money } from '@parking/ui';
import type { LatLng, SearchResult } from '@parking/types';
import { createClient } from '@/lib/supabase/server';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { ServiceUnavailable } from '@/components/service-unavailable';
import { ListingPhoto } from '@/components/listing-photo';
import { SearchControls } from './search-controls';
import { SearchBar } from './search-bar';
import { DestinationChips } from './destination-chips';
import { ResultMap } from './result-map';

export const metadata = {
  title: 'Find parking in ' + PILOT_CITY.name,
  description:
    'Book guaranteed parking near where you are going in ' +
    PILOT_CITY.name +
    ', at a price you know before you leave.',
};

interface SearchParams {
  radius?: string;
  maxPrice?: string;
  spotType?: string;
  place?: string;
  lat?: string;
  lng?: string;
  where?: string;
  start?: string;
  end?: string;
}

/** A `datetime-local` value the seeker submitted, or null if it is absent or unparseable. */
function parseLocalTime(value: string | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Where the search is centred, and what to call that place.
 *
 * Three sources in priority order: explicit coordinates from the geocoder, one of the Pune
 * one-tap areas, then the city centre. Coordinates are validated rather than trusted — they
 * arrive from a query string anyone can edit, and a NaN would reach PostGIS as a null and
 * quietly return nothing.
 */
function resolveCenter(params: SearchParams): { center: LatLng; label: string; slug: string | null } {
  const lat = Number(params.lat);
  const lng = Number(params.lng);

  if (
    params.lat &&
    params.lng &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  ) {
    return {
      center: { lat, lng },
      label: params.where?.slice(0, 60) || 'your pin',
      slug: null,
    };
  }

  const destination = findPilotDestination(params.place);
  if (destination) {
    return { center: destination.center, label: destination.name, slug: destination.slug };
  }

  return { center: PILOT_CITY.center, label: PILOT_CITY.name, slug: null };
}

/**
 * Seeker home — map and list search (spec §8.1).
 *
 * Every input lives in the URL rather than in component state. That makes a set of results
 * shareable, survivable across a refresh, and — since this is a server component over publicly
 * readable listings — crawlable, which is what §7.4 asks for.
 */
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const { center, label, slug } = resolveCenter(params);
  const radius = Number(params.radius) || PILOT_CITY.defaultSearchRadiusMeters;
  const maxPricePerHour = params.maxPrice ? Number(params.maxPrice) * 100 : undefined;
  const spotTypes = params.spotType ? [params.spotType as SearchResult['spotType']] : undefined;

  const startTime = parseLocalTime(params.start);
  const endTime = parseLocalTime(params.end);
  // A window is only a filter when it is a real one; a start without an end would otherwise
  // reach the RPC as an open-ended range and exclude everything.
  const window = startTime && endTime && endTime > startTime ? { startTime, endTime } : null;

  // A search page whose backend is unreachable should say so, not throw a stack trace at the
  // seeker. The distinction matters: no results is a real answer, an outage is not.
  let results: SearchResult[] | null = null;

  try {
    results = await searchNearbyListings(
      supabase,
      {
        center,
        radiusMeters: radius,
        ...(maxPricePerHour ? { maxPricePerHour } : {}),
        ...(spotTypes ? { spotTypes } : {}),
        ...(window ?? {}),
        limit: 50,
      },
      {
        photoUrl: (path) =>
          supabase.storage.from('listing-photos').getPublicUrl(path).data.publicUrl,
      },
    );
  } catch (error) {
    console.error('[home] nearby search failed', error);
  }

  return (
    <div className="min-h-dvh bg-slate-50">
      <SiteHeader />

      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 pt-10 pb-6">
          <p className="text-sm font-medium text-brand-600">
            {PILOT_CITY.name}, {PILOT_CITY.state}
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Parking you have already booked
          </h1>
          <p className="mt-2 max-w-xl text-slate-600">
            Reserve a real space near where you are going in {PILOT_CITY.name}, at a price you know
            before you leave. No circling Koregaon Park, no bargaining at the gate.
          </p>

          <div className="mt-6">
            <SearchBar
              initialWhere={slug ? label : (params.where ?? '')}
              initialStart={params.start ?? ''}
              initialEnd={params.end ?? ''}
            />
          </div>

          <div className="mt-4">
            <DestinationChips activeSlug={slug} />
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {results === null ? (
          <ServiceUnavailable what="Search" />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SearchControls
                radius={radius}
                maxPrice={params.maxPrice ?? ''}
                spotType={params.spotType ?? ''}
                resultCount={results.length}
                nearLabel={label}
              />
            </div>

            {window ? (
              <p className="mt-3 rounded-lg border border-brand-500/25 bg-brand-50 px-3 py-2 text-sm text-slate-700">
                Showing only spaces free from{' '}
                <span className="font-medium">
                  {window.startTime.toLocaleString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>{' '}
                to{' '}
                <span className="font-medium">
                  {window.endTime.toLocaleTimeString('en-IN', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                .
              </p>
            ) : null}

            {results.length === 0 ? (
              <Card className="mt-5">
                <EmptyState
                  title={`No spaces near ${label} yet`}
                  description={
                    'Nothing is listed within ' +
                    formatDistance(radius) +
                    ' that matches. Try widening the radius or a nearby area — hosts are being added across ' +
                    PILOT_CITY.name +
                    ' now.'
                  }
                />
              </Card>
            ) : (
              <div className="mt-5 gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
                <ul className="grid gap-4 sm:grid-cols-2">
                  {results.map((listing) => (
                    <li key={listing.id}>
                      <Link href={'/listings/' + listing.id} className="group block h-full">
                        <Card className="h-full overflow-hidden transition group-hover:border-slate-300 group-hover:shadow-md">
                          <div className="relative aspect-4/3 bg-slate-100">
                            <ListingPhoto
                              src={listing.primaryPhotoUrl}
                              alt={listing.title}
                              spotType={listing.spotType}
                              sizes="(max-width: 640px) 100vw, 320px"
                            />

                            <span className="absolute bottom-2 left-2 rounded-full bg-white/95 px-2.5 py-1 text-xs font-medium text-slate-800 shadow-sm">
                              {formatDistance(listing.distanceMeters)} away
                            </span>

                            {listing.availableSlots <= 2 ? (
                              <span className="absolute top-2 right-2 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-900 shadow-sm">
                                {listing.availableSlots === 0
                                  ? 'Full'
                                  : listing.availableSlots === 1
                                    ? '1 left'
                                    : `${listing.availableSlots} left`}
                              </span>
                            ) : null}
                          </div>

                          <div className="p-4">
                            <div className="flex items-start justify-between gap-2">
                              <h2 className="text-sm font-semibold text-slate-900">
                                {listing.title}
                              </h2>
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

                <div className="mt-4 lg:sticky lg:top-4 lg:mt-0">
                  <ResultMap results={results} center={center} centerLabel={label} />
                </div>
              </div>
            )}
          </>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
