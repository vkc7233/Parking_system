'use client';

import { useState, useTransition } from 'react';
import { Button, FormError, FormSuccess } from '@parking/ui';
import { voidFailedPayout } from './actions';

/**
 * Returns one failed payout's bookings to the queue (spec §6.3 step 3).
 *
 * The confirmation step is not friction for its own sake. "Failed" from a bank can mean the
 * transfer was rejected, or that it timed out and settled anyway — and returning money to the
 * queue that actually reached the host pays them twice. The provider dashboard is the only
 * authority on which happened, so the copy names it and the reason is required, not optional:
 * whoever reconciles this later needs to know what was checked.
 */
export function VoidPayoutButton({
  payoutId,
  hostName,
  amount,
}: {
  payoutId: string;
  hostName: string;
  amount: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState('');
  const [result, setResult] = useState<{ error?: string; success?: string }>({});

  function run() {
    startTransition(async () => {
      const outcome = await voidFailedPayout(payoutId, reason);
      setResult(outcome);
      if (outcome.success) setConfirming(false);
    });
  }

  if (result.success) return <FormSuccess>{result.success}</FormSuccess>;

  return (
    <div className="space-y-2">
      {result.error ? <FormError>{result.error}</FormError> : null}

      {confirming ? (
        <div className="w-full max-w-md space-y-2 rounded-md border border-slate-300 bg-slate-50 p-3">
          <p className="text-sm text-slate-800">
            Return <span className="font-medium">{amount}</span> to the payout queue for {hostName}?
          </p>
          <p className="text-xs text-slate-600">
            Check the provider dashboard first. If this transfer actually settled, returning it here
            will pay {hostName} a second time.
          </p>

          <label className="block text-xs font-medium text-slate-700">
            What did you check?
            <input
              type="text"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="e.g. RazorpayX shows it reversed, nothing left the account"
              className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
            />
          </label>

          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              disabled={isPending || reason.trim().length < 4}
              onClick={run}
            >
              {isPending ? 'Returning…' : 'Return to queue'}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={isPending}
          onClick={() => setConfirming(true)}
        >
          Return to queue
        </Button>
      )}
    </div>
  );
}
