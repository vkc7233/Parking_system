import Link from 'next/link';
import { findPilotDestination, PILOT_CITY } from '@parking/config';
import { formatDistance, searchNearbyListings } from '@parking/api-client';
import { Card, EmptyState, Money } from '@parking/ui';
import type { LatLng, SearchResult } from '@parking/types';
import { createClient } from '@/lib/supabase/server';
import { clientEnv } from '@/lib/env';
import { getProfile } from '@/lib/auth';
import { track } from '@/lib/analytics';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { ServiceUnavailable } from '@/components/service-unavailable';
import { ListingPhoto } from '@/components/listing-photo';
import { SearchControls } from './search-controls';
import { SearchBar } from './search-bar';
import { DestinationChips } from './destination-chips';
import { ResultMap } from './result-map';
import { GoogleResultMap } from './google-result-map';

export const metadata = {
  title: 'Find parking in ' + PILOT_CITY.name,
  description:
    'Book guaranteed parking near where you are going in ' +
    PILOT_CITY.name +
    ', at a price you know before you leave.',
};

interface SearchParams {
  radius?: string;
  minPrice?: string;
  maxPrice?: string;
  sort?: string;
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
  const minPricePerHour = params.minPrice ? Number(params.minPrice) * 100 : undefined;
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
        ...(minPricePerHour ? { minPricePerHour } : {}),
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

  if (results && params.sort) {
    const sorted = [...results];
    if (params.sort === 'price') {
      sorted.sort((a, b) => a.pricePerHour - b.pricePerHour || a.distanceMeters - b.distanceMeters);
    } else if (params.sort === 'rating') {
      // Unrated listings sort last rather than as zero: "no reviews yet" is not "rated badly",
      // and a new host's space should not be buried before anyone has had the chance to rate it.
      sorted.sort(
        (a, b) => (b.averageRating ?? -1) - (a.averageRating ?? -1) || a.distanceMeters - b.distanceMeters,
      );
    }
    results = sorted;
  }

  // Recorded only when the seeker actually asked something — a destination, a time, or a
  // filter. Firing on the bare landing page would count every visit as a search and make the
  // search-to-booking rate in §3 meaningless, which is the number that says whether people are
  // finding anything.
  const isDeliberateSearch = Boolean(
    params.place ||
      params.lat ||
      params.start ||
      params.spotType ||
      params.maxPrice ||
      params.minPrice ||
      params.sort,
  );

  if (isDeliberateSearch && results !== null) {
    const profile = await getProfile();

    await track('search_performed', {
      // A signed-out seeker still counts: the top of this funnel is mostly people who have not
      // signed in yet, so dropping them would hide where they are lost.
      distinctId: profile?.id ?? 'anonymous',
      properties: {
        locality: slug ?? params.where ?? null,
        radius_meters: radius,
        results: results.length,
        has_time_filter: window !== null,
        spot_type: params.spotType ?? null,
      },
    });
  }

