import Link from 'next/link';
import { PAYOUT, PILOT_CITY } from '@parking/config';
import { createClient } from '@/lib/supabase/server';
import { signOut } from './login/actions';

/**
 * Sprint 0 landing page.
 *
 * This is scaffolding, not the finished Seeker home screen. Spec 8.1 puts the map + list
 * search here, and that arrives in Sprint 3 once the PostGIS search and listing detail work
 * is done. For now it proves the auth loop end to end and gives each role a way in.
 */
export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const profile = user
    ? (await supabase.from('users').select('name, role, kyc_status').eq('id', user.id).single())
        .data
    : null;

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <header className="mb-10">
        <p className="text-sm font-medium text-slate-500">
          Pilot city: {PILOT_CITY.name}, {PILOT_CITY.state}
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">
          Parking Marketplace
        </h1>
        <p className="mt-2 text-slate-600">
          Book guaranteed parking near where you are going, or earn from a space you are not using.
        </p>
      </header>

      {user ? (
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-medium text-slate-900">
            Signed in{profile?.name ? ` as ${profile.name}` : ''}
          </h2>
          <dl className="mt-3 space-y-1 text-sm text-slate-600">
            <div className="flex gap-2">
              <dt className="font-medium text-slate-700">Phone</dt>
              <dd>{user.phone ?? '-'}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="font-medium text-slate-700">Role</dt>
              <dd>{profile?.role ?? 'seeker'}</dd>
            </div>
          </dl>

          <nav className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/bookings"
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              My bookings
            </Link>
            <Link
              href="/host"
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              List your space
            </Link>
          </nav>

          <form action={signOut} className="mt-6">
            <button
              type="submit"
              className="text-sm text-slate-600 underline underline-offset-4 hover:text-slate-900"
            >
              Sign out
            </button>
          </form>
        </section>
      ) : (
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-medium text-slate-900">Get started</h2>
          <p className="mt-1 text-sm text-slate-600">
            Sign in with your mobile number. No password to remember.
          </p>
          <Link
            href="/login"
            className="mt-4 inline-block rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            Sign in
          </Link>
        </section>
      )}

      <footer className="mt-10 border-t border-slate-200 pt-6 text-xs text-slate-500">
        <p>
          Sprint 0 foundation. Search, booking, and payments arrive in Sprints 3 to 5 - see
          docs/ROADMAP-STATUS.md.
        </p>
        <p className="mt-2">
          Payouts are processed weekly, within {PAYOUT.targetDays} days of a booking completing.
        </p>
      </footer>
    </main>
  );
}
