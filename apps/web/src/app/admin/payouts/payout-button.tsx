'use client';

import { useState, useTransition } from 'react';
import { Button, FormError, FormSuccess } from '@parking/ui';
import { processHostPayout } from './actions';

/**
 * Triggers one host's payout (spec §6.3 step 3).
 *
 * Confirmation is deliberate: this moves real money to a real bank account and there is no undo.
 * The button also disables itself while the request is in flight, though the guarantee against
 * double-paying is the unique constraint in the database, not this.
 */
export function PayoutButton({
  hostId,
  hostName,
  amount,
  disabled,
}: {
  hostId: string;
  hostName: string;
  amount: string;
  disabled: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<{ error?: string; success?: string }>({});

  function run() {
    startTransition(async () => {
      const outcome = await processHostPayout(hostId);
      setResult(outcome);
      setConfirming(false);
    });
  }

  if (result.success) return <FormSuccess>{result.success}</FormSuccess>;

  return (
    <div className="space-y-2">
      {result.error ? <FormError>{result.error}</FormError> : null}

      {confirming ? (
        <div className="space-y-2 rounded-md border border-slate-300 bg-slate-50 p-3">
          <p className="text-sm text-slate-800">
            Send <span className="font-medium">{amount}</span> to {hostName}? This transfers real
            money and cannot be undone.
          </p>
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={isPending} onClick={run}>
              {isPending ? 'Sending…' : 'Send payout'}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          size="sm"
          disabled={disabled || isPending}
          onClick={() => setConfirming(true)}
        >
          Pay {amount}
        </Button>
      )}
    </div>
  );
}