  return (
    <div className="min-h-dvh bg-slate-50">
      <SiteHeader />

      {/*
        * The search card sits wholly inside the dark panel.
        *
        * It used to straddle the boundary, pulled up by a negative margin so it overlapped the
        * seam. The intent was to push the field in front of everything else, but the seam landed
        * between the input row and the area chips - so the card read as two halves on two
        * different backgrounds rather than as one control. Depth is worth having; a join running
        * through the middle of the most important element on the page is not.
        */}
      <section className="hero-surface">
        <div className="mx-auto max-w-7xl px-4 pt-6 pb-8 sm:px-6 sm:pt-14 sm:pb-12 lg:px-8">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-brand-100 ring-1 ring-inset ring-white/15 backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-400" aria-hidden="true" />
            Now live in {PILOT_CITY.name}, {PILOT_CITY.state}
          </p>

          {/*
            * The headline names the problem, not the mechanism. "Parking you have already
            * booked" described what the product does but read, to someone arriving cold, like
            * a heading over their own past bookings — a page they had landed on by mistake.
            * Circling for a space is the thing a Pune driver already recognises, so that is
            * what the first line says; the sub-heading is where the promise goes.
            */}
          <h1 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight text-balance text-white sm:mt-4 sm:text-6xl sm:leading-[1.05]">
            Stop circling.
            <br className="hidden sm:block" />{' '}
            <span className="bg-linear-to-r from-brand-200 to-white bg-clip-text text-transparent">
              Start parking.
            </span>
          </h1>

          <p className="mt-4 hidden max-w-xl text-sm leading-relaxed text-brand-100 sm:block sm:text-lg">
            Reserve a real space near where you are going in {PILOT_CITY.name}, at a price you know
            before you leave — then drive straight in with a pass on your phone.
          </p>

          <div className="mt-6 rounded-2xl bg-white p-3 shadow-lift ring-1 ring-white/10 sm:mt-8 sm:p-4">
            <SearchBar
              initialWhere={slug ? label : (params.where ?? '')}
              initialStart={params.start ?? ''}
              initialEnd={params.end ?? ''}
            />

            <div className="mt-3 border-t border-slate-100 pt-3">
              <DestinationChips activeSlug={slug} />
            </div>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        {results === null ? (
          <ServiceUnavailable what="Search" />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SearchControls
                radius={radius}
                minPrice={params.minPrice ?? ''}
                maxPrice={params.maxPrice ?? ''}
                spotType={params.spotType ?? ''}
                sort={params.sort ?? ''}
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
              <div className="mt-5 gap-6 md:grid md:grid-cols-[minmax(0,1fr)_290px] md:items-start xl:grid-cols-[minmax(0,1fr)_340px]">
                {/*
                  Sized by the card, not by the breakpoint. `sm:grid-cols-2` gave every card
                  half the viewport — 480px wide with a 358px photo on a 1007px screen — so two
                  listings filled the entire fold and the page read as three enormous empty
                  panels. auto-fill keeps a card between about 230 and 300px at every width, and
                  simply fits more of them in as the screen grows.
                */}
                <ul className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(230px,1fr))]">
                  {results.map((listing) => (
                    <li key={listing.id}>
                      <Link
                        href={'/listings/' + listing.id}
                        className="group block h-full focus:outline-none"
                      >
                        <Card interactive className="flex h-full flex-col overflow-hidden">
                          <div className="relative aspect-4/3 overflow-hidden bg-slate-100">
                            <div className="h-full w-full transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.04]">
                              <ListingPhoto
                                src={listing.primaryPhotoUrl}
                                alt={listing.title}
                                spotType={listing.spotType}
                                sizes="(max-width: 640px) 100vw, 320px"
                              />
                            </div>

                            <span className="absolute bottom-2.5 left-2.5 rounded-full bg-slate-900/75 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
                              {formatDistance(listing.distanceMeters)} away
                            </span>

                            <span className="absolute top-2.5 left-2.5 rounded-full bg-white/90 px-2.5 py-1 text-xs font-medium text-slate-700 capitalize backdrop-blur-sm">
                              {listing.spotType}
                            </span>

                            {/* Amber only ever means scarcity here — see the palette note. */}
                            {listing.availableSlots <= 2 ? (
                              <span className="absolute top-2.5 right-2.5 rounded-full bg-accent-500 px-2.5 py-1 text-xs font-semibold text-accent-900 shadow-sm">
                                {listing.availableSlots === 0
                                  ? 'Full'
                                  : listing.availableSlots === 1
                                    ? '1 left'
                                    : `${listing.availableSlots} left`}
                              </span>
                            ) : null}
                          </div>

                          <div className="flex flex-1 flex-col p-4">
                            <div className="flex items-start justify-between gap-2">
                              <h2 className="text-sm leading-snug font-semibold text-slate-900 transition-colors group-hover:text-brand-700">
                                {listing.title}
                              </h2>
                              {listing.averageRating !== null ? (
                                <span className="flex shrink-0 items-center gap-0.5 text-xs font-medium text-slate-700">
                                  <span className="text-accent-500" aria-hidden="true">
                                    ★
                                  </span>
                                  {listing.averageRating.toFixed(1)}
                                  <span className="font-normal text-slate-400">
                                    ({listing.reviewCount})
                                  </span>
                                </span>
                              ) : (
                                <span className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
                                  New
                                </span>
                              )}
                            </div>

                            <p className="mt-1 truncate text-sm text-slate-500">
                              {listing.locality ? listing.locality + ', ' : ''}
                              {listing.city}
                            </p>

                            <div className="mt-auto flex items-end justify-between gap-2 pt-3">
                              <p className="text-slate-900">
                                <span className="text-lg font-semibold tracking-tight">
                                  <Money paise={listing.pricePerHour} showDecimals={false} />
                                </span>
                                <span className="text-sm text-slate-500"> / hour</span>
                              </p>
                              <span className="text-xs font-medium text-brand-600 opacity-0 transition-opacity group-hover:opacity-100">
                                View →
                              </span>
                            </div>
                          </div>
                        </Card>
                      </Link>
                    </li>
                  ))}
                </ul>

                {/*
                  * Real tiles when a Maps key is configured, the drawn schematic otherwise. Both
                  * present the same interaction — a price bubble per space, tap to select, tap
                  * again to open — so this swap changes how the map looks and nothing about how
                  * it is used.
                  */}
                <div className="mt-4 md:sticky md:top-20 md:mt-0">
                  {clientEnv.NEXT_PUBLIC_MAPS_PROVIDER === 'google' &&
                  clientEnv.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ? (
                    <GoogleResultMap
                      apiKey={clientEnv.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}
                      results={results}
                      center={center}
                      centerLabel={label}
                    />
                  ) : (
                    <ResultMap results={results} center={center} centerLabel={label} />
                  )}
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
