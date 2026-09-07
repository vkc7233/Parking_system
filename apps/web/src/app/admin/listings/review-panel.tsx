'use client';

import { useActionState, useState } from 'react';
import { Button, Field, FormError, FormSuccess, Textarea } from '@parking/ui';
import { approveListing, rejectListing, type AdminActionState } from '../actions';

const initialState: AdminActionState = {};

/**
 * Approve / reject controls for one listing in the queue (spec §6.3 step 2, §7.3).
 *
 * Rejection requires a reason, and the reason is shown to the Host on their listing. §6.3 says
 * a rejected Host "is notified and can resubmit" — which is impossible if nobody tells them
 * what was wrong, so the field is mandatory rather than optional.
 */
export function ReviewPanel({
  listingId,
  agreementSigned,
}: {
  listingId: string;
  agreementSigned: boolean;
}) {
  const [approveState, approveAction, approving] = useActionState(approveListing, initialState);
  const [rejectState, rejectAction, rejecting] = useActionState(rejectListing, initialState);
  const [showReject, setShowReject] = useState(false);

  const state = approveState.error || approveState.success ? approveState : rejectState;

  return (
    <div className="space-y-3">
      {state.error ? <FormError>{state.error}</FormError> : null}
      {state.success ? <FormSuccess>{state.success}</FormSuccess> : null}

      {!agreementSigned ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          No signed Host Listing Agreement on file. This cannot be approved until the host signs it
          — the database will refuse.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <form action={approveAction}>
          <input type="hidden" name="listingId" value={listingId} />
          <Button type="submit" size="sm" disabled={approving || !agreementSigned}>
            {approving ? 'Approving...' : 'Approve and publish'}
          </Button>
        </form>

        {!showReject ? (
          <Button type="button" variant="secondary" size="sm" onClick={() => setShowReject(true)}>
            Reject
          </Button>
        ) : null}
      </div>

      {showReject ? (
        <form action={rejectAction} className="space-y-3 rounded-md border border-slate-200 p-3">
          <input type="hidden" name="listingId" value={listingId} />

          <Field
            htmlFor={`reason-${listingId}`}
            label="Why is this being rejected?"
            required
            hint="The host sees this exactly as written, so make it specific and actionable."
          >
            <Textarea
              id={`reason-${listingId}`}
              name="reason"
              rows={3}
              required
              minLength={10}
              placeholder="The second photo shows a different building. Please upload photos of the actual space."
            />
          </Field>

          <div className="flex gap-2">
            <Button type="submit" variant="danger" size="sm" disabled={rejecting}>
              {rejecting ? 'Rejecting...' : 'Reject and notify host'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowReject(false)}
              disabled={rejecting}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
