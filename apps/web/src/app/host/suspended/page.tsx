import Link from 'next/link';
import { Card, CardBody, CardHeader } from '@parking/ui';
import { requireProfile } from '@/lib/auth';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';

export const metadata = { title: 'Hosting paused' };

/**
 * Where a suspended host lands (spec §7.3).
 *
 * `requireHost` has always redirected here, and the route did not exist — so a suspended host
 * got a 404 on every single host page, with no explanation and nowhere to go. Suspension is a
 * deliberate act by an Admin against someone's livelihood on this platform; telling them it has
 * happened, and how to challenge it, is the least the product owes them.
 *
 * Deliberately NOT inside the host layout: that layout calls `requireHost`, which redirects
 * suspended users here, which would loop.
 */
export default async function HostSuspendedPage() {
  const profile = await requireProfile('/host');

  return (
    <div className="min-h-dvh bg-slate-50">
      <SiteHeader />

      <main className="mx-auto max-w-xl px-4 py-12 sm:px-6 lg:px-8">
        <Card>
          <CardHeader
            title="Hosting is paused on your account"
            description="Your listings have been taken out of search while this is reviewed."
          />
          <CardBody className="space-y-4 text-sm leading-relaxed text-slate-700">
            <p>
              You can still sign in, see your past bookings, and use the platform to find parking.
              What you cannot do right now is publish listings or take new bookings.
            </p>
            <p>
              Money already earned is not affected. Any booking that completed before the pause is
              still owed to you and will be paid in the normal run.
            </p>
            <p className="text-slate-600">
              If you think this is a mistake, reply to the message we sent when it happened and an
              admin will look at it again.
            </p>

            <div className="flex flex-wrap gap-3 pt-2">
              <Link
                href="/bookings"
                className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                My bookings
              </Link>
              <Link
                href="/"
                className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-700"
              >
                Find parking
              </Link>
            </div>
          </CardBody>
        </Card>

        <p className="mt-4 text-center text-xs text-slate-500">
          Signed in as {profile.name ?? 'your account'}.
        </p>
      </main>

      <SiteFooter />
    </div>
  );
}
