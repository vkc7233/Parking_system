/**
 * Offline maps adapter, backed by a fixture set of real Pune localities.
 *
 * Enough to develop and test the search and listing-creation flows before a Google Maps billing
 * account exists, and to keep CI from making billed network calls.
 *
 * The areas chosen are the ones with genuine parking pressure, which is what §16 asks the pilot
 * to be selected on: the IT corridors (Hinjewadi, Magarpatta, Kharadi), the commercial cores
 * (Camp/MG Road, Deccan, FC Road), the restaurant and nightlife districts (Koregaon Park,
 * Kalyani Nagar, Baner), and the transit hubs (Pune Station, Swargate).
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
  /** Why this area has parking pressure - shown as the suggestion's secondary line. */
  context: string;
}

const FIXTURES: Fixture[] = [
  {
    placeId: 'fake_koregaon_park',
    name: 'Koregaon Park',
    locality: 'Koregaon Park',
    pincode: '411001',
    location: { lat: 18.5362, lng: 73.8939 },
    context: 'Restaurants and nightlife',
  },
  {
    placeId: 'fake_camp',
    name: 'Camp (MG Road)',
    locality: 'Camp',
    pincode: '411001',
    location: { lat: 18.5158, lng: 73.879 },
    context: 'Shopping and offices',
  },
  {
    placeId: 'fake_baner',
    name: 'Baner',
    locality: 'Baner',
    pincode: '411045',
    location: { lat: 18.559, lng: 73.7868 },
    context: 'Offices and restaurants',
  },
  {
    placeId: 'fake_hinjewadi',
    name: 'Hinjewadi',
    locality: 'Hinjewadi',
    pincode: '411057',
    location: { lat: 18.5913, lng: 73.7389 },
    context: 'IT park',
  },
  {
    placeId: 'fake_viman_nagar',
    name: 'Viman Nagar',
    locality: 'Viman Nagar',
    pincode: '411014',
    location: { lat: 18.5679, lng: 73.9143 },
    context: 'Airport and malls',
  },
  {
    placeId: 'fake_kothrud',
    name: 'Kothrud',
    locality: 'Kothrud',
    pincode: '411038',
    location: { lat: 18.5074, lng: 73.8077 },
    context: 'Residential and retail',
  },
  {
    placeId: 'fake_deccan',
    name: 'Deccan Gymkhana',
    locality: 'Deccan',
    pincode: '411004',
    location: { lat: 18.5158, lng: 73.8415 },
    context: 'Colleges and FC Road',
  },
  {
    placeId: 'fake_shivajinagar',
    name: 'Shivajinagar',
    locality: 'Shivajinagar',
    pincode: '411005',
    location: { lat: 18.5308, lng: 73.8475 },
    context: 'Government offices and transit',
  },
  {
    placeId: 'fake_aundh',
    name: 'Aundh',
    locality: 'Aundh',
    pincode: '411007',
    location: { lat: 18.559, lng: 73.8077 },
    context: 'Retail and hospitals',
  },
  {
    placeId: 'fake_magarpatta',
    name: 'Magarpatta City',
    locality: 'Hadapsar',
    pincode: '411013',
    location: { lat: 18.5158, lng: 73.926 },
    context: 'IT park and township',
  },
  {
    placeId: 'fake_kalyani_nagar',
    name: 'Kalyani Nagar',
    locality: 'Kalyani Nagar',
    pincode: '411006',
    location: { lat: 18.548, lng: 73.902 },
    context: 'Restaurants and offices',
  },
  {
    placeId: 'fake_kharadi',
    name: 'Kharadi',
    locality: 'Kharadi',
    pincode: '411014',
    location: { lat: 18.5515, lng: 73.9414 },
    context: 'EON IT Park',
  },
  {
    placeId: 'fake_swargate',
    name: 'Swargate',
    locality: 'Swargate',
    pincode: '411042',
    location: { lat: 18.5018, lng: 73.8636 },
    context: 'Bus terminus and metro',
  },
  {
    placeId: 'fake_pune_station',
    name: 'Pune Railway Station',
    locality: 'Agarkar Nagar',
    pincode: '411001',
    location: { lat: 18.5286, lng: 73.8743 },
    context: 'Railway station',
  },
];

function toResult(
  fixture: Pick<Fixture, 'name' | 'locality' | 'pincode' | 'location' | 'placeId'>,
): GeocodeResult {
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
        pincode: '411001',
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
      secondaryText: `${f.context} · ${PILOT_CITY.name}`,
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
