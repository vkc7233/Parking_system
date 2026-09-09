'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { reportClientError } from './report-error';

/**
 * Last-resort error boundary.
 *
 * Without this, an unhandled server error renders Next's own error screen — a stack trace, file
 * paths, and internal function names — to whoever happened to be on the page. That is a poor
 * experience and, in production, an information leak.
 *
 * Errors are reported rather than shown. `onRequestError` catches everything that fails on the
 * server; a component that throws while hydrating fails only in the browser, so without the call
 * below half of §7.4's "application errors" would reach nothing.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[unhandled]', error);

    // Reporting must never be able to re-throw inside an error boundary: that replaces this
    // screen with React's own, which is the thing this component exists to prevent.
    void reportClientError({
      message: error.message,
      ...(error.stack ? { stack: error.stack } : {}),
      ...(error.digest ? { digest: error.digest } : {}),
      path: window.location.pathname,
    }).catch(() => {});
  }, [error]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 text-center">
      <h1 className="text-2xl font-semibold text-slate-900">Something went wrong</h1>
      <p className="mt-2 text-slate-600">
        That is on us, not you. Nothing you were doing has been charged or lost.
      </p>

      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Back to search
        </Link>
      </div>

      {/* The digest is what correlates this screen with the server log entry. */}
      {error.digest ? (
        <p className="mt-6 font-mono text-xs text-slate-400">Reference {error.digest}</p>
      ) : null}
    </main>
  );
}
