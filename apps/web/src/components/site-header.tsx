import Link from 'next/link';
import { getProfile } from '@/lib/auth';
import { signOut } from '@/app/login/actions';

/**
 * The seeker-facing header (spec §8.4).
 *
 * §8.4: one application, one account, role-aware navigation. A signed-in user sees the Seeker
 * experience by default with "List your space" as the way into the Host side. /admin is
 * deliberately absent — it is reached by typing the URL and nothing links to it, including for
 * admins.
 */
export async function SiteHeader() {
  const profile = await getProfile();

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
        <Link href="/" className="shrink-0 font-semibold tracking-tight text-slate-900">
          Parking<span className="text-slate-400">Marketplace</span>
        </Link>

        <nav className="ml-auto flex items-center gap-1 text-sm">
          {profile ? (
            <>
              <Link
                href="/bookings"
                className="rounded-md px-3 py-1.5 text-slate-700 hover:bg-slate-100"
              >
                My bookings
              </Link>
              <Link
                href="/host"
                className="rounded-md px-3 py-1.5 text-slate-700 hover:bg-slate-100"
              >
                List your space
              </Link>
              <form action={signOut}>
                <button
                  type="submit"
                  className="rounded-md px-3 py-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                >
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <Link
              href="/login"
              className="rounded-md bg-slate-900 px-4 py-1.5 font-medium text-white hover:bg-slate-800"
            >
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
