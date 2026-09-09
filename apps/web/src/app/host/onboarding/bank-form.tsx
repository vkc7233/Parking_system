'use client';

import { useActionState } from 'react';
import { Badge, Button, Field, fieldAria, Input } from '@parking/ui';
import { saveBankAccount, type BankState } from './bank-actions';

/**
 * Where the host's money goes (spec §7.2).
 *
 * Separate from the document upload above it. That upload is a KYC artefact an Admin looks at;
 * this is a payment instruction a bank acts on, and conflating them is how a host ends up
 * verified but unpayable.
 */
export function BankAccountForm({
  existing,
}: {
  existing: { accountLast4: string; ifsc: string; accountHolderName: string } | null;
}) {
  const [state, action, pending] = useActionState<BankState, FormData>(saveBankAccount, {});

  return (
    <form action={action} className="space-y-4">
      {existing ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm">
          <Badge tone="success">Registered</Badge>
          <span className="text-emerald-900">
            {existing.accountHolderName} · ••••{existing.accountLast4} · {existing.ifsc}
          </span>
        </div>
      ) : null}

      <p className="text-sm leading-relaxed text-slate-600">
        We pass these straight to our payment provider and keep only the reference they give back.
        Your full account number is never stored on this platform.
      </p>

      <Field
        htmlFor="bank-name"
        label="Name on the account"
        required
        hint="Must match your bank records exactly, or the transfer is rejected."
        error={state.error}
      >
        <Input
          {...fieldAria('bank-name', { hint: true, error: Boolean(state.error) })}
          name="accountHolderName"
          defaultValue={existing?.accountHolderName ?? ''}
          autoComplete="off"
          placeholder="Meena Kulkarni"
        />
      </Field>

      <Field htmlFor="bank-number" label="Account number" required>
        <Input
          {...fieldAria('bank-number')}
          name="accountNumber"
          inputMode="numeric"
          autoComplete="off"
          placeholder="00000000000000"
        />
      </Field>

      <Field
        htmlFor="bank-number-confirm"
        label="Confirm account number"
        required
        hint="Typed twice on purpose — a wrong digit sends your money to someone else's real account, and no system can catch that."
      >
        <Input
          {...fieldAria('bank-number-confirm', { hint: true })}
          name="confirmAccountNumber"
          inputMode="numeric"
          autoComplete="off"
          onPaste={(event) => event.preventDefault()}
          placeholder="00000000000000"
        />
      </Field>

      <Field htmlFor="bank-ifsc" label="IFSC code" required hint="Eleven characters, e.g. HDFC0001234.">
        <Input
          {...fieldAria('bank-ifsc', { hint: true })}
          name="ifsc"
          autoComplete="off"
          defaultValue={existing?.ifsc ?? ''}
          className="uppercase"
          placeholder="HDFC0001234"
        />
      </Field>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? 'Checking with the bank…' : existing ? 'Update account' : 'Save account'}
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
