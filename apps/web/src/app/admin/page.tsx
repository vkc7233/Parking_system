import Link from 'next/link';
import { Card, CardBody, Money } from '@parking/ui';
import { requireAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Admin dashboard' };

/**
 * Operational dashboard (spec §7.3).
 *
 * §7.3's acceptance criterion is that the figures match the underlying database counts at page
 * load, so every number here is a live count rather than anything cached or precomputed.
 *
 * GMV is the sum of completed bookings — value actually transacted, not value booked — which is
 * the definition in the glossary (§17).
 */
export default async function AdminDashboardPage() {
  await requireAdmin();
  const supabase = await createClient();

  const [users, hosts, liveListings, pendingListings, pendingDocs, bookings, completed] =
    await Promise.all([
      supabase.from('users').select('id', { count: 'exact', head: true }),
      supabase.from('users').select('id', { count: 'exact', head: true }).eq('role', 'host'),
      supabase.from('listings').select('id', { count: 'exact', head: true }).eq('status', 'live'),
      supabase
        .from('listings')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending'),
      supabase
        .from('documents')
        .select('id', { count: 'exact', head: true })
        .eq('verified_status', 'pending'),
      supabase.from('bookings').select('id', { count: 'exact', head: true }),
      supabase.from('bookings').select('total').eq('status', 'completed'),
    ]);

  const gmv = (completed.data ?? []).reduce((sum, b) => sum + Number(b.total), 0);

  const stats = [
    { label: 'Users', value: String(users.count ?? 0), href: '/admin/users' },
    { label: 'Hosts', value: String(hosts.count ?? 0), href: '/admin/users' },
    { label: 'Live listings', value: String(liveListings.count ?? 0), href: null },
    { label: 'Bookings', value: String(bookings.count ?? 0), href: null },
  ];

  const queues = [
    {
      label: 'Listings awaiting approval',
      count: pendingListings.count ?? 0,
      href: '/admin/listings',
      hint: 'Nothing reaches seeker search without passing through this queue.',
    },
    {
      label: 'Documents awaiting review',
      count: pendingDocs.count ?? 0,
      href: '/admin/documents',
      hint: 'A host cannot submit a listing until all three are on file.',
    },
  ];

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Dashboard</h1>
        <p className="mt-1 text-slate-600">Live counts, straight from the database.</p>
      </header>

      <section>
        <h2 className="sr-only">Marketplace totals</h2>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-xl border border-slate-200 bg-white p-4">
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {stat.label}
              </dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>

        <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4">
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Gross merchandise value
          </dt>
          <dd className="mt-1 text-2xl font-semibold text-slate-900">
            <Money paise={gmv} showDecimals={false} />
          </dd>
          <p className="mt-1 text-xs text-slate-500">
            Total value of completed bookings, before fees.
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-slate-900">Needs attention</h2>
        {queues.map((queue) => (
          <Card key={queue.href}>
            <CardBody>
              <Link href={queue.href} className="flex items-center justify-between gap-4">
                <span>
                  <span className="block text-sm font-medium text-slate-900">{queue.label}</span>
                  <span className="mt-0.5 block text-sm text-slate-600">{queue.hint}</span>
                </span>
                <span
                  className={
                    queue.count > 0
                      ? 'shrink-0 rounded-full bg-amber-100 px-3 py-1 text-lg font-semibold tabular-nums text-amber-900'
                      : 'shrink-0 rounded-full bg-slate-100 px-3 py-1 text-lg font-semibold tabular-nums text-slate-500'
                  }
                >
                  {queue.count}
                </span>
              </Link>
            </CardBody>
          </Card>
        ))}
      </section>

      <p className="text-xs text-slate-500">
        Bookings, disputes and payouts arrive with Sprints 4 to 6 — see docs/ROADMAP-STATUS.md.
      </p>
    </div>
  );
}
