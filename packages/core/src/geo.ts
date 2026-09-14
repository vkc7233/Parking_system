/**
 * Distance on the ground, for decisions the UI makes before asking the database.
 *
 * The search itself is a PostGIS geography query and stays that way — this is not a replacement
 * for it. It exists for two client-side judgements that do not warrant a round trip: how far a
 * host has dragged the map pin from the address, and whether a seeker who tapped "use my
 * location" is anywhere near the pilot city at all.
 */
import { PILOT_CITY } from '@parking/config';
import type { LatLng } from '@parking/types';

const EARTH_RADIUS_METERS = 6_371_000;

/**
 * Great-circle distance in metres (haversine).
 *
 * Accurate to well under 0.5% at city scale, which is far finer than either question needs. The
 * earth is not a sphere, but the error that introduces is metres over Pune, not the hundreds that
 * would change an answer.
 */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** True when a point is close enough to the pilot city that searching around it can find spaces. */
export function isInServiceArea(point: LatLng): boolean {
  return distanceMeters(point, PILOT_CITY.center) <= PILOT_CITY.serviceAreaRadiusMeters;
}

/**
 * Coarsens a seeker's own coordinates before they go into a URL.
 *
 * A search link is made to be shared — "here are spaces near where I am" — and six decimal places
 * is about 10 cm: precise enough to identify the building someone is standing in, sent to
 * whoever they paste it to. Three decimals is about 110 m, which changes nothing about a search
 * whose smallest radius is 1 km. Spec §12 asks for DPDP-aligned handling of personal data, and
 * a person's live location is personal data.
 */
export function coarsenForSharing(point: LatLng): LatLng {
  const round = (n: number) => Math.round(n * 1000) / 1000;
  return { lat: round(point.lat), lng: round(point.lng) };
}
