import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Card, CardBody, CardHeader, Money } from '@parking/ui';
import { requireProfile } from '@/lib/auth';
import { clientEnv, getServerEnv } from '@/lib/env';
import { createServiceClient } from '@/lib/supabase/service';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { CheckoutPanel } from './checkout-panel';

export const metadata = { title: 'Checkout' };

/**
 * Payment step (spec §6.1 step 5, §8.1).
 *
 * Read with the service role because `payments` is deliberately not readable by anything that
 * has a write path — the Seeker's own row is visible to them under RLS, but the order id needed
 * to open checkout is server-side detail.
 */
export default async function CheckoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireProfile(`/bookings/${id}/checkout`);
  const service = createServiceClient();

  const { data: booking } = await service
    .from('bookings')
    .select(
      'id, reference, seeker_id, status, total, start_time, end_time, hold_expires_at, listings(title, address_line, locality, city)',
    )
    .eq('id', id)
    .maybeSingle();

  if (!booking || booking.seeker_id !== profile.id) notFound();

  // Already paid, or already gone: neither belongs on a payment screen.
  if (booking.status === 'confirmed' || booking.status === 'completed') {
    redirect(`/bookings/${booking.id}`);
  }
  if (booking.status !== 'pending_payment') {
    redirect('/bookings');
  }

  const { data: payment } = await service
    .from('payments')
    .select('provider_order_id, amount')
    .eq('booking_id', booking.id)
    .maybeSingle();

  if (!payment?.provider_order_id) notFound();

  const listing = booking.listings as unknown as {
    title: string;
    address_line: string;
    locality: string | null;
    city: string;
  } | null;

  const start = new Date(booking.start_time);
  const end = new Date(booking.end_time);

  return (
    <div className="min-h-dvh bg-slate-50">
      <SiteHeader />

      <main className="mx-auto max-w-lg px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Confirm and pay</h1>
        <p className="mt-1 text-slate-600">
          Your space is held while you complete payment. Nothing is charged until you do.
        </p>

        <Card className="mt-6">
          <CardHeader
            title={listing?.title ?? 'Your booking'}
            description={
              listing ? `${listing.locality ? listing.locality + ', ' : ''}${listing.city}` : null
            }
          />
          <CardBody className="space-y-4">
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-600">Arriving</dt>
                <dd className="text-slate-900">
                  {start.toLocaleString('en-IN', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-600">Leaving</dt>
                <dd className="text-slate-900">
                  {end.toLocaleString('en-IN', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </dd>
              </div>
              <div className="flex justify-between border-t border-slate-100 pt-1.5 text-base font-semibold">
                <dt className="text-slate-900">Total</dt>
                <dd className="text-slate-900">
                  <Money paise={Number(booking.total)} />
                </dd>
              </div>
            </dl>

            <CheckoutPanel
              bookingId={booking.id}
              orderId={payment.provider_order_id}
              amount={Number(payment.amount)}
              provider={getServerEnv().PAYMENTS_PROVIDER}
              expiresAt={booking.hold_expires_at}
              razorpayKeyId={clientEnv.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? null}
              reference={booking.reference}
              listingTitle={listing?.title ?? 'Parking booking'}
              seekerName={profile.name}
              seekerPhone={profile.phone}
            />
          </CardBody>
        </Card>

        {/*
          * §7.4 requires the three legal pages to be "linked from checkout and footer". They
          * were on the footer and on the booking form, but not here — the one screen where
          * money actually changes hands, and the exact moment someone wants to re-read what
          * happens if they cancel. They open in a new tab so a seeker checking the refund rules
          * does not lose a slot that is held for ten minutes.
          */}
        <p className="mt-5 text-center text-xs leading-relaxed text-slate-500">
          By paying you accept our{' '}
          <Link
            href="/legal/terms"
            target="_blank"
            className="font-medium text-brand-600 hover:underline"
          >
            Terms
          </Link>
          ,{' '}
          <Link
            href="/legal/cancellation"
            target="_blank"
            className="font-medium text-brand-600 hover:underline"
          >
            Cancellation &amp; Refund Policy
          </Link>{' '}
          and{' '}
          <Link
            href="/legal/privacy"
            target="_blank"
            className="font-medium text-brand-600 hover:underline"
          >
            Privacy Policy
          </Link>
          . Opening any of these keeps this page open, so your slot stays held.
        </p>

        <p className="mt-4 text-center font-mono text-xs text-slate-400">Ref {booking.reference}</p>
      </main>

      <SiteFooter />
    </div>
  );
}
