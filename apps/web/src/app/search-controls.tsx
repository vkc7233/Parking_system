'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { PILOT_CITY } from '@parking/config';
import type { SpotType } from '@parking/types';

/**
 * Search filters (spec §7.1: "applying a filter updates results without a full page reload").
 *
 * Filters are written to the URL and the route re-renders on the server. `router.replace` inside
 * a transition keeps the current results on screen while the new ones are fetched, so applying a
 * filter never blanks the page — which is the behaviour that acceptance criterion is really
 * about.
 */

const SPOT_TYPES: { value: SpotType | ''; label: string }[] = [
  { value: '', label: 'Any type' },
  { value: 'covered', label: 'Covered' },
  { value: 'open', label: 'Open' },
  { value: 'basement', label: 'Basement' },
  { value: 'stilt', label: 'Stilt' },
  { value: 'garage', label: 'Garage' },
  { value: 'driveway', label: 'Driveway' },
];

const RADII = [1000, 3000, 5000, 10000, 25000];

const selectClass =
  'rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 ' +
  'focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900';

export function SearchControls({
  radius,
  maxPrice,
  spotType,
  resultCount,
}: {
  radius: number;
  maxPrice: string;
  spotType: string;
  resultCount: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function apply(key: string, value: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (value) next.set(key, value);
    else next.delete(key);

    startTransition(() => {
      router.replace(next.toString() ? '/?' + next.toString() : '/', { scroll: false });
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="sr-only" htmlFor="filter-radius">
        Search radius
      </label>
      <select
        id="filter-radius"
        className={selectClass}
        value={String(radius)}
        onChange={(e) => apply('radius', e.target.value)}
      >
        {RADII.map((r) => (
          <option key={r} value={r}>
            Within {r / 1000} km
          </option>
        ))}
      </select>

      <label className="sr-only" htmlFor="filter-type">
        Spot type
      </label>
      <select
        id="filter-type"
        className={selectClass}
        value={spotType}
        onChange={(e) => apply('spotType', e.target.value)}
      >
        {SPOT_TYPES.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>

      <label className="sr-only" htmlFor="filter-price">
        Maximum price per hour
      </label>
      <select
        id="filter-price"
        className={selectClass}
        value={maxPrice}
        onChange={(e) => apply('maxPrice', e.target.value)}
      >
        <option value="">Any price</option>
        {[20, 30, 40, 50, 100].map((p) => (
          <option key={p} value={p}>
            Up to ₹{p}/hour
          </option>
        ))}
      </select>

      <p className="text-sm text-slate-600" aria-live="polite">
        {isPending
          ? 'Updating…'
          : resultCount + ' space' + (resultCount === 1 ? '' : 's') + ' near ' + PILOT_CITY.name}
      </p>
    </div>
  );
}
