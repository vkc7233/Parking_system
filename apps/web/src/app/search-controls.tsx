'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
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

// Native selects with the arrow drawn in, so the control looks deliberate on every platform
// rather than borrowing whatever the OS supplies.
const selectClass =
  'h-9 appearance-none rounded-full border border-slate-300 bg-white bg-[length:14px] ' +
  'bg-[position:right_0.7rem_center] bg-no-repeat pr-8 pl-3.5 text-sm font-medium ' +
  'text-slate-700 shadow-sm transition hover:border-slate-400 ' +
  'focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none';

const CHEVRON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='M4 6l4 4 4-4'/%3E%3C/svg%3E\")";

export function SearchControls({
  radius,
  maxPrice,
  spotType,
  resultCount,
  nearLabel,
}: {
  radius: number;
  maxPrice: string;
  spotType: string;
  resultCount: number;
  /** Where the search is centred, so the count names the place the seeker actually asked for. */
  nearLabel: string;
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
    <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor="filter-radius">
        Search radius
      </label>
      <select
        id="filter-radius"
        style={{ backgroundImage: CHEVRON }}
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
        style={{ backgroundImage: CHEVRON }}
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
        style={{ backgroundImage: CHEVRON }}
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
          : resultCount + ' space' + (resultCount === 1 ? '' : 's') + ' near ' + nearLabel}
      </p>
    </div>
  );
}
