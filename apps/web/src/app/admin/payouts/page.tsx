import { PAYOUT } from '@parking/config';
import { formatPaise } from '@parking/core';
import { Badge, Card, CardBody, CardHeader, EmptyState, Money } from '@parking/ui';
import { requireAdmin } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/service';
import { PayoutButton } from './payout-button';

export const metadata = { title: 'Payouts' };

interface HostRow {
  id: string;
  name: string | null;
  phone: string;
  kyc_status: string;
}

interface Owed {
  host: HostRow;
  total: number;
  count: number;
  oldest: Date | null;
  due: boolean;
  reason: string;
}

/**
 * Payout run (spec §6.3 step 3, §7.3).
 *
 * The amounts come from `unpaid_host_earnings`, which already applies the dispute hold (A11), so
 * this page cannot accidentally offer money that is still contested. What it adds is the
 * judgement §6.3 asks an Admin to make before triggering: who is owed what, how old it is, and
 * whether their KYC actually cleared.
 *
 * Read with the service role because it aggregates across every host, which no client-scoped
 * query is allowed to do.
 */
export default async function AdminPayoutsPage() {
  await requireAdmin();
  const service = createServiceClient();

  const { data: hostRows } = await service
    .from('users')
    .select('id, name, phone, kyc_status')
    .in('role', ['host', 'admin'])
    .order('name');

  const hosts = (hostRows ?? []) as HostRow[];

  const owed: Owed[] = [];

  for (const host of hosts) {
    const { data } = await service.rpc('unpaid_host_earnings', {
      p_host_id: host.id,
      p_period_start: '-infinity',
      p_period_end: 'infinity',
    });

    const lines = (data ?? []) as { completed_at: string; amount: number }[];
    if (lines.length === 0) continue;

    const total = lines.reduce((sum, l) => sum + Number(l.amount), 0);
    const oldest = lines.reduce(
      (min, l) => (new Date(l.completed_at) < min ? new Date(l.completed_at) : min),
      new Date(lines[0]!.completed_at),
    );
    const ageDays = (Date.now() - oldest.getTime()) / 86_400_000;
    const forced = ageDays > PAYOUT.forceOutAfterDays;
    const due = total >= PAYOUT.minimumPayout || forced;

    owed.push({
      host,
      total,
      count: lines.length,
      oldest,
      due,
      reason: due
        ? forced
          ? `Older than ${PAYOUT.forceOutAfterDays} days — paid regardless of the minimum.`
          : 'Above the minimum.'
        : `Below the ${formatPaise(PAYOUT.minimumPayout)} minimum — carries forward.`,
    });
  }

  owed.sort((a, b) => b.total - a.total);
  const dueNow = owed.filter((o) => o.due);

  const { data: recentRows } = await service
    .from('payouts')
    .select(
      'id, amount, status, processed_at, provider_payout_id, users!payouts_host_id_fkey(name)',
    )
    .order('created_at', { ascending: false })
    .limit(10);

  const recent = (recentRows ?? []) as unknown as {
    id: string;
    amount: number;
    status: string;
    processed_at: string | null;
    provider_payout_id: string | null;
    users: { name: string | null } | null;
  }[];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Payouts</h1>
        <p className="mt-1 text-slate-600">
          {dueNow.length === 0
            ? 'Nothing is due right now.'
            : `${dueNow.length} host${dueNow.length === 1 ? '' : 's'} due, ` +
              `${formatPaise(dueNow.reduce((s, o) => s + o.total, 0))} in total.`}
        </p>
      </header>

      <Card>
        <CardHeader
          title="Owed to hosts"
          description={`Earnings clear ${PAYOUT.publishedCycle}; runs happen twice a week. Money inside the dispute window is not listed.`}
        />

        {owed.length === 0 ? (
          <EmptyState
            title="Nothing owed"
            description="Completed bookings appear here once their dispute window has closed."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {owed.map((entry) => (
              <li key={entry.host.id} className="px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-slate-900">
                        {entry.host.name ?? 'Unnamed host'}
                      </span>
                      <Badge tone={entry.host.kyc_status === 'verified' ? 'success' : 'warning'}>
                        KYC {entry.host.kyc_status}
                      </Badge>
                      {entry.due ? null : <Badge tone="neutral">Carrying forward</Badge>}
                    </div>

                    <p className="mt-0.5 text-sm text-slate-600">
                      {entry.count} booking{entry.count === 1 ? '' : 's'}
                      {entry.oldest
                        ? ` · oldest ${entry.oldest.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
                        : ''}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">{entry.reason}</p>

                    {entry.host.kyc_status !== 'verified' ? (
                      <p className="mt-1 text-xs text-amber-800">
                        Their documents have not been verified — check before sending money.
                      </p>
                    ) : null}
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <span className="text-lg font-semibold tabular-nums text-slate-900">
                      <Money paise={entry.total} />
                    </span>
                    <PayoutButton
                      hostId={entry.host.id}
                      hostName={entry.host.name ?? 'this host'}
                      amount={formatPaise(entry.total)}
                      disabled={!entry.due}
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="Recent payouts" />
        {recent.length === 0 ? (
          <CardBody>
            <p className="text-sm text-slate-600">No payouts have been made yet.</p>
          </CardBody>
        ) : (
          <ul className="divide-y divide-slate-100">
            {recent.map((payout) => (
              <li
                key={payout.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    {payout.users?.name ?? 'Unknown host'}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {payout.processed_at
                      ? new Date(payout.processed_at).toLocaleString('en-IN')
                      : 'Not sent'}
                    {payout.provider_payout_id ? ` · ${payout.provider_payout_id}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge
                    tone={
                      payout.status === 'paid'
                        ? 'success'
                        : payout.status === 'failed'
                          ? 'danger'
                          : 'warning'
                    }
                  >
                    {payout.status}
                  </Badge>
                  <span className="text-sm font-medium tabular-nums text-slate-900">
                    <Money paise={Number(payout.amount)} />
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
