import Link from 'next/link';
import type { ReactNode } from 'react';
import { SiteHeader } from '@/components/site-header';

/**
 * Shared shell for the three legal pages (spec §7.4).
 *
 * §7.4 requires Terms of Service, Privacy Policy, and a Cancellation & Refund Policy to be
 * published and linked from checkout and the footer before go-live, and §13 makes engaging
 * counsel a Sprint 0 item precisely because it can gate launch.
 *
 * The wording in these pages is a working draft that describes what the platform actually does.
 * It is deliberately specific — the cancellation tiers, the fee, the retention periods and the
 * dispute window are all read from configuration, so the published policy cannot drift away
 * from the code that enforces it. It is NOT reviewed wording, and the banner says so.
 */
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-slate-50">
      <SiteHeader />

      <main className="mx-auto max-w-2xl px-4 py-10">
        <nav className="mb-6 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <Link href="/legal/terms" className="text-slate-600 underline underline-offset-4">
            Terms of Service
          </Link>
          <Link href="/legal/privacy" className="text-slate-600 underline underline-offset-4">
            Privacy Policy
          </Link>
          <Link href="/legal/cancellation" className="text-slate-600 underline underline-offset-4">
            Cancellation &amp; Refunds
          </Link>
        </nav>

        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">Last updated {updated}</p>

        <div className="mt-5 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span className="font-medium">Draft, pending legal review.</span> This describes how the
          platform actually behaves today, but it has not been reviewed by counsel and must be
          before the first real booking.
        </div>

        <div className="mt-6 space-y-6">{children}</div>
      </main>
    </div>
  );
}

export function Clause({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-base font-semibold text-slate-900">{heading}</h2>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-slate-700">{children}</div>
    </section>
  );
}
