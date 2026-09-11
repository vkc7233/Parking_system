'use client';

import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { Badge, Field, Input } from '@parking/ui';
import { PILOT_CITY } from '@parking/config';
import type { LatLng } from '@parking/types';
import {
  geocodeAddress,
  resolvePlace,
  suggestAddresses,
  type ResolvedAddress,
} from './location-actions';
import { PinMap } from './pin-map';

/**
 * Address search and coordinate capture for a listing (spec §6.2 step 3).
 *
 * Two steps, because they answer different questions. The address lookup finds the building and
 * fills in the city and pincode. The pin below it, once an address is chosen, corrects where the
 * car actually goes in — geocoders land on a plot centroid or the road frontage, and a parking
 * entrance is often neither. Seekers navigate to the pin.
 *
 * The map appears only when a Maps key is configured. Without one the lookup still sets exact
 * coordinates and the form behaves as it always has.
 *
 * A session token is generated per picker instance and passed to both autocomplete and place
 * details. Google bills those as ONE session when the token is present and per-request when it
 * is not, so omitting it is the easiest way to multiply the Maps bill (spec §16).
 */

interface Suggestion {
  placeId: string;
  description: string;
  primaryText: string;
  secondaryText: string | null;
}

/** What the picker hands back to the form: a confirmed address plus its coordinates. */
export type LocationValue = ResolvedAddress;

export function LocationPicker({
  initial,
  fieldErrors,
  mapsApiKey,
}: {
  initial: LocationValue | null;
  fieldErrors: Record<string, string> | undefined;
  /** Absent when Maps is not configured; the picker then renders without a map. */
  mapsApiKey?: string | undefined;
}) {
  const baseId = useId();
  const [query, setQuery] = useState(initial?.formattedAddress ?? '');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [resolved, setResolved] = useState<LocationValue | null>(initial);
  const [isPending, startTransition] = useTransition();

  /*
   * Where the pin is, which is not always where the geocoder put it.
   *
   * Held apart from `resolved` so the two are not confused: `resolved.location` is what the
   * address lookup returned and is the baseline a drag is measured against, while this is what
   * the form actually posts. Choosing a new address resets it; dragging does not touch the
   * address.
   */
  const [pin, setPin] = useState<LatLng | null>(initial?.location ?? null);

  // One token for the life of this picker, which is what makes the lookups a single billed
  // session rather than one charge per keystroke.
  const sessionToken = useRef(crypto.randomUUID()).current;
  const latestQuery = useRef(query);

  useEffect(() => {
    latestQuery.current = query;

    if (query.trim().length < 2 || query === resolved?.formattedAddress) {
      setSuggestions([]);
      return;
    }

    // Debounced: autocomplete is billed, so a keystroke is not a request.
    const timer = setTimeout(() => {
      void suggestAddresses(query, sessionToken).then((results) => {
        // Ignore a response that arrived after the user typed something else.
        if (latestQuery.current === query) setSuggestions(results);
      });
    }, 350);

    return () => clearTimeout(timer);
  }, [query, resolved?.formattedAddress, sessionToken]);

  function choose(placeId: string) {
    startTransition(async () => {
      const result = await resolvePlace(placeId, sessionToken);
      if (result) {
        setResolved(result);
        setPin(result.location);
        setQuery(result.formattedAddress);
        setSuggestions([]);
      }
    });
  }

  /** Fallback for an address the provider has no suggestion for. */
  function geocodeTyped() {
    if (!query.trim() || query === resolved?.formattedAddress) return;

    startTransition(async () => {
      const result = await geocodeAddress(query);
      if (result) {
        setResolved(result);
        setPin(result.location);
        setSuggestions([]);
      }
    });
  }

  const coordinates: LatLng | null = pin ?? resolved?.location ?? null;

  return (
    <div className="space-y-3">
      <Field
        htmlFor={`${baseId}-search`}
        label="Find the address"
        required
        hint={`Start typing an address in ${PILOT_CITY.name}, then pick it from the list.`}
        error={fieldErrors?.['lat'] ?? fieldErrors?.['addressLine']}
      >
        <Input
          id={`${baseId}-search`}
          type="text"
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onBlur={geocodeTyped}
          placeholder="e.g. Koregaon Park, Pune"
          invalid={Boolean(fieldErrors?.['lat'])}
        />
      </Field>

      {suggestions.length > 0 ? (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-md border border-slate-200 bg-white">
          {suggestions.map((s) => (
            <li key={s.placeId}>
              <button
                type="button"
                onClick={() => choose(s.placeId)}
                className="w-full px-3 py-2.5 text-left hover:bg-slate-50"
              >
                <span className="block text-sm font-medium text-slate-900">{s.primaryText}</span>
                {s.secondaryText ? (
                  <span className="block text-xs text-slate-500">{s.secondaryText}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {isPending ? <p className="text-xs text-slate-500">Looking that up...</p> : null}

      {resolved ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <Badge tone="success">Location set</Badge>
            <span className="text-xs text-emerald-900">
              {coordinates?.lat.toFixed(5)}, {coordinates?.lng.toFixed(5)}
            </span>
          </div>
          <p className="mt-1 text-sm text-emerald-900">{resolved.formattedAddress}</p>
        </div>
      ) : (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Pick an address above so seekers can find this spot.
        </p>
      )}

      {mapsApiKey && coordinates ? (
        <PinMap
          apiKey={mapsApiKey}
          position={coordinates}
          geocoded={resolved?.location ?? null}
          onChange={setPin}
        />
      ) : null}

      {/* The form posts these, not the search box: a typed string is not a location. */}
      <input type="hidden" name="lat" value={coordinates?.lat ?? ''} />
      <input type="hidden" name="lng" value={coordinates?.lng ?? ''} />
      <input type="hidden" name="locality" value={resolved?.locality ?? ''} />
      <input type="hidden" name="state" value={resolved?.state ?? ''} />

      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          htmlFor={`${baseId}-address`}
          label="Street address"
          required
          hint="What a driver needs to find the gate."
          error={fieldErrors?.['addressLine']}
        >
          {/*
            Keyed on the resolved address so choosing a suggestion remounts the input with the
            new value prefilled, while still leaving the Host free to refine it afterwards -
            the geocoder gives "Koregaon Park, Pune", but a driver needs the lane and gate number.
          */}
          <Input
            id={`${baseId}-address`}
            key={resolved?.formattedAddress ?? 'empty'}
            name="addressLine"
            defaultValue={resolved?.formattedAddress ?? initial?.formattedAddress ?? ''}
            placeholder="14 Lane 5, Koregaon Park"
            required
            invalid={Boolean(fieldErrors?.['addressLine'])}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field htmlFor={`${baseId}-city`} label="City" required error={fieldErrors?.['city']}>
            <Input
              id={`${baseId}-city`}
              name="city"
              key={`city-${resolved?.city ?? 'empty'}`}
              defaultValue={resolved?.city ?? PILOT_CITY.name}
              required
              invalid={Boolean(fieldErrors?.['city'])}
            />
          </Field>

          <Field htmlFor={`${baseId}-pincode`} label="Pincode" error={fieldErrors?.['pincode']}>
            <Input
              id={`${baseId}-pincode`}
              name="pincode"
              inputMode="numeric"
              maxLength={6}
              key={`pin-${resolved?.pincode ?? 'empty'}`}
              defaultValue={resolved?.pincode ?? ''}
              placeholder="411001"
              invalid={Boolean(fieldErrors?.['pincode'])}
            />
          </Field>
        </div>
      </div>
    </div>
  );
}
