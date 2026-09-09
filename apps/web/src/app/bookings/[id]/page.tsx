import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CANCELLATION, DISPUTE } from '@parking/config';
import { calculateRefund, canBeReviewed, type BookingStatus } from '@parking/core';
import { Badge, Card, CardBody, CardHeader, FormSuccess, Money } from '@parking/ui';
import { requireProfile } from '@/lib/auth';
import { issuePassFor } from '@/lib/access-pass';
import { createServiceClient } from '@/lib/supabase/service';
import { SiteHeader } from '@/components/site-header';
import { DirectionsLink } from '@/components/directions-link';
import { CancelBooking } from './cancel-booking';
import { ReviewForm } from './review-form';
import { DisputeForm } from './dispute-form';

export const metadata = { title: 'Booking' };

const STATUS_TONE: Record<BookingStatus, 'neutral' | 'info' | 'success' | 'warning' | 'danger'> = {
  pending_payment: 'warning',
  confirmed: 'success',
  completed: 'neutral',
  cancelled: 'danger',
  payment_failed: 'danger',
};

/**
 * Booking detail and the digital access pass (spec §6.1 steps 6-8, §8.1).
 *
 * §7.1 requires the pass to be delivered within ten seconds of payment success. It is generated
 * on this page rather than stored, so it exists the moment the booking is confirmed and cannot
 * drift out of date — and the QR encodes a signed token, so the Host's verify screen can trust
 * it without a lookup (assumption A5).
 */
