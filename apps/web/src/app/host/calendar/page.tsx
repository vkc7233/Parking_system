import Link from 'next/link';
import { formatPaise } from '@parking/core';
import { Badge, Card, CardBody, CardHeader, EmptyState } from '@parking/ui';
import { requireHost } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Bookings calendar' };

interface CalendarBooking {
  id: string;
  reference: string;
  status: string;
  start_time: string;
  end_time: string;
  host_payout: number;
  checked_in_at: string | null;
  listing_id: string;
  listings: { title: string } | null;
}

const DAY_MS = 86_400_000;
/** Four weeks forward: far enough to plan around, short enough to read without scrolling. */
const DAYS_SHOWN = 28;

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/**
 * Host bookings calendar (spec §8.2 "Bookings Calendar — per-listing calendar view").
 *
 * A month grid was the obvious thing and the wrong one. A host's actual question is "is anyone
 * coming, and when do I need to be reachable" — and a grid of numbered boxes answers that only
 * after you click a box. This is four weeks of days, each listing its arrivals with times and
 * references, so the answer is readable without interaction. Empty days are collapsed to a
 * single line rather than drawn as empty cells: a host with three bookings this month should not
 * have to read twenty-five blank squares to find them.
 *
 * `?listing=` narrows to one space, which is the "per-listing" part of §8.2 — a host with a
 * driveway in Baner and a basement in Camp needs to see them apart.
 */
export default async function HostCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ listing?: string }>;
}) {
  const params = await searchParams;
  const profile = await requireHost('/host/calendar');
  const supabase = await createClient();

  const { data: listingRows } = await supabase
    .from('listings')
    .select('id, title')
    .eq('host_id', profile.id)
    .order('title');

  const listings = (listingRows ?? []) as { id: string; title: string }[];
  const selected = listings.find((l) => l.id === params.listing) ?? null;

  const from = startOfDay(new Date());
  const to = new Date(from.getTime() + DAYS_SHOWN * DAY_MS);

  let query = supabase
    .from('bookings')
    .select(
      'id, reference, status, start_time, end_time, host_payout, checked_in_at, listing_id, listings(title)',
    )
    .eq('host_id', profile.id)
    .in('status', ['confirmed', 'completed'])
    .gte('start_time', from.toISOString())
    .lt('start_time', to.toISOString())
    .order('start_time');

  if (selected) query = query.eq('listing_id', selected.id);

  const { data } = await query;
  const bookings = (data ?? []) as unknown as CalendarBooking[];

  // Grouped by local day, because a booking at 00:30 IST belongs to that morning for the host
  // standing at the gate, not to the previous UTC day.
  const byDay = new Map<string, CalendarBooking[]>();
  for (const booking of bookings) {
    const key = startOfDay(new Date(booking.start_time)).toISOString();
    byDay.set(key, [...(byDay.get(key) ?? []), booking]);
  }

  const days = Array.from({ length: DAYS_SHOWN }, (_, i) => {
    const date = new Date(from.getTime() + i * DAY_MS);
    return { date, bookings: byDay.get(startOfDay(date).toISOString()) ?? [] };
  });

  const expected = bookings.reduce((sum, b) => sum + Number(b.host_payout), 0);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Bookings calendar</h1>
        <p className="mt-1 text-slate-600">
          The next four weeks. {bookings.length} booking{bookings.length === 1 ? '' : 's'}
          {bookings.length > 0 ? ` · ${formatPaise(expected)} to you` : ''}
          {selected ? ` · ${selected.title}` : ''}.
        </p>
      </header>

      {listings.length > 1 ? (
        <nav aria-label="Filter by listing" className="no-scrollbar flex gap-2 overflow-x-auto">
          <Link
            href="/host/calendar"
            aria-current={selected ? undefined : 'page'}
            className={
              'shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium whitespace-nowrap transition ' +
              (selected
                ? 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'
                : 'border-slate-900 bg-slate-900 text-white')
            }
          >
            All spaces
          </Link>
          {listings.map((listing) => {
            const active = selected?.id === listing.id;
            return (
              <Link
                key={listing.id}
                href={`/host/calendar?listing=${listing.id}`}
                aria-current={active ? 'page' : undefined}
                className={
                  'shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium whitespace-nowrap transition ' +
                  (active
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400')
                }
              >
                {listing.title}
              </Link>
            );
          })}
        </nav>
      ) : null}

      <Card>
        <CardHeader
          title="Arrivals"
          description="Everyone due at one of your spaces, in the order they arrive."
        />

        {bookings.length === 0 ? (
          <EmptyState
            title="Nothing booked in the next four weeks"
            description={
              listings.length === 0
                ? 'Once you list a space and it goes live, bookings appear here.'
                : 'Your spaces are live and searchable — bookings will show up here as they come in.'
            }
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {days.map(({ date, bookings: dayBookings }) => {
              const isToday = startOfDay(new Date()).getTime() === startOfDay(date).getTime();

              // Quiet days collapse to one line so a busy day is findable at a glance.
              if (dayBookings.length === 0) {
                return (
                  <li
                    key={date.toISOString()}
                    className="flex items-center gap-3 px-5 py-1.5 text-xs text-slate-400"
                  >
                    <span className={'w-28 shrink-0' + (isToday ? ' font-medium text-brand-600' : '')}>
                      {isToday
                        ? 'Today'
                        : date.toLocaleDateString('en-IN', {
                            weekday: 'short',
                            day: 'numeric',
                            month: 'short',
                          })}
                    </span>
                    <span>Free</span>
                  </li>
                );
              }

              return (
                <li key={date.toISOString()} className="px-5 py-3">
                  <p
                    className={
                      'text-sm font-semibold ' + (isToday ? 'text-brand-600' : 'text-slate-900')
                    }
                  >
                    {isToday ? 'Today · ' : ''}
                    {date.toLocaleDateString('en-IN', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'short',
                    })}
                  </p>

                  <ul className="mt-2 space-y-2">
                    {dayBookings.map((booking) => (
                      <li
                        key={booking.id}
                        className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-slate-50 px-3 py-2"
                      >
                        <span className="text-sm font-medium text-slate-900 tabular-nums">
                          {new Date(booking.start_time).toLocaleTimeString('en-IN', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                          {' – '}
                          {new Date(booking.end_time).toLocaleTimeString('en-IN', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>

                        {selected ? null : (
                          <span className="min-w-0 truncate text-sm text-slate-600">
                            {booking.listings?.title ?? 'Listing removed'}
                          </span>
                        )}

                        <span className="font-mono text-xs text-slate-500">{booking.reference}</span>

                        {booking.checked_in_at ? (
                          <Badge tone="success">Arrived</Badge>
                        ) : booking.status === 'completed' ? (
                          <Badge tone="neutral">Never scanned</Badge>
                        ) : null}

                        <span className="ml-auto text-sm font-medium text-slate-900 tabular-nums">
                          {formatPaise(Number(booking.host_payout))}
                        </span>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        )}

        <CardBody className="border-t border-slate-100">
          <p className="text-sm text-slate-600">
            Someone at the gate? Open{' '}
            <Link href="/host/verify" className="font-medium text-brand-600 hover:underline">
              Check a pass
            </Link>{' '}
            and scan their code, or type the reference shown above.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
