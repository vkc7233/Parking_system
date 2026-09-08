import Link from 'next/link';
import { buttonVariants, Badge, Card, CardBody, EmptyState, Money } from '@parking/ui';
import { canBeReviewed, type BookingStatus } from '@parking/core';
import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { SiteHeader } from '@/components/site-header';

export const metadata = { title: 'My bookings' };

interface BookingRow {
  id: string;
  reference: string;
  start_time: string;
  end_time: string;
  total: number;
  status: BookingStatus;
  listings: { id: string; title: string; locality: string | null; city: string } | null;
}

const STATUS_TONE: Record<BookingStatus, 'neutral' | 'info' | 'success' | 'warning' | 'danger'> = {
  pending_payment: 'warning',
  confirmed: 'success',
  completed: 'neutral',
  cancelled: 'danger',
  payment_failed: 'danger',
};

const STATUS_LABEL: Record<BookingStatus, string> = {
  pending_payment: 'Awaiting payment',
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
  payment_failed: 'Payment failed',
};

/**
 * My Bookings (spec §8.1).
 *
 * §7.1 requires a completed booking to move from "upcoming" to "past" automatically at its end
 * time. That is done by `complete_elapsed_bookings()` on a schedule, so this page splits purely
 * on the booking window and never has to guess.
 *
 * There is nothing here to book with yet — checkout arrives in the next build — but the page is
 * real rather than a placeholder, so it will show genuine rows the moment bookings exist.
 */
export default async function BookingsPage() {
  const profile = await requireProfile('/bookings');
  const supabase = await createClient();

  const { data } = await supabase
    .from('bookings')
    .select(
      'id, reference, start_time, end_time, total, status, listings(id, title, locality, city)',
    )
    .eq('seeker_id', profile.id)
    .order('start_time', { ascending: false });

  const bookings = (data ?? []) as unknown as BookingRow[];
  const now = new Date();

  const upcoming = bookings.filter(
    (b) => new Date(b.end_time) >= now && b.status !== 'cancelled' && b.status !== 'payment_failed',
  );
  const past = bookings.filter((b) => !upcoming.includes(b));

  return (
    <div className="min-h-dvh bg-slate-50">
      <SiteHeader />

      <main className="mx-auto max-w-3xl px-4 py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">My bookings</h1>
          <p className="mt-1 text-slate-600">Everything you have booked, upcoming and past.</p>
        </header>

        {bookings.length === 0 ? (
          <Card>
            <EmptyState
              title="No bookings yet"
              description="Spaces you book will show up here with your access pass and directions."
              action={
                <Link href="/" className={buttonVariants({ size: 'md' })}>
                  Find parking
                </Link>
              }
            />
          </Card>
        ) : (
          <div className="space-y-8">
            <BookingSection
              title="Upcoming"
              bookings={upcoming}
              now={now}
              emptyNote="Nothing coming up."
            />
            <BookingSection title="Past" bookings={past} now={now} emptyNote="Nothing yet." />
          </div>
        )}
      </main>
    </div>
  );
}

function BookingSection({
  title,
  bookings,
  now,
  emptyNote,
}: {
  title: string;
  bookings: BookingRow[];
  now: Date;
  emptyNote: string;
}) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-medium text-slate-900">{title}</h2>

      {bookings.length === 0 ? (
        <p className="text-sm text-slate-500">{emptyNote}</p>
      ) : (
        <ul className="space-y-3">
          {bookings.map((booking) => {
            const start = new Date(booking.start_time);
            const end = new Date(booking.end_time);

            return (
              <li key={booking.id}>
                <Link href={'/bookings/' + booking.id} className="group block">
                  <Card className="transition group-hover:border-slate-300 group-hover:shadow-sm">
                    <CardBody>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-slate-900">
                              {booking.listings?.title ?? 'Listing removed'}
                            </span>
                            <Badge tone={STATUS_TONE[booking.status]}>
                              {STATUS_LABEL[booking.status]}
                            </Badge>
                          </div>

                          <p className="mt-0.5 text-sm text-slate-600">
                            {booking.listings?.locality ? booking.listings.locality + ', ' : ''}
                            {booking.listings?.city}
                          </p>

                          <p className="mt-1.5 text-sm text-slate-700">
                            {start.toLocaleString('en-IN', {
                              weekday: 'short',
                              day: 'numeric',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                            {' → '}
                            {end.toLocaleTimeString('en-IN', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>

                          <p className="mt-1 font-mono text-xs text-slate-500">
                            Ref {booking.reference}
                          </p>
                        </div>

                        <div className="text-right">
                          <p className="font-medium text-slate-900">
                            <Money paise={booking.total} />
                          </p>
                          {canBeReviewed(booking.status, end, now) ? (
                            <p className="mt-1 text-xs text-slate-500">Rating opens here</p>
                          ) : null}
                        </div>
                      </div>
                    </CardBody>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
