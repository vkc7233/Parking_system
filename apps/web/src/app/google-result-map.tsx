'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatDistance } from '@parking/api-client';
import { formatPaise } from '@parking/core';
import { PILOT_CITY } from '@parking/config';
import type { LatLng, SearchResult } from '@parking/types';

/**
 * The search map, on real Google tiles (spec §7.1, §8.1, §9.6).
 *
 * Rendered only when a Maps key is configured; `ResultMap` draws the schematic otherwise. §9.6
 * deliberately keeps rendering outside the maps adapter — the adapter abstracts the *billed data
 * calls* (geocoding, autocomplete), and this is the part that draws — which is why the two could
 * be built months apart and why swapping to Mapbox later touches this file and not the search.
 *
 * The script is loaded here rather than in the root layout: Maps bills per map load, and a
 * seeker reading the Terms should not cost a map load.
 */

interface GoogleLatLng {
  lat: number;
  lng: number;
}

interface GoogleMap {
  fitBounds: (bounds: unknown, padding?: number) => void;
  setCenter: (position: GoogleLatLng) => void;
}

interface GoogleMarker {
  addListener: (event: string, handler: () => void) => void;
  setMap: (map: GoogleMap | null) => void;
}

interface GoogleMapsApi {
  Map: new (element: HTMLElement, options: Record<string, unknown>) => GoogleMap;
  Marker: new (options: Record<string, unknown>) => GoogleMarker;
  LatLngBounds: new () => { extend: (position: GoogleLatLng) => void };
  Size: new (width: number, height: number) => unknown;
  Point: new (x: number, y: number) => unknown;
}

declare global {
  interface Window {
    google?: { maps?: GoogleMapsApi };
    __parkingMapsCallback?: () => void;
  }
}

/** A price bubble, drawn as an SVG data URI so it needs no image request and scales cleanly. */
function priceMarkerIcon(label: string, selected: boolean): string {
  const width = Math.max(46, label.length * 9 + 20);
  const bg = selected ? '#0f172a' : '#ffffff';
  const fg = selected ? '#ffffff' : '#0f172a';

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="30">` +
    `<rect x="0.5" y="0.5" width="${width - 1}" height="27" rx="13.5" fill="${bg}" ` +
    `stroke="${selected ? '#0f172a' : '#cbd5e1'}"/>` +
    `<text x="${width / 2}" y="18.5" text-anchor="middle" font-family="system-ui,sans-serif" ` +
    `font-size="12" font-weight="600" fill="${fg}">${label}</text></svg>`;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export function GoogleResultMap({
  apiKey,
  results,
  center,
  centerLabel,
}: {
  apiKey: string;
  results: SearchResult[];
  center: LatLng;
  centerLabel: string;
}) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GoogleMap | null>(null);
  const markersRef = useRef<GoogleMarker[]>([]);
  const [ready, setReady] = useState(Boolean(globalThis.window?.google?.maps));
  const [failed, setFailed] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (window.google?.maps) {
      setReady(true);
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>('script[data-parking-maps]');
    if (existing) {
      const onReady = () => setReady(true);
      window.__parkingMapsCallback = onReady;
      return;
    }

    window.__parkingMapsCallback = () => setReady(true);

    const script = document.createElement('script');
    script.dataset.parkingMaps = 'true';
    script.async = true;
    script.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}` +
      '&libraries=marker&loading=async&callback=__parkingMapsCallback';
    script.addEventListener('error', () => setFailed(true));
    document.head.appendChild(script);
  }, [apiKey]);

  const draw = useCallback(() => {
    const maps = window.google?.maps;
    if (!maps || !containerRef.current) return;

    mapRef.current ??= new maps.Map(containerRef.current, {
      center,
      zoom: PILOT_CITY.defaultMapZoom,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      // Keeps the surrounding chrome legible on a phone, where the map is a band not a canvas.
      gestureHandling: 'cooperative',
    });

    for (const marker of markersRef.current) marker.setMap(null);
    markersRef.current = [];

    const bounds = new maps.LatLngBounds();
    bounds.extend(center);

    // The destination itself, so a seeker can see which pins are on their side of it.
    markersRef.current.push(
      new maps.Marker({
        position: center,
        map: mapRef.current,
        title: centerLabel,
        zIndex: 1,
      }),
    );

    for (const listing of results) {
      const selected = listing.id === selectedId;
      const marker = new maps.Marker({
        position: listing.location,
        map: mapRef.current,
        title: `${listing.title} · ${formatDistance(listing.distanceMeters)} away`,
        zIndex: selected ? 100 : 10,
        icon: {
          url: priceMarkerIcon(formatPaise(listing.pricePerHour, { showDecimals: false }), selected),
          scaledSize: new maps.Size(Math.max(46, 10 * 9 + 20), 30),
          anchor: new maps.Point(23, 15),
        },
      });

      // One tap selects, a second opens — the same behaviour as the schematic map, so the
      // interaction does not change when tiles appear.
      marker.addListener('click', () => {
        if (listing.id === selectedId) router.push(`/listings/${listing.id}`);
        else setSelectedId(listing.id);
      });

      markersRef.current.push(marker);
      bounds.extend(listing.location);
    }

    if (results.length > 0) mapRef.current.fitBounds(bounds, 48);
    else mapRef.current.setCenter(center);
  }, [center, centerLabel, results, selectedId, router]);

  useEffect(() => {
    if (ready) draw();
  }, [ready, draw]);

  if (failed) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        The map could not load. The list beside it is complete and unaffected.
      </div>
    );
  }

  const selected = results.find((r) => r.id === selectedId) ?? null;

  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
      <div ref={containerRef} className="h-80 w-full md:h-[28rem]" role="application" aria-label={`Map of spaces near ${centerLabel}`} />

      {!ready ? (
        <p className="absolute inset-0 flex items-center justify-center text-sm text-slate-500">
          Loading map…
        </p>
      ) : null}

      {selected ? (
        <p className="absolute inset-x-2 bottom-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 shadow-lg">
          <span className="font-semibold text-slate-900">{selected.title}</span> ·{' '}
          {formatDistance(selected.distanceMeters)} away · tap the pin again to open
        </p>
      ) : null}
    </div>
  );
}
