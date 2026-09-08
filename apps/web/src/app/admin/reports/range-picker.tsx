'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, Input, fieldAria } from '@parking/ui';

/**
 * Date range for the report, plus the export.
 *
 * The download is a plain link to the route rather than a fetch-and-blob, so the browser handles
 * the file the way it handles any download and the admin's session cookie authenticates it —
 * the route calls `requireAdmin()` like every other admin surface.
 */
export function RangePicker({
  initialFrom,
  initialTo,
  downloadHref,
}: {
  initialFrom: string;
  initialTo: string;
  downloadHref: string;
}) {
  const router = useRouter();
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);

  // The range in the URL is what the totals were computed from. Until the page reloads with a
  // changed range, the export link would disagree with the numbers on screen — so it is disabled
  // rather than left pointing at a different period than the one being read.
  const dirty = from !== initialFrom || to !== initialTo;

  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        router.push(`/admin/reports?from=${from}&to=${to}`);
      }}
    >
      <Field htmlFor="report-from" label="From" className="w-40">
        <Input
          {...fieldAria('report-from')}
          type="date"
          value={from}
          max={to}
          onChange={(event) => setFrom(event.target.value)}
        />
      </Field>

      <Field htmlFor="report-to" label="To" className="w-40">
        <Input
          {...fieldAria('report-to')}
          type="date"
          value={to}
          min={from}
          onChange={(event) => setTo(event.target.value)}
        />
      </Field>

      <Button type="submit" variant={dirty ? 'primary' : 'secondary'}>
        Update totals
      </Button>

      {dirty ? (
        <p className="text-sm text-slate-500">Update the totals to export this range.</p>
      ) : (
        <a
          href={downloadHref}
          download
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-5 text-sm font-medium text-slate-700 shadow-xs transition hover:border-slate-400 hover:bg-slate-50"
        >
          <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" aria-hidden="true">
            <path
              d="M8 2v8m0 0 3-3m-3 3L5 7M2.5 12.5h11"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Download CSV
        </a>
      )}
    </form>
  );
}
