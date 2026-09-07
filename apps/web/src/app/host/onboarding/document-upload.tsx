'use client';

import { useActionState, useRef } from 'react';
import { Badge, Button, Field, FormError, FormSuccess, Input } from '@parking/ui';
import type { DocumentType } from '@parking/types';
import { uploadDocument, type UploadState } from './actions';
import type { DocumentRow } from '@/lib/auth';

const initialState: UploadState = {};

const STATUS_PRESENTATION = {
  pending: { label: 'In review', tone: 'warning' as const },
  verified: { label: 'Verified', tone: 'success' as const },
  rejected: { label: 'Rejected', tone: 'danger' as const },
};

export function DocumentUpload({
  type,
  label,
  hint,
  current,
  rejected,
}: {
  type: DocumentType;
  label: string;
  hint: string;
  current: DocumentRow | null;
  rejected: DocumentRow | undefined;
}) {
  const [state, action, pending] = useActionState(uploadDocument, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  const inputId = `file-${type}`;
  const status = current ? STATUS_PRESENTATION[current.verifiedStatus] : null;

  return (
    <div className="border-b border-slate-100 px-5 py-4 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-slate-900">{label}</h3>
        {status ? <Badge tone={status.tone}>{status.label}</Badge> : null}
      </div>
      <p className="mt-0.5 text-sm text-slate-600">{hint}</p>

      {/* A previous rejection has to say why, or the Host cannot act on it. */}
      {rejected?.rejectionReason ? (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          <span className="font-medium">Previously rejected:</span> {rejected.rejectionReason}
        </p>
      ) : null}

      <form ref={formRef} action={action} className="mt-3 space-y-3">
        <input type="hidden" name="type" value={type} />

        <Field
          htmlFor={inputId}
          label={current ? 'Replace this document' : 'Upload a document'}
          hint="JPG, PNG or PDF, up to 10MB."
          error={state.error}
        >
          <Input
            id={inputId}
            name="file"
            type="file"
            accept="image/jpeg,image/png,application/pdf"
            required
            invalid={Boolean(state.error)}
            className="file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700"
          />
        </Field>

        {state.success ? <FormSuccess>{state.success}</FormSuccess> : null}

        <Button type="submit" size="sm" variant="secondary" disabled={pending}>
          {pending ? 'Uploading...' : current ? 'Replace' : 'Upload'}
        </Button>
      </form>
    </div>
  );
}

export function OnboardingError({ children }: { children: React.ReactNode }) {
  return <FormError>{children}</FormError>;
}
