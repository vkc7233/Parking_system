import Link from 'next/link';
import { formatPaise } from '@parking/core';
import { Badge, Card, CardBody, CardHeader, EmptyState } from '@parking/ui';
import { requireAdmin } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/service';
import { AdminCancelBooking } from './cancel-button';

export const metadata = { title: 'Bookings' };

const PAGE_SIZE = 50;

interface AdminBooking {
  id: string;
  reference: string;
  status: string;
  start_time: string;
  end_time: string;
  total: number;
  refund_amount: number | null;
  checked_in_at: string | null;
  cancelled_by: string | null;
  listings: { title: string } | null;
  host: { name: string | null } | null;
  seeker: { name: string | null; phone: string } | null;
  payments: { provider_payment_id: string | null; provider_order_id: string; status: string } | null;
}

const STATUS_TONE: Record<string, 'success' | 'info' | 'neutral' | 'warning' | 'danger'> = {
  completed: 'success',
  confirmed: 'info',
  pending_payment: 'warning',
  cancelled: 'neutral',
  payment_failed: 'danger',
};

/**
 * Every booking on the marketplace (spec §7.3, §8.3 "Bookings & Disputes").
 *
 * §7.3's acceptance criterion is that "every booking's current status and payment reference is
 * visible from one screen". There was no such screen: the dispute queue showed only disputed
 * bookings, and the CSV export carried the booking reference but never the provider's payment id.
 * That id is the one an operator needs when a seeker says the money left their account and the
 * platform disagrees — it is what you paste into the Razorpay dashboard.
 *
 * Read with the service role because it spans every host and seeker, which no client-scoped
 * query is allowed to do.
 */
export default async function AdminBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const service = createServiceClient();

  const page = Math.max(0, Number(params.page) || 0);

  let query = service
    .from('bookings')
    .select(
      'id, reference, status, start_time, end_time, total, refund_amount, checked_in_at, cancelled_by, ' +
        'listings(title), host:users!bookings_host_id_fkey(name), seeker:users!bookings_seeker_id_fkey(name, phone), ' +
        'payments(provider_payment_id, provider_order_id, status)',
      { count: 'exact' },
    )
    .order('start_time', { ascending: false })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

  if (params.status) query = query.eq('status', params.status);
  // A reference is what a seeker reads off their pass over the phone, so that is what support
  // will be typing here.
  if (params.q) query = query.ilike('reference', `%${params.q.trim().toUpperCase()}%`);

  const { data, count } = await query;
  const bookings = (data ?? []) as unknown as AdminBooking[];

  const filters = [
    { value: '', label: 'All' },
    { value: 'confirmed', label: 'Confirmed' },
    { value: 'completed', label: 'Completed' },
    { value: 'pending_payment', label: 'Awaiting payment' },
    { value: 'cancelled', label: 'Cancelled' },
    { value: 'payment_failed', label: 'Payment failed' },
  ];

  const total = count ?? 0;
  const hasMore = (page + 1) * PAGE_SIZE < total;

  const withFilter = (status: string, nextPage = 0) => {
    const q = new URLSearchParams();
    if (status) q.set('status', status);
    if (params.q) q.set('q', params.q);
    if (nextPage) q.set('page', String(nextPage));
    return q.size ? `/admin/bookings?${q}` : '/admin/bookings';
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Bookings</h1>
        <p className="mt-1 text-slate-600">
          {total} booking{total === 1 ? '' : 's'}
          {params.status ? ` with status ${params.status}` : ''}
          {params.q ? ` matching “${params.q}”` : ''}.
        </p>
      </header>

      <form className="flex flex-wrap items-end gap-2" action="/admin/bookings">
        {params.status ? <input type="hidden" name="status" value={params.status} /> : null}
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Booking reference</span>
          <input
            name="q"
            defaultValue={params.q ?? ''}
            placeholder="D5FJB26A"
            className="h-10 w-44 rounded-lg border border-slate-300 bg-white px-3 font-mono text-sm uppercase shadow-xs focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
          />
        </label>
        <button
          type="submit"
          className="h-10 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white transition hover:bg-brand-700"
        >
          Find
        </button>
      </form>

      <nav aria-label="Filter by status" className="no-scrollbar flex gap-2 overflow-x-auto">
        {filters.map((filter) => {
          const active = (params.status ?? '') === filter.value;
          return (
            <Link
              key={filter.label}
              href={withFilter(filter.value)}
              aria-current={active ? 'page' : undefined}
              className={
                'shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium whitespace-nowrap transition ' +
                (active
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400')
              }
            >
              {filter.label}
            </Link>
          );
        })}
      </nav>

      <Card>
        <CardHeader
          title="All bookings"
          description="Newest first. The payment reference is the id to search for in the provider dashboard."
        />

        {bookings.length === 0 ? (
          <EmptyState
            title="Nothing matches"
            description="Try a different status, or clear the reference search."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {bookings.map((booking) => {
              const payment = booking.payments;
              const refunded = Number(booking.refund_amount ?? 0);

              return (
                <li key={booking.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-medium text-slate-900">
                          {booking.reference}
                        </span>
                        <Badge tone={STATUS_TONE[booking.status] ?? 'neutral'}>
                          {booking.status.replace('_', ' ')}
                        </Badge>
                        {booking.cancelled_by ? (
                          <Badge tone="neutral">by {booking.cancelled_by}</Badge>
                        ) : null}
                        {booking.checked_in_at ? <Badge tone="success">Arrived</Badge> : null}
                        {refunded > 0 ? (
                          <Badge tone="warning">Refunded {formatPaise(refunded)}</Badge>
                        ) : null}
                      </div>

                      <p className="mt-1 truncate text-sm text-slate-700">
                        {booking.listings?.title ?? 'Listing removed'}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {new Date(booking.start_time).toLocaleString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                        {' → '}
                        {new Date(booking.end_time).toLocaleTimeString('en-IN', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                        {' · '}
                        {booking.seeker?.name ?? 'Unknown seeker'}
                        {' → '}
                        {booking.host?.name ?? 'Unknown host'}
                      </p>

                      {/* The whole point of this screen. */}
                      <p className="mt-1 font-mono text-xs break-all text-slate-500">
                        {payment?.provider_payment_id
                          ? `payment ${payment.provider_payment_id}`
                          : payment
                            ? `order ${payment.provider_order_id} (${payment.status})`
                            : 'no payment record'}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <span className="text-sm font-semibold tabular-nums text-slate-900">
                        {formatPaise(Number(booking.total))}
                      </span>

                      {booking.status === 'confirmed' || booking.status === 'pending_payment' ? (
                        <AdminCancelBooking
                          bookingId={booking.id}
                          reference={booking.reference}
                          amount={formatPaise(Number(booking.total))}
                        />
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {total > PAGE_SIZE ? (
          <CardBody className="flex items-center justify-between border-t border-slate-100">
            <span className="text-sm text-slate-600">
              {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
            </span>
            <span className="flex gap-2">
              {page > 0 ? (
                <Link
                  href={withFilter(params.status ?? '', page - 1)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Previous
                </Link>
              ) : null}
              {hasMore ? (
                <Link
                  href={withFilter(params.status ?? '', page + 1)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Next
                </Link>
              ) : null}
            </span>
          </CardBody>
        ) : null}
      </Card>
    </div>
  );
}
