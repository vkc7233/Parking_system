'use client';

import { useActionState } from 'react';
import { Button, Field, fieldAria, Input } from '@parking/ui';
import { updateProfile, type AccountState } from './actions';

/** Name and email (spec §8.1 "Profile & Settings"). The phone number is the identity and is shown read-only. */
export function ProfileForm({
  initialName,
  initialEmail,
}: {
  initialName: string;
  initialEmail: string;
}) {
  const [state, action, pending] = useActionState<AccountState, FormData>(updateProfile, {});

  return (
    <form action={action} className="space-y-4">
      <Field
        htmlFor="account-name"
        label="Your name"
        required
        hint="Hosts see this when you book, and it is printed on your access pass."
        error={state.error}
      >
        <Input
          {...fieldAria('account-name', { hint: true, error: Boolean(state.error) })}
          name="name"
          defaultValue={initialName}
          autoComplete="name"
          placeholder="Rohan Bhosale"
        />
      </Field>

      <Field
        htmlFor="account-email"
        label="Email"
        hint="Optional. Used for booking receipts — we still text you the important things."
      >
        <Input
          {...fieldAria('account-email', { hint: true })}
          name="email"
          type="email"
          defaultValue={initialEmail}
          autoComplete="email"
          placeholder="you@example.com"
        />
      </Field>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save changes'}
        </Button>
        {state.success ? (
          <span role="status" className="text-sm font-medium text-emerald-700">
            {state.success}
          </span>
        ) : null}
      </div>
    </form>
  );
}
