'use client';

import { useState } from 'react';
import Link from 'next/link';
import { formatDistance } from '@parking/api-client';
import { formatPaise } from '@parking/core';
import type { LatLng, SearchResult } from '@parking/types';

/**
 * The map half of the search screen (spec §8.1).
 *
 * This draws the geometry — where each space sits relative to the destination, and how far the
 * search reaches — without street tiles, because tiles are the part that needs a Google Maps
 * billing account. §9.6 puts rendering outside the maps adapter precisely so the two can arrive
 * separately: the pins, the selection behaviour and the card-on-tap are all here already, and
 * swapping the backdrop for real tiles later changes this file and nothing else.
 *
 * It is drawn honestly rather than dressed up as a street map: a compass, a scale ring and
 * labelled bearings. A seeker learns the thing that actually decides the booking — is this
 * space on my side of the road junction, or a fifteen-minute walk the wrong way.
 */

const SIZE = 320;
const PADDING = 34;

interface Placed {
  listing: SearchResult;
  x: number;
  y: number;
}

/**
 * Projects lat/lng to the drawing square.
 *
 * Longitude degrees shrink by cos(latitude), so using raw degrees would stretch the plot
 * east-west and misrepresent which of two spaces is nearer. At Pune's latitude that error is
 * about 5%, which is enough to reorder two pins.
 */
function project(points: LatLng[], center: LatLng): { x: number; y: number }[] {
  const cosLat = Math.cos((center.lat * Math.PI) / 180);
  const raw = points.map((p) => ({
    dx: (p.lng - center.lng) * cosLat,
    dy: center.lat - p.lat,
  }));

  const extent = Math.max(
    ...raw.map((r) => Math.max(Math.abs(r.dx), Math.abs(r.dy))),
    // A floor, so a single pin almost on top of the centre does not zoom to absurdity.
    0.0025,
  );

  const scale = (SIZE / 2 - PADDING) / extent;
  return raw.map((r) => ({ x: SIZE / 2 + r.dx * scale, y: SIZE / 2 + r.dy * scale }));
}

export function ResultMap({
  results,
  center,
  centerLabel,
}: {
  results: SearchResult[];
  center: LatLng;
  centerLabel: string;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const projected = project(
    results.map((r) => r.location),
    center,
  );

  const placed: Placed[] = results.map((listing, i) => ({
    listing,
    x: projected[i]!.x,
    y: projected[i]!.y,
  }));

  const selected = placed.find((p) => p.listing.id === selectedId) ?? null;
  const furthest = Math.max(...results.map((r) => r.distanceMeters), 0);

  return (
    // Capped rather than fluid: the plot is drawn in a fixed 320-unit square, so letting it fill
    // a wide column scales the compass and scale labels up with it and the map starts shouting.
    <div className="relative mx-auto max-w-sm overflow-hidden rounded-xl border border-slate-200 bg-slate-100 lg:max-w-none">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="block w-full"
        role="img"
        aria-label={`${results.length} spaces plotted around ${centerLabel}`}
      >
        <defs>
          <pattern id="map-grid" width="32" height="32" patternUnits="userSpaceOnUse">
            <path
              d="M 32 0 L 0 0 0 32"
              fill="none"
              stroke="var(--color-slate-200)"
              strokeWidth="1"
            />
          </pattern>
        </defs>

        <rect width={SIZE} height={SIZE} fill="var(--color-slate-50)" />
        <rect width={SIZE} height={SIZE} fill="url(#map-grid)" />

        {/* Distance rings: half and full of the furthest result, so the ring is meaningful. */}
        {[0.5, 1].map((fraction) => (
          <circle
            key={fraction}
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={(SIZE / 2 - PADDING) * fraction}
            fill="none"
            stroke="var(--color-brand-500)"
            strokeOpacity={0.22}
            strokeDasharray="4 4"
          />
        ))}

        {furthest > 0 ? (
          <text
            x={SIZE / 2 + 4}
            y={SIZE / 2 - (SIZE / 2 - PADDING) - 5}
            className="fill-slate-500"
            fontSize="9"
          >
            {formatDistance(furthest)}
          </text>
        ) : null}

        {['N', 'E', 'S', 'W'].map((label, i) => {
          const pos = [
            { x: SIZE / 2, y: 12 },
            { x: SIZE - 10, y: SIZE / 2 + 3 },
            { x: SIZE / 2, y: SIZE - 6 },
            { x: 10, y: SIZE / 2 + 3 },
          ][i]!;
          return (
            <text
              key={label}
              x={pos.x}
              y={pos.y}
              textAnchor="middle"
              fontSize="9"
              className="fill-slate-400"
            >
              {label}
            </text>
          );
        })}

        {/* The destination. */}
        <circle cx={SIZE / 2} cy={SIZE / 2} r="7" fill="var(--color-brand-600)" fillOpacity="0.2" />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r="3.5"
          fill="var(--color-brand-600)"
          stroke="white"
          strokeWidth="1.5"
        />

        {placed.map(({ listing, x, y }) => {
          const isSelected = listing.id === selectedId;
          return (
            <g
              key={listing.id}
              onClick={() => setSelectedId(isSelected ? null : listing.id)}
              className="cursor-pointer"
            >
              <circle
                cx={x}
                cy={y}
                r={isSelected ? 15 : 13}
                fill={isSelected ? 'var(--color-slate-900)' : 'white'}
                stroke={isSelected ? 'var(--color-slate-900)' : 'var(--color-slate-300)'}
                strokeWidth="1.5"
                className="drop-shadow-sm"
              />
              <text
                x={x}
                y={y + 3.5}
                textAnchor="middle"
                fontSize="10"
                fontWeight="600"
                fill={isSelected ? 'white' : 'var(--color-slate-800)'}
                className="pointer-events-none select-none"
              >
                {formatPaise(listing.pricePerHour, { showDecimals: false })}
              </text>
            </g>
          );
        })}
      </svg>

      <p className="absolute top-2 left-2 rounded-full bg-white/95 px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm">
        {centerLabel}
      </p>

      {selected ? (
        <Link
          href={`/listings/${selected.listing.id}`}
          className="absolute inset-x-2 bottom-2 block rounded-lg border border-slate-200 bg-white p-3 shadow-lg transition hover:border-slate-300"
        >
          <p className="truncate text-sm font-semibold text-slate-900">{selected.listing.title}</p>
          <p className="mt-0.5 truncate text-xs text-slate-600">
            {selected.listing.locality ? `${selected.listing.locality} · ` : ''}
            {formatDistance(selected.listing.distanceMeters)} away ·{' '}
            {formatPaise(selected.listing.pricePerHour, { showDecimals: false })}/hour
          </p>
        </Link>
      ) : (
        <p className="absolute inset-x-2 bottom-2 rounded-lg bg-white/95 px-3 py-2 text-xs text-slate-600 shadow-sm">
          Tap a price to see the space. Rings show {formatDistance(furthest / 2)} and{' '}
          {formatDistance(furthest)} from {centerLabel}.
        </p>
      )}
    </div>
  );
}
