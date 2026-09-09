import Link from 'next/link';
import { PILOT_CITY, SUPPORT, supportWhatsAppUrl } from '@parking/config';

/**
 * Spec §7.4: the three legal pages must be "published and linked from checkout and footer
 * before go-live". This is the footer half; the checkout screen links them directly too.
 *
 * The support link is §7.1's "basic support contact". The Terms page has always claimed support
 * was "linked from the app" — until now it was not, anywhere.
 */
export function SiteFooter() {
  return (
    <footer className="mt-12 border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 sm:px-6 lg:px-8 py-6 text-sm sm:flex-row sm:items-center sm:justify-between">
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
          <a
            href={supportWhatsAppUrl('Hi, I need help with a parking booking.')}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-brand-600 hover:text-brand-700"
            title={`We reply ${SUPPORT.respondsWithin}`}
          >
            Get help
          </a>
        </nav>
      </div>
    </footer>
  );
}
