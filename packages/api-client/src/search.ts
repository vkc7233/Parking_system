/**
 * Typed wrapper over the `search_nearby_listings` RPC (spec section 7.1).
 *
 * Lives in a shared package rather than in the web app because the Phase 2 mobile app runs
 * the identical query (spec 9.3), and because the snake_case-to-camelCase mapping is the kind
 * of thing that silently rots when it is duplicated.
 */
import { PILOT_CITY } from '@parking/config';
import type { SearchFilters, SearchResult, SpotType } from '@parking/types';
import type { SupabaseClient } from '@supabase/supabase-js';

interface SearchRow {
  id: string;
  host_id: string;
  title: string;
  address_line: string;
  locality: string | null;
  city: string;
  lat: number;
  lng: number;
  distance_meters: number;
  spot_type: SpotType;
  capacity: number;
  price_per_hour: number;
  price_per_day: number | null;
  average_rating: string | number | null;
  review_count: number;
  primary_photo_path: string | null;
  available_slots: number;
}

export interface SearchOptions {
  /** Turns a storage path into a public URL. Injected so this stays free of client details. */
  photoUrl?: (storagePath: string) => string;
}

export async function searchNearbyListings(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the generated Database type is app-side
  supabase: SupabaseClient<any, 'public', any>,
  filters: SearchFilters,
  options: SearchOptions = {},
): Promise<SearchResult[]> {
  const radius = Math.min(
    filters.radiusMeters || PILOT_CITY.defaultSearchRadiusMeters,
    PILOT_CITY.maxSearchRadiusMeters,
  );

  const { data, error } = await supabase.rpc('search_nearby_listings', {
    p_lat: filters.center.lat,
    p_lng: filters.center.lng,
    p_radius_meters: radius,
    p_start_time: filters.startTime?.toISOString() ?? null,
    p_end_time: filters.endTime?.toISOString() ?? null,
    p_min_price: filters.minPricePerHour ?? null,
    p_max_price: filters.maxPricePerHour ?? null,
    p_spot_types: filters.spotTypes ?? null,
    p_limit: filters.limit ?? 50,
    p_offset: filters.offset ?? 0,
  });

  if (error) {
    /*
     * A network failure and a rejected query are the same object here, and they need different
     * things from whoever reads the log.
     *
     * PostgREST returns a message that explains itself - a missing function, a bad argument. But
     * when the database cannot be reached at all, `fetch failed` is the whole message: no status,
     * no host, nothing to act on. It is also the most common failure in development, where it
     * means Supabase is not running yet, and the second most common in a new deployment, where it
     * means the URL is wrong. Naming the URL answers both without leaking anything -
     * NEXT_PUBLIC_SUPABASE_URL is compiled into the browser bundle already.
     */
    if (/fetch failed|network|ECONNREFUSED|ENOTFOUND/i.test(error.message)) {
      const url = supabaseUrlOf(supabase);
      throw new Error(
        `Could not reach the database at ${url}. ` +
          (isLocal(url)
            ? 'Supabase is not running - start it with `pnpm db:start` and reload.'
            : 'Check NEXT_PUBLIC_SUPABASE_URL, and that the project is not paused.'),
      );
    }

    throw new Error(`Nearby search failed: ${error.message}`);
  }

  return ((data ?? []) as SearchRow[]).map((row) => ({
    id: row.id,
    hostId: row.host_id,
    title: row.title,
    addressLine: row.address_line,
    locality: row.locality,
    city: row.city,
    location: { lat: row.lat, lng: row.lng },
    distanceMeters: row.distance_meters,
    spotType: row.spot_type,
    capacity: row.capacity,
    pricePerHour: Number(row.price_per_hour),
    pricePerDay: row.price_per_day === null ? null : Number(row.price_per_day),
    // Postgres numeric arrives as a string; Number(null) would be 0, which would render as a
    // zero-star rating on a listing that simply has no reviews yet.
    averageRating: row.average_rating === null ? null : Number(row.average_rating),
    reviewCount: row.review_count,
    primaryPhotoUrl:
      row.primary_photo_path && options.photoUrl
        ? options.photoUrl(row.primary_photo_path)
        : row.primary_photo_path,
    availableSlots: row.available_slots,
  }));
}

/** Remaining capacity for a window; 0 means the slot is gone (assumption A4). */
export async function getAvailableSlots(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see above
  supabase: SupabaseClient<any, 'public', any>,
  listingId: string,
  startTime: Date,
  endTime: Date,
): Promise<number> {
  const { data, error } = await supabase.rpc('listing_available_slots', {
    p_listing_id: listingId,
    p_start_time: startTime.toISOString(),
    p_end_time: endTime.toISOString(),
  });

  if (error) {
    throw new Error(`Availability check failed: ${error.message}`);
  }

  return typeof data === 'number' ? data : 0;
}

/** The client keeps its base URL on a private field, so this is a read with a safe fallback. */
function supabaseUrlOf(client: unknown): string {
  const url = (client as { supabaseUrl?: unknown } | null)?.supabaseUrl;
  return typeof url === 'string' && url ? url : 'the configured Supabase URL';
}

function isLocal(url: string): boolean {
  return /127\.0\.0\.1|localhost/i.test(url);
}
