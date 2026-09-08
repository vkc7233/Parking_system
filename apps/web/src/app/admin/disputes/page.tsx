import { formatPaise } from '@parking/core';
import { Badge, Card, CardBody, CardHeader, EmptyState } from '@parking/ui';
import { requireAdmin } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/service';
import { ResolveForm } from './resolve-form';

export const metadata = { title: 'Disputes' };

interface DisputeRow {
  id: string;
  reason: string;
  status: string;
  created_at: string;
  resolution_note: string | null;
  resolved_at: string | null;
  bookings: {
    id: string;
    reference: string;
    total: number;
    start_time: string;
    end_time: string;
    checked_in_at: string | null;
    listings: { title: string } | null;
    users: { name: string | null; phone: string } | null;
  } | null;
  raised: { name: string | null; phone: string } | null;
}

/**
 * Dispute queue (spec §6.3 step 4, §7.3).
 *
 * §6.3 has the Admin monitoring this daily and "intervening manually where the automated flow
 * cannot resolve an issue". The card carries what that judgement needs: what the seeker says,
 * whether they actually checked in, and what is at stake.
 */
export default async function AdminDisputesPage() {
  await requireAdmin();
  const service = createServiceClient();

  const { data } = await service
    .from('disputes')
    .select(
      'id, reason, status, created_at, resolution_note, resolved_at, bookings(id, reference, total, start_time, end_time, checked_in_at, listings(title), users!bookings_host_id_fkey(name, phone)), raised:users!disputes_raised_by_fkey(name, phone)',
    )
    .order('created_at', { ascending: true });

  const disputes = (data ?? []) as unknown as DisputeRow[];
  const open = disputes.filter((d) => d.status === 'open');
  const closed = disputes.filter((d) => d.status !== 'open');

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Disputes</h1>
        <p className="mt-1 text-slate-600">
          {open.length === 0
            ? 'Nothing open. A host is never paid on a booking while its dispute is unresolved.'
            : `${open.length} open. The host is not paid on any of these until they are resolved.`}
        </p>
      </header>

      {open.length === 0 ? (
        <Card>
          <EmptyState
            title="No open disputes"
            description="A seeker can raise one within 48 hours of a booking ending. Until they do — or the window closes — the host's earnings stay held."
          />
        </Card>
      ) : (
        <ul className="space-y-4">
          {open.map((dispute) => {
            const booking = dispute.bookings;

            return (
              <li key={dispute.id}>
                <Card>
                  <CardHeader
                    title={booking?.listings?.title ?? 'Booking'}
                    description={
                      <>
                        Raised by {dispute.raised?.name ?? 'a seeker'} on{' '}
                        {new Date(dispute.created_at).toLocaleDateString('en-IN')} · host{' '}
                        {booking?.users?.name ?? 'unknown'}
                      </>
                    }
                    action={<Badge tone="danger">Open</Badge>}
                  />
                  <CardBody className="space-y-4">
                    <blockquote className="rounded-md bg-slate-50 px-3 py-2.5 text-sm text-slate-800">
                      {dispute.reason}
                    </blockquote>

                    <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                      <div className="flex justify-between gap-3">
                        <dt className="text-slate-600">Amount at stake</dt>
                        <dd className="font-medium text-slate-900">
                          {formatPaise(Number(booking?.total ?? 0))}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-slate-600">Reference</dt>
                        <dd className="font-mono text-slate-900">{booking?.reference}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-slate-600">Booked</dt>
                        <dd className="text-slate-900">
                          {booking
                            ? new Date(booking.start_time).toLocaleString('en-IN', {
                                day: 'numeric',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : '—'}
                        </dd>
                      </div>
                      {/* Whether the pass was ever scanned is the single most useful fact here. */}
                      <div className="flex justify-between gap-3">
                        <dt className="text-slate-600">Checked in</dt>
                        <dd
                          className={
                            booking?.checked_in_at ? 'text-slate-900' : 'font-medium text-amber-800'
                          }
                        >
                          {booking?.checked_in_at
                            ? new Date(booking.checked_in_at).toLocaleTimeString('en-IN', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : 'Never scanned'}
                        </dd>
                      </div>
                    </dl>

                    <ResolveForm
                      disputeId={dispute.id}
                      amount={formatPaise(Number(booking?.total ?? 0))}
                    />
                  </CardBody>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {closed.length > 0 ? (
        <Card>
          <CardHeader title="Resolved" description={`${closed.length} closed`} />
          <ul className="divide-y divide-slate-100">
            {closed.map((dispute) => (
              <li key={dispute.id} className="px-5 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-slate-900">
                    {dispute.bookings?.listings?.title ?? 'Booking'}
                  </span>
                  <Badge tone={dispute.status === 'resolved_refund' ? 'warning' : 'neutral'}>
                    {dispute.status === 'resolved_refund' ? 'Refunded' : 'No refund'}
                  </Badge>
                </div>
                {dispute.resolution_note ? (
                  <p className="mt-1 text-sm text-slate-600">{dispute.resolution_note}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