export default async function BookingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ paid?: string }>;
}) {
  const { id } = await params;
  const { paid } = await searchParams;
  const profile = await requireProfile(`/bookings/${id}`);
  const service = createServiceClient();

  const { data: booking } = await service
    .from('bookings')
    .select(
      'id, reference, seeker_id, host_id, listing_id, status, start_time, end_time, subtotal, service_fee, tax, total, refund_amount, cancellation_reason, checked_in_at, listings(title, address_line, locality, city, rules, lat, lng)',
    )
    .eq('id', id)
    .maybeSingle();

  // Both parties can see a booking; nobody else can.
  if (!booking || (booking.seeker_id !== profile.id && booking.host_id !== profile.id)) {
    notFound();
  }

  const listing = booking.listings as unknown as {
    title: string;
    address_line: string;
    locality: string | null;
    lat: number;
    lng: number;
    city: string;
    rules: string | null;
  } | null;

  const start = new Date(booking.start_time);
  const end = new Date(booking.end_time);
  const isSeeker = booking.seeker_id === profile.id;

  // The pass only exists for a booking that is actually paid for.
  const pass =
    booking.status === 'confirmed' || booking.status === 'completed'
      ? await issuePassFor({
          id: booking.id,
          listingId: booking.listing_id,
          startTime: start,
          endTime: end,
        })
      : null;

  // What cancelling now would refund, so the decision is informed rather than a surprise (A2).
  const refundIfCancelledNow =
    booking.status === 'confirmed'
      ? calculateRefund({
          charged: {
            subtotal: Number(booking.subtotal),
            serviceFee: Number(booking.service_fee),
            tax: Number(booking.tax),
            total: Number(booking.total),
          },
          bookingStartTime: start,
          cancelledAt: new Date(),
          cancelledBy: isSeeker ? 'seeker' : 'host',
        })
      : null;

  const { data: existingDispute } = await service
    .from('disputes')
    .select('status, reason')
    .eq('booking_id', booking.id)
    .maybeSingle();

  // A11: the window a seeker has to report a problem, and the same window the host's earnings
  // are held for.
  const disputeWindowOpen =
    isSeeker &&
    (booking.status === 'completed' || booking.status === 'confirmed') &&
    Date.now() < end.getTime() + DISPUTE.windowHoursAfterBookingEnd * 3_600_000 &&
    Date.now() > start.getTime();

  const { data: existingReview } = await service
    .from('reviews')
    .select('id, rating, comment')
    .eq('booking_id', booking.id)
    .eq('created_by', profile.id)
    .maybeSingle();

  return (
    <div className="min-h-dvh bg-slate-50">
      <SiteHeader />

      <main className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/bookings" className="text-sm text-slate-600 underline underline-offset-4">
          Back to my bookings
        </Link>

        {paid ? (
          <div className="mt-4">
            <FormSuccess>
              Payment received. Your space is booked — show the pass below on arrival.
            </FormSuccess>
          </div>
        ) : null}

        <header className="mt-4 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            {listing?.title ?? 'Booking'}
          </h1>
          <Badge tone={STATUS_TONE[booking.status as BookingStatus]}>
            {booking.status.replace('_', ' ')}
          </Badge>
        </header>

        {pass ? (
          <Card className="mt-5">
            <CardHeader title="Your access pass" description="Show this to the host on arrival." />
            <CardBody className="flex flex-col items-center gap-3 text-center">
              <Image
                src={pass.qrDataUrl}
                alt={`Access pass QR code for booking ${booking.reference}`}
                width={220}
                height={220}
                unoptimized
                className="rounded-lg border border-slate-200"
              />
              <p className="font-mono text-lg font-semibold tracking-widest text-slate-900">
                {booking.reference}
              </p>
              <p className="max-w-sm text-xs text-slate-500">
                If the code will not scan, the host can type this reference instead. The pass is
                valid from shortly before your arrival until shortly after you leave.
              </p>
            </CardBody>
          </Card>
        ) : null}

        <Card className="mt-5">
          <CardHeader title="Details" />
          <CardBody className="space-y-3">
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-600">Where</dt>
                <dd className="text-right text-slate-900">
                  {listing?.address_line}
                  <br />
                  {listing?.locality ? listing.locality + ', ' : ''}
                  {listing?.city}
                  {listing ? (
                    <span className="mt-1 block">
                      <DirectionsLink
                        location={{ lat: listing.lat, lng: listing.lng }}
                        label={listing.locality ?? listing.city}
                      />
                    </span>
                  ) : null}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
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
              <div className="flex justify-between gap-4">
                <dt className="text-slate-600">Leaving</dt>
                <dd className="text-slate-900">
                  {end.toLocaleString('en-IN', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </dd>
              </div>
              <div className="flex justify-between gap-4 border-t border-slate-100 pt-1.5">
                <dt className="text-slate-600">Paid</dt>
                <dd className="font-medium text-slate-900">
                  <Money paise={Number(booking.total)} />
                </dd>
              </div>
              {booking.refund_amount ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-600">Refunded</dt>
                  <dd className="text-slate-900">
                    <Money paise={Number(booking.refund_amount)} />
                  </dd>
                </div>
              ) : null}
            </dl>

            {listing?.rules ? (
              <div className="border-t border-slate-100 pt-3">
                <h2 className="text-sm font-medium text-slate-900">House rules</h2>
                <p className="mt-1 text-sm text-slate-700">{listing.rules}</p>
              </div>
            ) : null}

            {booking.cancellation_reason ? (
              <p className="border-t border-slate-100 pt-3 text-sm text-slate-600">
                {booking.cancellation_reason}
              </p>
            ) : null}
          </CardBody>
        </Card>

        {booking.status === 'confirmed' && refundIfCancelledNow ? (
          <Card className="mt-5">
            <CardHeader
              title="Need to cancel?"
              // The headline has to describe THIS booking, not the policy in general. Saying
              // "free cancellation up to 6 hours before" above a line that refunds half reads
              // as a promise being broken, on the one screen where trust about money is the
              // whole product.
              description={
                refundIfCancelledNow.isFullRefund
                  ? `Free until ${CANCELLATION.tiers[0]?.minHoursBeforeStart} hours before you arrive.`
                  : 'You are now inside the free-cancellation window, so a part of the price is kept.'
              }
            />
            <CardBody>
              <CancelBooking
                bookingId={booking.id}
                refundAmount={refundIfCancelledNow.totalRefund}
                isFullRefund={refundIfCancelledNow.isFullRefund}
              />
            </CardBody>
          </Card>
        ) : null}

        {disputeWindowOpen || existingDispute ? (
          <Card className="mt-5">
            <CardHeader
              title="Report a problem"
              description={`Within ${DISPUTE.windowHoursAfterBookingEnd} hours of the booking ending.`}
            />
            <CardBody>
              <DisputeForm
                bookingId={booking.id}
                existing={
                  existingDispute
                    ? { status: existingDispute.status, reason: existingDispute.reason }
                    : null
                }
              />
            </CardBody>
          </Card>
        ) : null}

        {isSeeker && canBeReviewed(booking.status as BookingStatus, end) ? (
          <Card className="mt-5">
            <CardHeader
              title="How was it?"
              description="Your rating helps other drivers, and helps good hosts get booked."
            />
            <CardBody>
              <ReviewForm
                bookingId={booking.id}
                existing={existingReview ? { rating: existingReview.rating } : null}
              />
            </CardBody>
          </Card>
        ) : null}
      </main>
    </div>
  );
}
