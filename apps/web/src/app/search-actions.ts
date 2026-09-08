'use server';

/**
 * Destination lookup behind the search bar (spec §8.1).
 *
 * Autocomplete runs as a server action rather than from the browser so the Maps key is never
 * shipped to the client and every billed call is one we made deliberately — §16 names Google
 * Maps cost growth as a live risk, and an autocomplete wired straight to the browser is the
 * usual way that bill runs away.
 */
import { maps } from '@/lib/maps';

export interface DestinationSuggestion {
  placeId: string;
  primaryText: string;
  secondaryText: string | null;
}

/** Suggestions for what the Seeker has typed so far. Empty for very short input. */
export async function suggestDestinations(query: string): Promise<DestinationSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  try {
    const results = await maps().autocomplete(trimmed);

    return results.slice(0, 6).map((r) => ({
      placeId: r.placeId,
      primaryText: r.primaryText,
      secondaryText: r.secondaryText,
    }));
  } catch (error) {
    // A geocoder outage should quietly cost the Seeker autocomplete, not their search: they can
    // still pick an area or use the current results.
    console.error('[search] autocomplete failed', error);
    return [];
  }
}

export interface ResolvedDestination {
  lat: number;
  lng: number;
  label: string;
}

/** Turns a picked suggestion into the coordinates the search centres on. */
export async function resolveDestination(placeId: string): Promise<ResolvedDestination | null> {
  try {
    const details = await maps().placeDetails(placeId);
    if (!details) return null;

    return {
      lat: details.location.lat,
      lng: details.location.lng,
      label: details.locality ?? details.formattedAddress,
    };
  } catch (error) {
    console.error('[search] place details failed', error);
    return null;
  }
}
