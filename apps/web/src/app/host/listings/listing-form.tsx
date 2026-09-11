'use client';

import { useActionState } from 'react';
import { BOOKING, CAPACITY, PLATFORM } from '@parking/config';
import { paiseToRupees } from '@parking/core';
import type { SpotType } from '@parking/types';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Field,
  FormError,
  Input,
  Select,
  Textarea,
} from '@parking/ui';
import { saveListing, type ListingFormState } from './actions';
import { LocationPicker, type LocationValue } from './location-picker';

const initialState: ListingFormState = {};

const SPOT_TYPE_OPTIONS: { value: SpotType; label: string }[] = [
  { value: 'open', label: 'Open / uncovered' },
  { value: 'covered', label: 'Covered' },
  { value: 'basement', label: 'Basement' },
  { value: 'stilt', label: 'Stilt' },
  { value: 'garage', label: 'Garage' },
  { value: 'driveway', label: 'Driveway' },
];

export interface ListingDefaults {
  id: string | null;
  title: string;
  description: string;
  spotType: SpotType;
  capacity: number;
  /** Paise, as stored. Shown to the Host in rupees. */
  pricePerHour: number;
  pricePerDay: number | null;
  availableFrom: string | null;
  availableUntil: string | null;
  rules: string;
  location: LocationValue | null;
}

export function ListingForm({
  defaults,
  submitLabel,
  mapsApiKey,
}: {
  defaults: ListingDefaults;
  submitLabel: string;
  /** Passed through to the pin map; absent when Maps is not configured. */
  mapsApiKey?: string | undefined;
}) {
  const [state, action, pending] = useActionState(saveListing, initialState);
  const errors = state.fieldErrors;

  // Prices live in paise everywhere except this form, where a Host thinks in rupees.
  const rupeeValue = (paise: number | null) => (paise === null ? '' : String(paiseToRupees(paise)));

  return (
    <form action={action} className="space-y-6">
      {defaults.id ? <input type="hidden" name="id" value={defaults.id} /> : null}

      <Card>
        <CardHeader title="The space" description="What a driver is booking." />
        <CardBody className="space-y-4">
          <Field
            htmlFor="title"
            label="Listing name"
            required
            hint="Short and specific, e.g. “Covered slot off FC Road”."
            error={errors?.['title']}
          >
            <Input
              id="title"
              name="title"
              defaultValue={defaults.title}
              maxLength={120}
              required
              invalid={Boolean(errors?.['title'])}
            />
          </Field>

          <Field
            htmlFor="description"
            label="Description"
            hint="Access, landmarks, how to find the gate."
            error={errors?.['description']}
          >
            <Textarea
              id="description"
              name="description"
              defaultValue={defaults.description}
              maxLength={2000}
              rows={3}
              invalid={Boolean(errors?.['description'])}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field htmlFor="spotType" label="Spot type" required error={errors?.['spotType']}>
              <Select
                id="spotType"
                name="spotType"
                defaultValue={defaults.spotType}
                required
                invalid={Boolean(errors?.['spotType'])}
              >
                {SPOT_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              htmlFor="capacity"
              label="Vehicles at once"
              required
              hint="Leave at 1 unless several cars genuinely fit at the same time."
              error={errors?.['capacity']}
            >
              <Input
                id="capacity"
                name="capacity"
                type="number"
                min={1}
                max={CAPACITY.maxCapacity}
                defaultValue={defaults.capacity}
                required
                invalid={Boolean(errors?.['capacity'])}
              />
            </Field>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Where it is"
          description="Seekers search by distance from where they are going."
        />
        <CardBody>
          <LocationPicker
            initial={defaults.location}
            fieldErrors={errors}
            mapsApiKey={mapsApiKey}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Price and availability"
          description={`You keep the full price you set here — the platform fee is added on top for the seeker.`}
        />
        <CardBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              htmlFor="pricePerHour"
              label="Price per hour"
              required
              hint="In rupees, e.g. 30"
              error={errors?.['pricePerHour']}
            >
              <Input
                id="pricePerHour"
                name="pricePerHour"
                inputMode="decimal"
                defaultValue={rupeeValue(defaults.pricePerHour)}
                placeholder="30"
                required
                invalid={Boolean(errors?.['pricePerHour'])}
              />
            </Field>

            <Field
              htmlFor="pricePerDay"
              label="Daily cap"
              hint="The most to charge for a full day. Optional."
              error={errors?.['pricePerDay']}
            >
              <Input
                id="pricePerDay"
                name="pricePerDay"
                inputMode="decimal"
                defaultValue={rupeeValue(defaults.pricePerDay)}
                placeholder="200"
                invalid={Boolean(errors?.['pricePerDay'])}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              htmlFor="availableFrom"
              label="Available from"
              hint="Leave both blank for 24 hours."
              error={errors?.['availableFrom']}
            >
              <Input
                id="availableFrom"
                name="availableFrom"
                type="time"
                defaultValue={defaults.availableFrom ?? ''}
                invalid={Boolean(errors?.['availableFrom'])}
              />
            </Field>

            <Field
              htmlFor="availableUntil"
              label="Available until"
              error={errors?.['availableUntil']}
            >
              <Input
                id="availableUntil"
                name="availableUntil"
                type="time"
                defaultValue={defaults.availableUntil ?? ''}
                invalid={Boolean(errors?.['availableUntil'])}
              />
            </Field>
          </div>

          <Field
            htmlFor="rules"
            label="House rules"
            hint="Anything a driver must know: reversing in, no overnight stays, gate timings."
            error={errors?.['rules']}
          >
            <Textarea
              id="rules"
              name="rules"
              defaultValue={defaults.rules}
              maxLength={2000}
              rows={3}
              invalid={Boolean(errors?.['rules'])}
            />
          </Field>

          <p className="text-xs text-slate-500">
            Seekers can book from {BOOKING.minDurationMinutes / 60} hour up to{' '}
            {BOOKING.maxDurationMinutes / (24 * 60)} days at a time, in {BOOKING.slotMinutes}-minute
            steps.
          </p>
        </CardBody>
      </Card>

      {state.error ? <FormError>{state.error}</FormError> : null}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving...' : submitLabel}
        </Button>
        {!defaults.id ? (
          <p className="text-sm text-slate-600">
            You will add photos on the next step — {PLATFORM.minListingPhotos} minimum.
          </p>
        ) : null}
      </div>
    </form>
  );
}
