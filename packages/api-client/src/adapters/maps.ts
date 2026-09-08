/**
 * Maps and geocoding adapter (spec section 9.6).
 *
 * Spec 9.6 asks explicitly for "a thin internal abstraction so an alternative (e.g. Mapbox)
 * can be substituted later without a full rewrite if cost or styling needs change", and
 * section 16 lists Google Maps cost growth as a named risk. This interface is that
 * abstraction. Nothing outside `maps.*.ts` may import a provider SDK.
 *
 * Note what is NOT here: rendering. Drawing the map is a component concern
 * (`packages/ui`), and only the data operations - geocoding, reverse geocoding,
 * autocomplete - are billed per call and therefore worth abstracting for cost reasons.
 */
import type { LatLng } from '@parking/types';

export interface GeocodeResult {
  formattedAddress: string;
  location: LatLng;
  locality: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  /** Provider place id, retained so a re-geocode is a cheap lookup rather than a fresh search. */
  placeId: string | null;
}

export interface PlaceSuggestion {
  placeId: string;
  description: string;
  primaryText: string;
  secondaryText: string | null;
}

export interface MapsAdapter {
  readonly name: string;

  /** Address text to coordinates - used when a Host types an address instead of dropping a pin. */
  geocode(address: string): Promise<GeocodeResult | null>;

  /** Coordinates to address - used when a Host drops the map pin, and for "near me" search. */
  reverseGeocode(location: LatLng): Promise<GeocodeResult | null>;

  /**
   * Destination autocomplete on the Seeker search bar. Biased to the pilot city so a
   * two-character query returns somewhere in Pune rather than somewhere in Ontario.
   */
  autocomplete(input: string, options?: { sessionToken?: string }): Promise<PlaceSuggestion[]>;

  /** Resolves a suggestion the Seeker picked into coordinates. */
  placeDetails(placeId: string, options?: { sessionToken?: string }): Promise<GeocodeResult | null>;
}

/** Great-circle distance in metres. Used for display and for the fake adapter's ordering. */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);

  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Formats a distance the way the search results list shows it. */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export class MapsAdapterError extends Error {
  constructor(
    message: string,
    readonly code: 'provider_error' | 'quota_exceeded' | 'not_found',
  ) {
    super(message);
    this.name = 'MapsAdapterError';
  }
}
