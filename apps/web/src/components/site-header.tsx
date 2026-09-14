import Link from 'next/link';
import { getProfile } from '@/lib/auth';

/**
 * The seeker-facing header (spec §8.4).
 *
 * §8.4: one application, one account, role-aware navigation. A signed-in user sees the Seeker
 * experience by default with "List your space" as the way into the Host side. /admin is
 * deliberately absent — it is reached by typing the URL and nothing links to it, including for
 * admins.
 *
 * Two sets of labels rather than a hamburger. Three links do not justify a menu a thumb has to
 * open, but "List your space" wrapped onto three lines on a 375px screen and pushed the search
 * below the fold — which is the one thing this header must never do, since almost every seeker
 * arrives on a phone. The short labels carry the same meaning; the full ones return at `sm`.
 */
export async function SiteHeader() {
  const profile = await getProfile();

  const linkClass = 'rounded-md px-2.5 py-1.5 text-slate-700 transition hover:bg-slate-100 sm:px-3';

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8 py-3">
        <Link
          href="/"
          className="shrink-0 font-semibold tracking-tight text-slate-900"
          aria-label="Parking Marketplace home"
        >
          Parking<span className="text-slate-400">Marketplace</span>
        </Link>

        <nav className="ml-auto flex shrink-0 items-center gap-0.5 text-sm sm:gap-1">
          {profile ? (
            <>
              <Link href="/bookings" className={linkClass}>
                <span className="sm:hidden">Bookings</span>
                <span className="hidden sm:inline">My bookings</span>
              </Link>
              <Link href="/host" className={linkClass}>
                <span className="sm:hidden">Host</span>
                <span className="hidden sm:inline">List your space</span>
              </Link>
              <Link href="/account" className={linkClass} aria-label="Profile and settings">
                <span className="sm:hidden">You</span>
                <span className="hidden sm:inline">Profile</span>
              </Link>
            </>
          ) : (
            <Link
              href="/login"
              className="rounded-md bg-slate-900 px-4 py-1.5 font-medium text-white transition hover:bg-slate-800"
            >
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
