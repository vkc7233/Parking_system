'use client';

import { useState, useTransition } from 'react';
import { Button, FormError, FormSuccess, Input } from '@parking/ui';
import { setUserSuspended } from '../actions';

/**
 * Suspend / restore an account (spec §7.3).
 *
 * §7.3's acceptance criterion is that suspending a host immediately delists all of their
 * listings. That happens in a database trigger, not here, so it holds however the suspension is
 * applied — but the wording below tells the admin what their click is about to do.
 */
export function SuspendControl({
  userId,
  suspended,
  name,
}: {
  userId: string;
  suspended: boolean;
  name: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState('');
  const [result, setResult] = useState<{ error?: string; success?: string }>({});

  function run(next: boolean) {
    startTransition(async () => {
      const outcome = await setUserSuspended(userId, next, reason || undefined);
      setResult(outcome);
      if (!outcome.error) setConfirming(false);
    });
  }

  if (suspended) {
    return (
      <div className="space-y-2">
        {result.error ? <FormError>{result.error}</FormError> : null}
        {result.success ? <FormSuccess>{result.success}</FormSuccess> : null}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={isPending}
          onClick={() => run(false)}
        >
          {isPending ? 'Restoring...' : 'Restore account'}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {result.error ? <FormError>{result.error}</FormError> : null}
      {result.success ? <FormSuccess>{result.success}</FormSuccess> : null}

      {confirming ? (
        <div className="space-y-2 rounded-md border border-red-200 bg-red-50 p-3">
          <p className="text-sm text-red-900">
            Suspending {name} immediately removes every one of their live listings from search.
            Bookings already confirmed are not cancelled.
          </p>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (recorded in the audit log)"
            aria-label="Suspension reason"
          />
          <div className="flex gap-2">
            <Button
              type="button"
              variant="danger"
              size="sm"
              disabled={isPending}
              onClick={() => run(true)}
            >
              {isPending ? 'Suspending...' : 'Suspend and delist'}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(true)}>
          Suspend
        </Button>
      )}
    </div>
  );
}
