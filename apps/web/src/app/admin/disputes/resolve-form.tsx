'use client';

import { useActionState, useState } from 'react';
import { Button, Field, FormError, FormSuccess, Textarea } from '@parking/ui';
import { resolveDispute, type DisputeActionState } from './actions';

const initialState: DisputeActionState = {};

/**
 * Resolving one dispute (spec §6.3 step 4).
 *
 * The two outcomes are shown with their consequence spelled out, because they are not
 * symmetrical: one refunds a seeker and withholds a host's earnings for that booking, the other
 * pays the host and closes the complaint. An admin should not have to remember which is which.
 */
export function ResolveForm({ disputeId, amount }: { disputeId: string; amount: string }) {
  const [state, action, pending] = useActionState(resolveDispute, initialState);
  const [outcome, setOutcome] = useState<'resolved_refund' | 'resolved_no_action' | null>(null);

  if (state.success) return <FormSuccess>{state.success}</FormSuccess>;

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="disputeId" value={disputeId} />
      <input type="hidden" name="outcome" value={outcome ?? ''} />

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-slate-700">Decision</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setOutcome('resolved_refund')}
            className={
              'rounded-md border px-3 py-2.5 text-left text-sm transition ' +
              (outcome === 'resolved_refund'
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-300 bg-white hover:bg-slate-50')
            }
          >
            <span className="block font-medium">Refund the seeker</span>
            <span
              className={
                'mt-0.5 block text-xs ' +
                (outcome === 'resolved_refund' ? 'text-slate-300' : 'text-slate-500')
              }
            >
              Returns {amount}. The host is not paid for this booking.
            </span>
          </button>

          <button
            type="button"
            onClick={() => setOutcome('resolved_no_action')}
            className={
              'rounded-md border px-3 py-2.5 text-left text-sm transition ' +
              (outcome === 'resolved_no_action'
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-300 bg-white hover:bg-slate-50')
            }
          >
            <span className="block font-medium">No refund</span>
            <span
              className={
                'mt-0.5 block text-xs ' +
                (outcome === 'resolved_no_action' ? 'text-slate-300' : 'text-slate-500')
              }
            >
              Closes the complaint. The host is paid as normal.
            </span>
          </button>
        </div>
      </fieldset>

      <Field
        htmlFor={`note-${disputeId}`}
        label="What did you find?"
        required
        hint="Recorded in the audit log. Write it for whoever reads this in six months."
      >
        <Textarea
          id={`note-${disputeId}`}
          name="note"
          rows={2}
          required
          minLength={10}
          placeholder="Host confirmed the gate was locked during the booked window."
        />
      </Field>

      {state.error ? <FormError>{state.error}</FormError> : null}

      <Button type="submit" size="sm" disabled={pending || outcome === null}>
        {pending ? 'Recording…' : outcome === null ? 'Choose an outcome' : 'Resolve dispute'}
      </Button>
    </form>
  );
}
