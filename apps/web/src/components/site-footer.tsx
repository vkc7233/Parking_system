import Link from 'next/link';
import { PILOT_CITY } from '@parking/config';

/**
 * Spec §7.4: the three legal pages must be "published and linked from checkout and footer
 * before go-live". This is the footer half; the checkout half is linked from the booking form.
 */
export function SiteFooter() {
  return (
    <footer className="mt-12 border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-6 text-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="text-slate-500">
          Parking Marketplace · {PILOT_CITY.name}, {PILOT_CITY.state}
        </p>

        <nav className="flex flex-wrap gap-x-4 gap-y-1">
          <Link href="/legal/terms" className="text-slate-600 hover:text-slate-900">
            Terms
          </Link>
          <Link href="/legal/privacy" className="text-slate-600 hover:text-slate-900">
            Privacy
          </Link>
          <Link href="/legal/cancellation" className="text-slate-600 hover:text-slate-900">
            Cancellation &amp; refunds
          </Link>
        </nav>
      </div>
    </footer>
  );
}
