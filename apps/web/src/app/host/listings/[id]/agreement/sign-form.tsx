'use client';

import Link from 'next/link';
import { useActionState, useRef, useState } from 'react';
import { Button, Field, FormError, Input } from '@parking/ui';
import { signAgreement, type SignState } from './actions';

const initialState: SignState = {};

export interface AgreementClause {
  heading: string;
  body: string[];
}

/**
 * The agreement text plus the signing control.
 *
 * They live in one component because the button is gated on having scrolled to the end of the
 * text, and that is only knowable here.
 */
export function AgreementSigner({
  listingId,
  version,
  hash,
  accountName,
  preamble,
  clauses,
}: {
  listingId: string;
  version: string;
  hash: string;
  accountName: string | null;
  preamble: string;
  clauses: AgreementClause[];
}) {
  const [readToEnd, setReadToEnd] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el || readToEnd) return;
    // 24px of slack: a scroll container rarely lands exactly on its own height.
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) setReadToEnd(true);
  }

  return (
    <div className="space-y-5">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        tabIndex={0}
        aria-label="Host Listing Agreement"
        className="max-h-96 overflow-y-auto rounded-lg border border-slate-200 bg-white px-5 py-4"
      >
        <p className="text-sm text-slate-700">{preamble}</p>

        {clauses.map((clause) => (
          <section key={clause.heading} className="mt-5">
            <h3 className="text-sm font-semibold text-slate-900">{clause.heading}</h3>
            {clause.body.map((paragraph, i) => (
              <p key={i} className="mt-1.5 text-sm leading-relaxed text-slate-700">
                {paragraph}
              </p>
            ))}
          </section>
        ))}

        <p className="mt-6 border-t border-slate-100 pt-3 text-xs text-slate-400">
          End of agreement · version {version}
        </p>
      </div>

      <SignForm
        listingId={listingId}
        version={version}
        hash={hash}
        accountName={accountName}
        hasScrolledToEnd={readToEnd}
      />
    </div>
  );
}

/**
 * The signing control (spec §6.2 step 4).
 *
 * Two deliberate frictions: the button stays disabled until the Host has scrolled to the end of
 * the agreement, and the typed name must match the name on their account. Neither is security —
 * both exist so that "they had the opportunity to read it" is a defensible claim rather than a
 * hopeful one.
 */
export function SignForm({
  listingId,
  version,
  hash,
  accountName,
  hasScrolledToEnd,
}: {
  listingId: string;
  version: string;
  hash: string;
  accountName: string | null;
  hasScrolledToEnd: boolean;
}) {
  const [state, action, pending] = useActionState(signAgreement, initialState);
  const [accepted, setAccepted] = useState(false);
  const [name, setName] = useState(accountName ?? '');

  if (state.success) {
    return (
      <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3">
        <p className="text-sm font-medium text-emerald-900">Agreement signed.</p>
        <p className="mt-1 text-sm text-emerald-800">
          This listing can now be approved. You will not be asked to sign it again for this listing.
        </p>
        <Link
          href={`/host/listings/${listingId}/edit`}
          className="mt-3 inline-block text-sm font-medium text-emerald-900 underline underline-offset-4"
        >
          Back to the listing
        </Link>
      </div>
    );
  }

  const canSign = accepted && name.trim().length >= 3 && hasScrolledToEnd;

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="listingId" value={listingId} />
      <input type="hidden" name="version" value={version} />

      <Field
        htmlFor="signedName"
        label="Your full legal name"
        required
        hint="Type it as it appears on the identity document you uploaded."
      >
        <Input
          id="signedName"
          name="signedName"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          required
        />
      </Field>

      <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-slate-200 bg-white px-3 py-3">
        <input
          type="checkbox"
          name="accepted"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300"
          required
        />
        <span className="text-sm text-slate-700">
          I have read the Host Listing Agreement above, I have the right to list this space, and I
          agree to its terms.
        </span>
      </label>

      {state.error ? <FormError>{state.error}</FormError> : null}

      {!hasScrolledToEnd ? (
        <p className="text-sm text-amber-800">Scroll to the end of the agreement to continue.</p>
      ) : null}

      <Button type="submit" disabled={!canSign || pending}>
        {pending ? 'Recording your signature...' : 'Sign agreement'}
      </Button>

      <p className="text-xs text-slate-500">
        Signing records your name, the time, your IP address and browser, and a fingerprint of this
        exact version of the agreement (
        <code className="font-mono">
          {version} · {hash.slice(0, 12)}…
        </code>
        ).
      </p>
    </form>
  );
}
