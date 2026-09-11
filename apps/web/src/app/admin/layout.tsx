import Link from 'next/link';
import { Badge } from '@parking/ui';
import { requireAdmin } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/service';
import { NavTabs, type NavTab } from '@/components/nav-tabs';

export const metadata = { title: 'Admin' };

/** Rows waiting on an admin, counted without fetching them. */
async function pendingCount(table: string, column: string, value: string): Promise<number> {
  const service = createServiceClient();
  const { count } = await service
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq(column, value);

  return count ?? 0;
}

/**
 * Payouts whose transfer failed and which nobody has resolved yet.
 *
 * Counted here rather than only on the payouts page because this money is invisible everywhere
 * else - a failed payout keeps its bookings attached, so the amount is not in the queue and not
 * on the host's earnings screen. Without a badge, the only way to discover it is to go looking.
 */
async function unresolvedFailedPayouts(): Promise<number> {
  const service = createServiceClient();
  const { count } = await service
    .from('payouts')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'failed')
    .is('voided_at', null);

  return count ?? 0;
}

/**
 * Admin shell (spec §8.3, §8.4).
 *
 * §8.4 keeps /admin off the main navigation entirely — it is reached by typing the URL. The
 * darker chrome is deliberate: it should never be possible to glance at a screen and wonder
 * whether you are looking at the seeker app or the operations panel.
 *
 * The counts on the tabs are the point of the panel. §6.3 has an Admin working these queues
 * daily, and a queue you have to open to discover is empty is a queue that gets checked late.
 * They are `head: true` counts, so this costs three cheap queries rather than three page loads.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();

  const [listings, documents, disputes, failedPayouts] = await Promise.all([
    pendingCount('listings', 'status', 'pending'),
    pendingCount('documents', 'verified_status', 'pending'),
    pendingCount('disputes', 'status', 'open'),
    unresolvedFailedPayouts(),
  ]);

  const tabs: NavTab[] = [
    { href: '/admin', label: 'Dashboard' },
    { href: '/admin/listings', label: 'Listings', ...(listings ? { badge: listings } : {}) },
    { href: '/admin/documents', label: 'Documents', ...(documents ? { badge: documents } : {}) },
    { href: '/admin/bookings', label: 'Bookings' },
    {
      href: '/admin/payouts',
      label: 'Payouts',
      ...(failedPayouts ? { badge: failedPayouts } : {}),
    },
    { href: '/admin/disputes', label: 'Disputes', ...(disputes ? { badge: disputes } : {}) },
    { href: '/admin/users', label: 'Users' },
    { href: '/admin/reports', label: 'Reports' },
  ];

  return (
    <div className="min-h-dvh bg-slate-100">
      <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-900">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 sm:px-6 lg:px-8 py-3">
          <Link
            href="/admin"
            className="flex items-center gap-2 text-sm font-semibold tracking-tight text-white"
          >
            Parking<span className="font-normal text-slate-400">Marketplace</span>
          </Link>
          <Badge tone="warning">Admin</Badge>

          <div className="ml-auto flex min-w-0 items-center gap-2">
            <NavTabs tabs={tabs} tone="dark" />
            <Link
              href="/"
              className="shrink-0 rounded-lg px-3 py-1.5 text-sm text-slate-400 transition-colors hover:text-white"
            >
              Exit
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-8">{children}</main>
    </div>
  );
}
