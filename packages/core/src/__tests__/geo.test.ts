import { describe, expect, it } from 'vitest';
import { PILOT_CITY } from '@parking/config';
import { coarsenForSharing, distanceMeters, isInServiceArea } from '../geo';

describe('distanceMeters', () => {
  it('is zero for the same point', () => {
    expect(distanceMeters(PILOT_CITY.center, PILOT_CITY.center)).toBe(0);
  });

  it('measures a known Pune distance to within a few metres', () => {
    // Koregaon Park to Hinjewadi Phase 1 - about 17.4 km as the crow flies.
    const koregaonPark = { lat: 18.5362, lng: 73.8939 };
    const hinjewadi = { lat: 18.5912, lng: 73.7389 };
    const d = distanceMeters(koregaonPark, hinjewadi);
    expect(d).toBeGreaterThan(17_000);
    expect(d).toBeLessThan(17_800);
  });

  it('matches the pin caption: 0.0018 degrees of latitude is about 200 m', () => {
    const a = { lat: 18.5362, lng: 73.8939 };
    const b = { lat: 18.538, lng: 73.8939 };
    expect(Math.round(distanceMeters(a, b))).toBe(200);
  });

  it('is symmetric', () => {
    const a = { lat: 18.5, lng: 73.8 };
    const b = { lat: 18.6, lng: 73.9 };
    expect(distanceMeters(a, b)).toBeCloseTo(distanceMeters(b, a), 6);
  });
});

describe('isInServiceArea', () => {
  it.each([
    ['Pune station', { lat: 18.5289, lng: 73.8744 }],
    ['Hinjewadi Phase 1', { lat: 18.5912, lng: 73.7389 }],
    ['Kharadi', { lat: 18.5519, lng: 73.9476 }],
  ])('includes %s', (_name, point) => {
    expect(isInServiceArea(point)).toBe(true);
  });

  it.each([
    ['Mumbai', { lat: 19.076, lng: 72.8777 }],
    ['Lonavala', { lat: 18.7546, lng: 73.4062 }],
    ['Bengaluru', { lat: 12.9716, lng: 77.5946 }],
  ])('excludes %s', (_name, point) => {
    // A seeker in Mumbai who taps "use my location" should be told the pilot is Pune, not shown
    // an empty results page that looks like the product is broken.
    expect(isInServiceArea(point)).toBe(false);
  });
});

describe('coarsenForSharing', () => {
  it('rounds to three decimal places, about 110 m', () => {
    expect(coarsenForSharing({ lat: 18.536217, lng: 73.893948 })).toEqual({
      lat: 18.536,
      lng: 73.894,
    });
  });

  it('never moves a point by more than a block', () => {
    const exact = { lat: 18.5364999, lng: 73.8934999 };
    expect(distanceMeters(exact, coarsenForSharing(exact))).toBeLessThan(80);
  });
});
