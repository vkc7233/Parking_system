'use server';

/**
 * Address lookup for the listing form.
 *
 * These stay on the server so the maps provider remains swappable (spec §9.6 asks for exactly
 * that abstraction) and so a Google billing key is never shipped to a browser. Locally the fake
 * adapter answers from Pune fixtures, and no billed call is made.
 */
import { createMapsAdapter, type PlaceSuggestion } from '@parking/api-client';
import type { LatLng } from '@parking/types';
import { getProfile } from '@/lib/auth';

export interface ResolvedAddress {
  formattedAddress: string;
  location: LatLng;
  locality: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
}

function adapter() {
  return createMapsAdapter({
    MAPS_PROVIDER: process.env.NEXT_PUBLIC_MAPS_PROVIDER,
    GOOGLE_MAPS_API_KEY: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
  });
}

/**
 * Autocomplete is billed per keystroke-session, so it is gated behind a signed-in user. An open
 * endpoint here would let anyone spend the platform's Maps budget (spec §16 names that cost as
 * a risk).
 */
export async function suggestAddresses(
  query: string,
  sessionToken?: string,
): Promise<PlaceSuggestion[]> {
  if (!(await getProfile())) return [];
  if (query.trim().length < 2) return [];

  try {
    return await adapter().autocomplete(query, sessionToken ? { sessionToken } : {});
  } catch {
    // A maps outage must not block the form: the Host can still type an address and geocode it.
    return [];
  }
}

export async function resolvePlace(
  placeId: string,
  sessionToken?: string,
): Promise<ResolvedAddress | null> {
  if (!(await getProfile())) return null;

  try {
    const result = await adapter().placeDetails(placeId, sessionToken ? { sessionToken } : {});
    return result ? toResolved(result) : null;
  } catch {
    return null;
  }
}

/** Fallback when the Host types an address rather than picking a suggestion. */
export async function geocodeAddress(address: string): Promise<ResolvedAddress | null> {
  if (!(await getProfile())) return null;
  if (address.trim().length < 4) return null;

  try {
    const result = await adapter().geocode(address);
    return result ? toResolved(result) : null;
  } catch {
    return null;
  }
}

function toResolved(r: {
  formattedAddress: string;
  location: LatLng;
  locality: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
}): ResolvedAddress {
  return {
    formattedAddress: r.formattedAddress,
    location: r.location,
    locality: r.locality,
    city: r.city,
    state: r.state,
    pincode: r.pincode,
  };
}
