'use client';

import { useState, useTransition } from 'react';
import { Button, Field, FormError, FormSuccess, Textarea } from '@parking/ui';
import { getAdminDocumentUrl, reviewDocument } from '../actions';

/**
 * Viewing and ruling on one KYC document (spec §4.2, §7.2).
 *
 * The document is fetched through a short-lived signed URL rather than rendered inline on page
 * load. Two reasons: the bucket is private and must stay that way, and a review queue should not
 * splash every host's identity document across the screen the moment an admin opens the page.
 */
export function DocumentReview({ documentId, filePath }: { documentId: string; filePath: string }) {
  const [isPending, startTransition] = useTransition();
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [reason, setReason] = useState('');
  const [result, setResult] = useState<{ error?: string; success?: string }>({});

  async function view() {
    setLoading(true);
    const signed = await getAdminDocumentUrl(filePath);
    setUrl(signed);
    setLoading(false);
    if (!signed) setResult({ error: 'Could not open that document.' });
  }

  function rule(verdict: 'verified' | 'rejected') {
    startTransition(async () => {
      const outcome = await reviewDocument(documentId, verdict, reason);
      setResult(outcome);
      if (!outcome.error) setShowReject(false);
    });
  }

  const isPdf = filePath.toLowerCase().endsWith('.pdf');

  return (
    <div className="space-y-3">
      {result.error ? <FormError>{result.error}</FormError> : null}
      {result.success ? <FormSuccess>{result.success}</FormSuccess> : null}

      {url ? (
        isPdf ? (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="inline-block text-sm font-medium text-slate-900 underline underline-offset-4"
          >
            Open the PDF in a new tab
          </a>
        ) : (
          // Deliberately a plain img rather than next/image: this is a signed URL that expires
          // in two minutes, and the image optimizer would try to cache it - which is not what
          // you want happening to someone's identity document.
          <img
            src={url}
            alt="Uploaded document"
            className="max-h-80 rounded-md border border-slate-200 bg-slate-50 object-contain"
          />
        )
      ) : (
        <Button type="button" variant="secondary" size="sm" onClick={view} disabled={loading}>
          {loading ? 'Opening...' : 'View document'}
        </Button>
      )}

      {!result.success ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            disabled={isPending || !url}
            onClick={() => rule('verified')}
          >
            {isPending ? 'Saving...' : 'Verify'}
          </Button>

          {!showReject ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={isPending || !url}
              onClick={() => setShowReject(true)}
            >
              Reject
            </Button>
          ) : null}

          {!url ? (
            <span className="text-xs text-slate-500">Open the document before ruling on it.</span>
          ) : null}
        </div>
      ) : null}

      {showReject ? (
        <div className="space-y-2 rounded-md border border-slate-200 p-3">
          <Field
            htmlFor={`reason-${documentId}`}
            label="Why is this being rejected?"
            required
            hint="The host sees this, so say what they need to upload instead."
          >
            <Textarea
              id={`reason-${documentId}`}
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="The address on this bill does not match the address on the listing."
            />
          </Field>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="danger"
              size="sm"
              disabled={isPending || reason.trim().length < 5}
              onClick={() => rule('rejected')}
            >
              Reject document
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowReject(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
