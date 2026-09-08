import Link from 'next/link';
import { formatPhoneForDisplay } from '@parking/core';
import { Badge, Button, Card, CardBody, CardHeader } from '@parking/ui';
import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { signOut } from '@/app/login/actions';
import { ProfileForm } from './profile-form';

export const metadata = { title: 'Profile and settings' };

/**
 * Profile & Settings (spec §8.1, §8.2 — the same screen for both, per §8.4's one-account rule).
 *
 * §8.1 lists "name, email, saved payment methods, logout". Three of those are here as editable
 * things. Saved payment methods are shown as what they actually are today rather than as an
 * empty list pretending a feature exists: Razorpay Checkout holds the instrument, the platform
 * never sees a card number, and there is nothing stored here to manage. Saying so is more use
 * to a seeker than an empty "no cards saved" panel that implies they did something wrong.
 */
export default async function AccountPage() {
  const profile = await requireProfile('/account');
  const supabase = await createClient();

  const [{ count: bookingCount }, { count: listingCount }] = await Promise.all([
    supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('seeker_id', profile.id)
      .in('status', ['confirmed', 'completed']),
    supabase.from('listings').select('id', { count: 'exact', head: true }).eq('host_id', profile.id),
  ]);

  return (
    <div className="min-h-dvh bg-slate-50">
      <SiteHeader />

      <main className="mx-auto max-w-2xl px-4 py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Profile and settings
          </h1>
          <p className="mt-1 text-slate-600">
            One account for booking parking and for listing your own space.
          </p>
        </header>

        <Card>
          <CardHeader title="Your details" />
          <CardBody>
            <ProfileForm initialName={profile.name ?? ''} initialEmail={profile.email ?? ''} />
          </CardBody>
        </Card>

        <Card className="mt-5">
          <CardHeader
            title="Mobile number"
            description="This is how you sign in, so it cannot be changed here."
          />
          <CardBody>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-medium text-slate-900 tabular-nums">
                {formatPhoneForDisplay(profile.phone)}
              </p>
              <Badge tone="success">Verified</Badge>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              To move your account to a different number, contact support — we move your bookings
              and any listings across with it.
            </p>
          </CardBody>
        </Card>

        <Card className="mt-5">
          <CardHeader title="Payment methods" />
          <CardBody>
            <p className="text-sm leading-relaxed text-slate-700">
              Nothing to manage here, by design. Payments run through Razorpay Checkout, which
              holds your card or UPI details on its own PCI-compliant systems — this platform
              never receives or stores a card number, so there is nothing on our side to save or
              delete.
            </p>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              You choose how to pay each time you book, and your bank or UPI app remembers what it
              normally remembers.
            </p>
          </CardBody>
        </Card>

        <Card className="mt-5">
          <CardHeader title="Your activity" />
          <CardBody>
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase">
                  Bookings made
                </dt>
                <dd className="mt-1 text-2xl font-semibold text-slate-900 tabular-nums">
                  {bookingCount ?? 0}
                </dd>
                <dd className="mt-1">
                  <Link
                    href="/bookings"
                    className="text-sm font-medium text-brand-600 hover:underline"
                  >
                    View my bookings
                  </Link>
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase">
                  Spaces listed
                </dt>
                <dd className="mt-1 text-2xl font-semibold text-slate-900 tabular-nums">
                  {listingCount ?? 0}
                </dd>
                <dd className="mt-1">
                  <Link href="/host" className="text-sm font-medium text-brand-600 hover:underline">
                    {listingCount ? 'Manage my listings' : 'List your space'}
                  </Link>
                </dd>
              </div>
            </dl>
          </CardBody>
        </Card>

        <Card className="mt-5">
          <CardHeader
            title="Sign out"
            description="You will need your mobile number and a new code to sign back in."
          />
          <CardBody>
            <form action={signOut}>
              <Button type="submit" variant="secondary">
                Sign out
              </Button>
            </form>
          </CardBody>
        </Card>

        <p className="mt-6 text-center text-xs text-slate-500">
          <Link href="/legal/privacy" className="hover:underline">
            How we handle your data
          </Link>
        </p>
      </main>

      <SiteFooter />
    </div>
  );
}
