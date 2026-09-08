'use client';

import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { BOOKING, PILOT_CITY } from '@parking/config';
import { Button } from '@parking/ui';
import {
  resolveDestination,
  suggestDestinations,
  type DestinationSuggestion,
} from './search-actions';

/** Rounds up to the next bookable slot, so the default "when" is always a valid start time. */
function nextSlot(from: Date): Date {
  const ms = BOOKING.slotMinutes * 60_000;
  return new Date(Math.ceil(from.getTime() / ms) * ms);
}

function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/**
 * Destination and arrival-time search (spec §8.1).
 *
 * Two decisions worth stating:
 *
 * Results are a URL, not component state. A seeker who finds a good space near Koregaon Park
 * on Saturday evening can send that link to whoever is meeting them, and it survives a refresh
 * and a back button — which is also what makes the page crawlable (§7.4).
 *
 * The time filter defaults to empty rather than to "now". A blank "when" honestly means "show
 * me everything nearby"; pre-filling it would silently hide spaces that are free later today
 * behind a filter the seeker never chose.
 */
export function SearchBar({
  initialWhere,
  initialStart,
  initialEnd,
}: {
  initialWhere: string;
  initialStart: string;
  initialEnd: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const [where, setWhere] = useState(initialWhere);
  const [suggestions, setSuggestions] = useState<DestinationSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd);

  const fieldId = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  // The text the field held when a suggestion was last chosen, so re-rendering with that value
  // does not immediately reopen the dropdown underneath the seeker.
  const chosenRef = useRef(initialWhere);
  const [minStart] = useState(() => toLocalInputValue(nextSlot(new Date())));

  useEffect(() => {
    if (where.trim().length < 2 || where === chosenRef.current) {
      setSuggestions([]);
      return;
    }

    // Debounced: a geocode per keystroke is both a worse experience and, once this is Google
    // rather than the fixture set, a billed call per keystroke.
    const timer = setTimeout(() => {
      void suggestDestinations(where).then((next) => {
        setSuggestions(next);
        setOpen(next.length > 0);
      });
    }, 250);

    return () => clearTimeout(timer);
  }, [where]);

  useEffect(() => {
    function onDocumentClick(event: MouseEvent) {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocumentClick);
    return () => document.removeEventListener('mousedown', onDocumentClick);
  }, []);

  /** Rewrites the query string, keeping filters the seeker has already set. */
  function submit(next: { lat?: number; lng?: number; label?: string; clearPlace?: boolean }) {
    const query = new URLSearchParams(params.toString());

    if (next.clearPlace) {
      query.delete('lat');
      query.delete('lng');
      query.delete('where');
      query.delete('place');
    }

    if (next.lat !== undefined && next.lng !== undefined) {
      query.delete('place');
      query.set('lat', next.lat.toFixed(6));
      query.set('lng', next.lng.toFixed(6));
      if (next.label) query.set('where', next.label);
    }

    if (start) query.set('start', start);
    else query.delete('start');

    if (end) query.set('end', end);
    else query.delete('end');

    const qs = query.toString();
    startTransition(() => router.push(qs ? `/?${qs}` : '/'));
  }

  function choose(suggestion: DestinationSuggestion) {
    setOpen(false);
    setWhere(suggestion.primaryText);
    chosenRef.current = suggestion.primaryText;

    startTransition(async () => {
      const resolved = await resolveDestination(suggestion.placeId);
      if (resolved) {
        submit({ lat: resolved.lat, lng: resolved.lng, label: suggestion.primaryText });
      }
    });
  }

  const inputClass =
    'h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 ' +
    'shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none';

  return (
    <form
      className="grid gap-2.5 sm:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_minmax(0,1.3fr)_auto]"
      onSubmit={(event) => {
        event.preventDefault();

        // Enter with the dropdown open takes the first match; that is what the seeker means.
        if (open && suggestions[0]) {
          choose(suggestions[0]);
          return;
        }
        submit(where.trim() === '' ? { clearPlace: true } : {});
      }}
    >
      <div ref={boxRef} className="relative">
        <label htmlFor={fieldId} className="sr-only">
          Where are you going?
        </label>
        <input
          id={fieldId}
          type="text"
          value={where}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={`${fieldId}-list`}
          placeholder={`Where in ${PILOT_CITY.name}?`}
          onChange={(event) => setWhere(event.target.value)}
          onFocus={() => setOpen(suggestions.length > 0)}
          className={inputClass}
        />

        {open && suggestions.length > 0 ? (
          <ul
            id={`${fieldId}-list`}
            role="listbox"
            className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
          >
            {suggestions.map((suggestion) => (
              <li key={suggestion.placeId}>
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  onClick={() => choose(suggestion)}
                  className="block w-full px-3.5 py-2 text-left hover:bg-slate-50"
                >
                  <span className="block text-sm font-medium text-slate-900">
                    {suggestion.primaryText}
                  </span>
                  {suggestion.secondaryText ? (
                    <span className="block text-xs text-slate-500">{suggestion.secondaryText}</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div>
        <label htmlFor={`${fieldId}-start`} className="sr-only">
          Arriving
        </label>
        <input
          id={`${fieldId}-start`}
          type="datetime-local"
          value={start}
          min={minStart}
          step={BOOKING.slotMinutes * 60}
          onChange={(event) => setStart(event.target.value)}
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor={`${fieldId}-end`} className="sr-only">
          Leaving
        </label>
        <input
          id={`${fieldId}-end`}
          type="datetime-local"
          value={end}
          min={start || minStart}
          step={BOOKING.slotMinutes * 60}
          onChange={(event) => setEnd(event.target.value)}
          className={inputClass}
        />
      </div>

      <Button type="submit" className="h-11" disabled={pending}>
        {pending ? 'Searching…' : 'Search'}
      </Button>
    </form>
  );
}
