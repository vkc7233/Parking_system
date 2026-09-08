'use client';

import { useActionState } from 'react';
import { Badge, Button, Field, Input } from '@parking/ui';
import { verifyAccessPassInput, type VerifyResult } from './actions';

const TONES: Record<VerifyResult['status'], 'success' | 'danger' | 'warning' | 'neutral'> = {
  valid: 'success',
  invalid: 'danger',
  not_found: 'danger',
  wrong_host: 'danger',
  cancelled: 'danger',
  not_yet: 'warning',
  expired: 'warning',
};

/**
 * The arrival check (assumption A5).
 *
 * Designed for someone standing at a gate holding a phone: one field, a big result, and a colour
 * that reads at arm's length. The reference input is uppercased as it is typed because the
 * alphabet has no lowercase, and autoFocus because this screen has exactly one job.
 */
export function VerifyForm() {
  const [result, action, pending] = useActionState(verifyAccessPassInput, null);

  return (
    <div className="space-y-5">
      <form action={action} className="space-y-3">
        <Field
          htmlFor="pass"
          label="Booking reference"
          hint="8 characters, from the seeker's pass. Scanning the QR fills this automatically."
        >
          <Input
            id="pass"
            name="pass"
            autoFocus
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="ABCD2345"
            className="text-center font-mono text-xl tracking-[0.3em] uppercase"
          />
        </Field>

        <Button type="submit" full disabled={pending}>
          {pending ? 'Checking…' : 'Check pass'}
        </Button>
      </form>

      {result ? (
        <div
          className={
            'rounded-xl border p-4 ' +
            (result.status === 'valid'
              ? 'border-emerald-300 bg-emerald-50'
              : result.status === 'not_yet' || result.status === 'expired'
                ? 'border-amber-300 bg-amber-50'
                : 'border-red-300 bg-red-50')
          }
          role="status"
        >
          <div className="flex items-center gap-2">
            <Badge tone={TONES[result.status]}>
              {result.status === 'valid' ? 'Let them in' : 'Do not let them in'}
            </Badge>
          </div>

          <p
            className={
              'mt-2 text-base font-medium ' +
              (result.status === 'valid' ? 'text-emerald-900' : 'text-slate-900')
            }
          >
            {result.message}
          </p>

          {result.booking ? (
            <dl className="mt-3 space-y-1 border-t border-black/5 pt-3 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-600">Space</dt>
                <dd className="text-right text-slate-900">{result.booking.listingTitle}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-600">Driver</dt>
                <dd className="text-slate-900">{result.booking.seekerName ?? 'Not given'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-600">Booked</dt>
                <dd className="text-right text-slate-900">
                  {new Date(result.booking.startTime).toLocaleString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  {' → '}
                  {new Date(result.booking.endTime).toLocaleTimeString('en-IN', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-600">Reference</dt>
                <dd className="font-mono text-slate-900">{result.booking.reference}</dd>
              </div>
            </dl>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
