'use client';

import { useActionState, useState, useTransition } from 'react';
import { Button, Field, FormError, FormSuccess, Input, Select, fieldAria } from '@parking/ui';
import {
  createAvailabilityBlock,
  removeAvailabilityBlock,
  type BlockFormState,
} from './block-actions';

export interface BlockedPeriod {
  id: string;
  listingId: string;
  listingTitle: string;
  startTime: string;
  endTime: string;
  reason: string | null;
}

const initial: BlockFormState = {};

/** `datetime-local` wants the host's wall clock, which for this product is always Pune's. */
function istLocalValue(date: Date): string {
  const ist = new Date(date.getTime() + (330 + date.getTimezoneOffset()) * 60_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${ist.getFullYear()}-${pad(ist.getMonth() + 1)}-${pad(ist.getDate())}` +
    `T${pad(ist.getHours())}:${pad(ist.getMinutes())}`
  );
}

/*
 * Rendered in IST explicitly, not in the browser's zone.
 *
 * The form above reads what the host types as Asia/Kolkata, because the space is in Pune whatever
 * the host's laptop thinks. Displaying in the browser's zone would make the two disagree for the
 * one host who most needs this screen - the one who is abroad, which is why they are closing the
 * dates. They would type 09:00, save, and read back 03:30.
 */
const IST = 'Asia/Kolkata';

function formatRange(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);

  const day = (d: Date) =>
    d.toLocaleDateString('en-IN', {
      timeZone: IST,
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  const time = (d: Date) =>
    d.toLocaleTimeString('en-IN', { timeZone: IST, hour: '2-digit', minute: '2-digit' });

  // Compared as IST dates too: a block ending at 00:30 IST is the small hours of the next day
  // for the host standing at the gate, whatever date it is in UTC.
  const sameDay = day(start) === day(end);

  return sameDay
    ? `${day(start)}, ${time(start)} – ${time(end)}`
    : `${day(start)} ${time(start)} – ${day(end)} ${time(end)}`;
}

/**
 * Closing a space for a period (spec §7.2, §10).
 *
 * Daily opening hours live on the listing and answer "when am I normally open". This answers the
 * other question every host eventually has — "I am away next Tuesday" — which hours cannot
 * express at all.
 *
 * The form starts collapsed. A host opens this page to see who is arriving, not to close dates,
 * and a form sitting open above the arrivals list would make the common case read like the rare
 * one.
 */
export function BlockedPeriods({
  listings,
  blocks,
  defaultListingId,
}: {
  listings: { id: string; title: string }[];
  blocks: BlockedPeriod[];
  defaultListingId?: string | undefined;
}) {
  const [state, formAction, pending] = useActionState(createAvailabilityBlock, initial);
  const [open, setOpen] = useState(false);
  const [removing, startRemoving] = useTransition();
  const [removeError, setRemoveError] = useState<string | null>(null);

  // Tomorrow morning to tomorrow evening: the shape of the thing a host is usually closing, and
  // a starting point they can edit rather than two empty boxes.
  const tomorrow = new Date(Date.now() + 86_400_000);
  const defaultStart = `${istLocalValue(tomorrow).slice(0, 10)}T09:00`;
  const defaultEnd = `${istLocalValue(tomorrow).slice(0, 10)}T21:00`;

  function remove(id: string) {
    setRemoveError(null);
    startRemoving(async () => {
      const outcome = await removeAvailabilityBlock(id);
      if (outcome.error) setRemoveError(outcome.error);
    });
  }

  if (listings.length === 0) return null;

  return (
    <div className="space-y-4">
      {state.success ? <FormSuccess>{state.success}</FormSuccess> : null}
      {state.error ? <FormError>{state.error}</FormError> : null}
      {removeError ? <FormError>{removeError}</FormError> : null}

      {blocks.length === 0 ? (
        <p className="text-sm text-slate-600">
          Nothing is closed. Your spaces take bookings during their opening hours.
        </p>
      ) : (
        <ul className="space-y-2">
          {blocks.map((block) => (
            <li
              key={block.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
            >
              <span className="text-sm font-medium text-slate-900">
                {formatRange(block.startTime, block.endTime)}
              </span>
              {listings.length > 1 ? (
                <span className="min-w-0 truncate text-sm text-slate-600">
                  {block.listingTitle}
                </span>
              ) : null}
              {block.reason ? (
                <span className="min-w-0 truncate text-sm text-slate-500">{block.reason}</span>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="ml-auto"
                disabled={removing}
                onClick={() => remove(block.id)}
              >
                Reopen
              </Button>
            </li>
          ))}
        </ul>
      )}

      {open ? (
        <form action={formAction} className="space-y-4 rounded-lg border border-slate-200 p-4">
          {listings.length > 1 ? (
            <Field htmlFor="block-listing" label="Which space" required>
              <Select
                {...fieldAria('block-listing', { error: !!state.fieldErrors?.listingId })}
                name="listingId"
                defaultValue={defaultListingId ?? listings[0]!.id}
                invalid={!!state.fieldErrors?.listingId}
              >
                {listings.map((listing) => (
                  <option key={listing.id} value={listing.id}>
                    {listing.title}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <input type="hidden" name="listingId" value={listings[0]!.id} />
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              htmlFor="block-start"
              label="Closed from"
              required
              error={state.fieldErrors?.startLocal}
            >
              <Input
                {...fieldAria('block-start', { error: !!state.fieldErrors?.startLocal })}
                type="datetime-local"
                name="startLocal"
                defaultValue={defaultStart}
                invalid={!!state.fieldErrors?.startLocal}
              />
            </Field>

            <Field
              htmlFor="block-end"
              label="Open again at"
              required
              error={state.fieldErrors?.endLocal}
            >
              <Input
                {...fieldAria('block-end', { error: !!state.fieldErrors?.endLocal })}
                type="datetime-local"
                name="endLocal"
                defaultValue={defaultEnd}
                invalid={!!state.fieldErrors?.endLocal}
              />
            </Field>
          </div>

          <Field
            htmlFor="block-reason"
            label="Why (optional)"
            hint="Only you see this. It is there so a date you closed weeks ago still makes sense."
          >
            <Input
              {...fieldAria('block-reason', { hint: true })}
              type="text"
              name="reason"
              maxLength={200}
              placeholder="Out of town"
            />
          </Field>

          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? 'Closing…' : 'Close this period'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
          Close a period
        </Button>
      )}
    </div>
  );
}
