'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { PILOT_CITY } from '@parking/config';
import type { LatLng } from '@parking/types';

/**
 * The draggable map pin on the listing form (spec §7.2 "Address (map pin)").
 *
 * An address lookup gets you to the building. It does not get you to the gate — and for parking
 * that is the whole difference between a seeker arriving and a seeker phoning the host. Geocoders
 * routinely land on the centroid of a plot or on the main road frontage, and the entrance a car
 * actually uses can be sixty metres and one turn away. This is the correction: the host drags the
 * pin to where the driver should pull in.
 *
 * Dragging deliberately does NOT re-run the geocoder. Reverse geocoding is billed per request and
 * a drag emits many, so an eager version of this would be a quiet multiplier on the Maps bill
 * (spec §16) — and it would be actively wrong, overwriting a street address the host refined by
 * hand with whatever Google calls the nearest feature. The address text and the pin answer two
 * different questions and stay independently editable.
 *
 * Rendered only when a Maps key is configured. Without one the form still works exactly as
 * before: the address lookup sets the coordinates and there is no map.
 */

interface GoogleLatLng {
  lat: () => number;
  lng: () => number;
}

interface GoogleMap {
  setCenter: (position: LatLng) => void;
  setZoom: (zoom: number) => void;
  addListener: (event: string, handler: (e: { latLng: GoogleLatLng }) => void) => void;
}

interface GoogleMarker {
  setPosition: (position: LatLng) => void;
  getPosition: () => GoogleLatLng | undefined;
  addListener: (event: string, handler: () => void) => void;
}

interface GoogleMapsApi {
  Map: new (element: HTMLElement, options: Record<string, unknown>) => GoogleMap;
  Marker: new (options: Record<string, unknown>) => GoogleMarker;
}

/** Metres between two points, for telling the host how far they have moved the pin. */
function metresBetween(a: LatLng, b: LatLng): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

export function PinMap({
  apiKey,
  position,
  geocoded,
  onChange,
}: {
  apiKey: string;
  /** Where the pin is now. */
  position: LatLng;
  /** Where the address lookup put it, so a drag can be measured and undone. */
  geocoded: LatLng | null;
  onChange: (next: LatLng) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GoogleMap | null>(null);
  const markerRef = useRef<GoogleMarker | null>(null);
  const [ready, setReady] = useState(Boolean(globalThis.window?.google?.maps));
  const [failed, setFailed] = useState(false);

  // `onChange` is read through a ref so the map is built once. Rebuilding it on every render of
  // the parent would reset the host's zoom mid-drag, and cost a map load each time.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (window.google?.maps) {
      setReady(true);
      return;
    }

    // Shares the loader the search map uses: two <script> tags for the same API throw, and a
    // host who searched before listing has already paid for this one.
    const existing = document.querySelector<HTMLScriptElement>('script[data-parking-maps]');
    if (existing) {
      const previous = window.__parkingMapsCallback;
      window.__parkingMapsCallback = () => {
        previous?.();
        setReady(true);
      };
      return;
    }

    window.__parkingMapsCallback = () => setReady(true);

    const script = document.createElement('script');
    script.dataset.parkingMaps = 'true';
    script.async = true;
    script.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}` +
      '&loading=async&callback=__parkingMapsCallback';
    script.addEventListener('error', () => setFailed(true));
    document.head.appendChild(script);
  }, [apiKey]);

  const build = useCallback(() => {
    const maps = window.google?.maps as GoogleMapsApi | undefined;
    if (!maps || !containerRef.current || mapRef.current) return;

    mapRef.current = new maps.Map(containerRef.current, {
      center: position,
      // Closer than the search map: this is about picking an entrance, not scanning an area.
      zoom: 18,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      gestureHandling: 'cooperative',
    });

    markerRef.current = new maps.Marker({
      position,
      map: mapRef.current,
      draggable: true,
      title: 'Drag to the entrance a driver should use',
    });

    markerRef.current.addListener('dragend', () => {
      const next = markerRef.current?.getPosition();
      if (next) onChangeRef.current({ lat: next.lat(), lng: next.lng() });
    });

    // Tapping is the usable gesture on a phone, where dragging a pin under your own thumb means
    // you cannot see where it is going.
    mapRef.current.addListener('click', (event) => {
      const next = { lat: event.latLng.lat(), lng: event.latLng.lng() };
      markerRef.current?.setPosition(next);
      onChangeRef.current(next);
    });
  }, [position]);

  useEffect(() => {
    if (ready) build();
  }, [ready, build]);

  // Keeps the pin under an address chosen after the map was built.
  useEffect(() => {
    markerRef.current?.setPosition(position);
    mapRef.current?.setCenter(position);
  }, [position]);

  if (failed) {
    return (
      <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
        The map could not load. The address above still sets the location — you can save without it.
      </p>
    );
  }

  const moved = geocoded ? metresBetween(geocoded, position) : 0;

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
        <div
          ref={containerRef}
          className="h-56 w-full sm:h-64"
          role="application"
          aria-label={`Map of the spot in ${PILOT_CITY.name}. Drag the pin to the entrance.`}
        />
        {!ready ? (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-slate-500">
            Loading map…
          </p>
        ) : null}
      </div>

      <p className="text-xs text-slate-500">
        {moved > 0
          ? `Pin moved ${moved} m from the address. That is what seekers navigate to.`
          : 'Drag the pin, or tap the map, to mark the gate a driver should use.'}
      </p>
    </div>
  );
}
