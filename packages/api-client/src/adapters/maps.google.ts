/**
 * Google Maps Platform implementation of MapsAdapter (spec section 9.6).
 *
 * Two cost-control details, because spec section 16 names Maps API spend as a risk:
 *
 *  - Autocomplete uses a session token. Google bills autocomplete keystrokes plus the final
 *    Place Details call as ONE session when a token is passed, and per-request when it is
 *    not. Forgetting the token is the single easiest way to multiply the maps bill.
 *  - Results are biased and restricted to India, so a stray query cannot fan out worldwide.
 */
import { PILOT_CITY } from '@parking/config';
import type { LatLng } from '@parking/types';
import {
  MapsAdapterError,
  type GeocodeResult,
  type MapsAdapter,
  type PlaceSuggestion,
} from './maps';

interface AddressComponent {
  long_name: string;
  short_name: string;
  types: string[];
}

interface GoogleGeocodeResult {
  formatted_address: string;
  geometry: { location: { lat: number; lng: number } };
  address_components: AddressComponent[];
  place_id: string;
}

interface GoogleGeocodeResponse {
  status: string;
  results: GoogleGeocodeResult[];
  error_message?: string;
}

export interface GoogleMapsConfig {
  apiKey: string;
  apiBase?: string;
}

export class GoogleMapsAdapter implements MapsAdapter {
  readonly name = 'google';
  private readonly apiBase: string;

  constructor(private readonly config: GoogleMapsConfig) {
    if (!config.apiKey) {
      throw new MapsAdapterError('GOOGLE_MAPS_API_KEY is required', 'provider_error');
    }
    this.apiBase = config.apiBase ?? 'https://maps.googleapis.com/maps/api';
  }

  private async get<T extends { status: string; error_message?: string }>(
    path: string,
    params: Record<string, string>,
  ): Promise<T> {
    const url = new URL(`${this.apiBase}${path}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    url.searchParams.set('key', this.config.apiKey);

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new MapsAdapterError(
        `Google Maps ${path} failed with ${response.status}`,
        'provider_error',
      );
    }

    const body = (await response.json()) as T;

    if (body.status === 'OVER_QUERY_LIMIT') {
      throw new MapsAdapterError(
        'Google Maps quota exceeded - check billing and the usage cap (spec section 16)',
        'quota_exceeded',
      );
    }
    if (body.status !== 'OK' && body.status !== 'ZERO_RESULTS') {
      throw new MapsAdapterError(
        `Google Maps ${path} returned ${body.status}: ${body.error_message ?? 'no detail'}`,
        'provider_error',
      );
    }

    return body;
  }

  async geocode(address: string): Promise<GeocodeResult | null> {
    const body = await this.get<GoogleGeocodeResponse>('/geocode/json', {
      address,
      region: PILOT_CITY.countryCode.toLowerCase(),
      components: `country:${PILOT_CITY.countryCode}`,
    });
    const first = body.results[0];
    return first ? toGeocodeResult(first) : null;
  }

  async reverseGeocode(location: LatLng): Promise<GeocodeResult | null> {
    const body = await this.get<GoogleGeocodeResponse>('/geocode/json', {
      latlng: `${location.lat},${location.lng}`,
    });
    const first = body.results[0];
    return first ? toGeocodeResult(first) : null;
  }

  async autocomplete(
    input: string,
    options: { sessionToken?: string } = {},
  ): Promise<PlaceSuggestion[]> {
    if (input.trim().length < 2) return [];

    const body = await this.get<{
      status: string;
      predictions: {
        place_id: string;
        description: string;
        structured_formatting: { main_text: string; secondary_text?: string };
      }[];
    }>('/place/autocomplete/json', {
      input,
      components: `country:${PILOT_CITY.countryCode}`,
      // Bias, not restriction: a Seeker may legitimately search just outside the pilot city.
      location: `${PILOT_CITY.center.lat},${PILOT_CITY.center.lng}`,
      radius: String(PILOT_CITY.maxSearchRadiusMeters),
      ...(options.sessionToken ? { sessiontoken: options.sessionToken } : {}),
    });

    return body.predictions.map((p) => ({
      placeId: p.place_id,
      description: p.description,
      primaryText: p.structured_formatting.main_text,
      secondaryText: p.structured_formatting.secondary_text ?? null,
    }));
  }

  async placeDetails(
    placeId: string,
    options: { sessionToken?: string } = {},
  ): Promise<GeocodeResult | null> {
    const body = await this.get<{ status: string; result?: GoogleGeocodeResult }>(
      '/place/details/json',
      {
        place_id: placeId,
        // Field mask: Google bills Place Details by the fields requested, so asking for
        // everything costs several times what this does.
        fields: 'formatted_address,geometry/location,address_components,place_id',
        ...(options.sessionToken ? { sessiontoken: options.sessionToken } : {}),
      },
    );

    return body.result ? toGeocodeResult(body.result) : null;
  }
}

function component(components: AddressComponent[], type: string): string | null {
  return components.find((c) => c.types.includes(type))?.long_name ?? null;
}

function toGeocodeResult(result: GoogleGeocodeResult): GeocodeResult {
  const c = result.address_components;
  return {
    formattedAddress: result.formatted_address,
    location: { lat: result.geometry.location.lat, lng: result.geometry.location.lng },
    locality: component(c, 'sublocality_level_1') ?? component(c, 'neighborhood'),
    city: component(c, 'locality') ?? component(c, 'administrative_area_level_2'),
    state: component(c, 'administrative_area_level_1'),
    pincode: component(c, 'postal_code'),
    placeId: result.place_id,
  };
}
