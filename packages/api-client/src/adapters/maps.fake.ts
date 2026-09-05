/**
 * Offline maps adapter, backed by a small fixture set of real Ahmedabad localities.
 *
 * Enough to develop and test the search and listing-creation flows before a Google Maps
 * billing account exists, and to keep CI from making billed network calls.
 */
import { PILOT_CITY } from '@parking/config';
import type { LatLng } from '@parking/types';
import {
  haversineMeters,
  type GeocodeResult,
  type MapsAdapter,
  type PlaceSuggestion,
} from './maps';

interface Fixture {
  placeId: string;
  name: string;
  locality: string;
  pincode: string;
  location: LatLng;
}

const FIXTURES: Fixture[] = [
  {
    placeId: 'fake_navrangpura',
    name: 'Navrangpura',
    locality: 'Navrangpura',
    pincode: '380009',
    location: { lat: 23.0339, lng: 72.5613 },
  },
  {
    placeId: 'fake_prahladnagar',
    name: 'Prahlad Nagar',
    locality: 'Prahlad Nagar',
    pincode: '380015',
    location: { lat: 23.0106, lng: 72.5074 },
  },
  {
    placeId: 'fake_ellisbridge',
    name: 'Ellisbridge',
    locality: 'Ellisbridge',
    pincode: '380006',
    location: { lat: 23.0225, lng: 72.5652 },
  },
  {
    placeId: 'fake_bodakdev',
    name: 'Bodakdev',
    locality: 'Bodakdev',
    pincode: '380054',
    location: { lat: 23.0395, lng: 72.5075 },
  },
  {
    placeId: 'fake_maninagar',
    name: 'Maninagar',
    locality: 'Maninagar',
    pincode: '380008',
    location: { lat: 22.9964, lng: 72.6009 },
  },
  {
    placeId: 'fake_satellite',
    name: 'Satellite',
    locality: 'Satellite',
    pincode: '380015',
    location: { lat: 23.0296, lng: 72.5177 },
  },
  {
    placeId: 'fake_vastrapur',
    name: 'Vastrapur',
    locality: 'Vastrapur',
    pincode: '380015',
    location: { lat: 23.0395, lng: 72.5288 },
  },
  {
    placeId: 'fake_cgroad',
    name: 'C G Road',
    locality: 'Navrangpura',
    pincode: '380009',
    location: { lat: 23.0276, lng: 72.5619 },
  },
];

function toResult(fixture: Fixture): GeocodeResult {
  return {
    formattedAddress: `${fixture.name}, ${PILOT_CITY.name}, ${PILOT_CITY.state} ${fixture.pincode}, India`,
    location: fixture.location,
    locality: fixture.locality,
    city: PILOT_CITY.name,
    state: PILOT_CITY.state,
    pincode: fixture.pincode,
    placeId: fixture.placeId,
  };
}

export class FakeMapsAdapter implements MapsAdapter {
  readonly name = 'fake';

  /** Every call made, so tests can assert the session-token discipline is being followed. */
  readonly calls: { method: string; arg: string; sessionToken?: string }[] = [];

  async geocode(address: string): Promise<GeocodeResult | null> {
    this.calls.push({ method: 'geocode', arg: address });

    const needle = address.toLowerCase();
    const match = FIXTURES.find(
      (f) => needle.includes(f.name.toLowerCase()) || needle.includes(f.locality.toLowerCase()),
    );

    // An unrecognised address still geocodes - to the city centre - so a Host typing something
    // the fixture set has never heard of does not hit a dead end in local development.
    return toResult(
      match ?? {
        placeId: 'fake_city_centre',
        name: address.slice(0, 60),
        locality: PILOT_CITY.name,
        pincode: '380001',
        location: PILOT_CITY.center,
      },
    );
  }

  async reverseGeocode(location: LatLng): Promise<GeocodeResult | null> {
    this.calls.push({ method: 'reverseGeocode', arg: `${location.lat},${location.lng}` });

    const nearest = [...FIXTURES].sort(
      (a, b) => haversineMeters(location, a.location) - haversineMeters(location, b.location),
    )[0];

    return nearest ? { ...toResult(nearest), location } : null;
  }

  async autocomplete(
    input: string,
    options: { sessionToken?: string } = {},
  ): Promise<PlaceSuggestion[]> {
    this.calls.push({ method: 'autocomplete', arg: input, ...options });
    if (input.trim().length < 2) return [];

    const needle = input.toLowerCase();
    return FIXTURES.filter(
      (f) => f.name.toLowerCase().includes(needle) || f.locality.toLowerCase().includes(needle),
    ).map((f) => ({
      placeId: f.placeId,
      description: `${f.name}, ${PILOT_CITY.name}, ${PILOT_CITY.state}`,
      primaryText: f.name,
      secondaryText: `${PILOT_CITY.name}, ${PILOT_CITY.state}`,
    }));
  }

  async placeDetails(
    placeId: string,
    options: { sessionToken?: string } = {},
  ): Promise<GeocodeResult | null> {
    this.calls.push({ method: 'placeDetails', arg: placeId, ...options });
    const fixture = FIXTURES.find((f) => f.placeId === placeId);
    return fixture ? toResult(fixture) : null;
  }

  reset(): void {
    this.calls.length = 0;
  }
}
