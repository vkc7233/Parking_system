'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import type { ListingStatus } from '@parking/types';
import { Button, FormError, FormSuccess, listingStatusHint } from '@parking/ui';
import { deleteListing, setListingPaused, submitListing } from './actions';

/**
 * The lifecycle controls for one listing (spec §7.2 — edit, pause, reactivate, delete).
 *
 * Which buttons exist is driven by status, so a Host is never offered an action the database
 * would refuse. Submitting can still fail on the photo and onboarding rules, which is deliberate:
 * those are checked at the point of submission, and the error explains what to fix.
 */
export function ListingActionsBar({
  listingId,
  status,
  photoCount,
  minPhotos,
  onboardingComplete,
  agreementSigned,
}: {
  listingId: string;
  status: ListingStatus;
  photoCount: number;
  minPhotos: number;
  onboardingComplete: boolean;
  agreementSigned: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();
  const [success, setSuccess] = useState<string | undefined>();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  function run(fn: () => Promise<{ error?: string; success?: string }>) {
    startTransition(async () => {
      setError(undefined);
      setSuccess(undefined);
      const result = await fn();
      setError(result.error);
      setSuccess(result.success);
    });
  }

  const canSubmit = status === 'draft' || status === 'rejected';

  // Submission is blocked by photos and onboarding (the database enforces both). The agreement
  // is not a submission blocker - it blocks going live - but it is listed here because there is
  // no later moment where a Host would naturally be prompted for it.
  const blockers: string[] = [];
  if (photoCount < minPhotos) blockers.push(`add ${minPhotos - photoCount} more photo(s)`);
  if (!onboardingComplete) blockers.push('finish onboarding');

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">{listingStatusHint(status)}</p>

      {error ? <FormError>{error}</FormError> : null}
      {success ? <FormSuccess>{success}</FormSuccess> : null}

      <div className="flex flex-wrap items-center gap-2">
        {canSubmit ? (
          <Button
            type="button"
            disabled={isPending || blockers.length > 0}
            onClick={() => run(() => submitListing(listingId))}
          >
            {isPending ? 'Submitting...' : 'Submit for approval'}
          </Button>
        ) : null}

        {status === 'live' ? (
          <Button
            type="button"
            variant="secondary"
            disabled={isPending}
            onClick={() => run(() => setListingPaused(listingId, true))}
          >
            Pause listing
          </Button>
        ) : null}

        {status === 'paused' ? (
          <Button
            type="button"
            variant="secondary"
            disabled={isPending}
            onClick={() => run(() => setListingPaused(listingId, false))}
          >
            Reactivate
          </Button>
        ) : null}

        {status === 'draft' || status === 'rejected' ? (
          confirmingDelete ? (
            <>
              <Button
                type="button"
                variant="danger"
                disabled={isPending}
                onClick={() => run(() => deleteListing(listingId))}
              >
                Delete permanently
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={isPending}
                onClick={() => setConfirmingDelete(false)}
              >
                Keep it
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="ghost"
              disabled={isPending}
              onClick={() => setConfirmingDelete(true)}
            >
              Delete
            </Button>
          )
        ) : null}
      </div>

      {canSubmit && blockers.length > 0 ? (
        <p className="text-sm text-amber-800">Before submitting: {blockers.join(', ')}.</p>
      ) : null}

      {/*
        Spec §7.2: no listing can be approved without a recorded signature, and the database
        refuses regardless of what this UI says. Surfacing it here means the Host is not left
        waiting on an approval that can never happen.
      */}
      {agreementSigned ? (
        <p className="text-sm text-slate-500">Host Listing Agreement signed.</p>
      ) : (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          This listing cannot be approved until you sign the Host Listing Agreement.{' '}
          <Link
            href={`/host/listings/${listingId}/agreement`}
            className="font-medium underline underline-offset-4"
          >
            Read and sign it
          </Link>
        </p>
      )}
    </div>
  );
}
