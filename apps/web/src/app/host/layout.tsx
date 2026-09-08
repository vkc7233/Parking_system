import Link from 'next/link';
import { Badge } from '@parking/ui';
import { getOnboardingState, requireHost } from '@/lib/auth';
import { NavTabs, type NavTab } from '@/components/nav-tabs';

/**
 * Host shell (spec §8.2, §8.4).
 *
 * The onboarding banner is the important part: §7.2 requires that onboarding "cannot be skipped
 * before a first listing can be submitted for approval", and the database enforces exactly that.
 * Without a standing reminder here, a Host would only discover the rule at the moment their
 * submit button fails, which is the worst possible time to learn it.
 */
export default async function HostLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireHost('/host');
  const onboarding = await getOnboardingState(profile.id);

  const tabs: NavTab[] = [
    { href: '/host', label: 'My listings' },
    { href: '/host/calendar', label: 'Calendar' },
    { href: '/host/earnings', label: 'Earnings' },
    { href: '/host/verify', label: 'Check a pass' },
    { href: '/host/onboarding', label: 'Onboarding' },
  ];

  return (
    <div className="min-h-dvh bg-slate-50">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/" className="shrink-0 text-sm font-semibold tracking-tight text-slate-900">
            Parking<span className="text-slate-400">Marketplace</span>
          </Link>
          <NavTabs tabs={tabs} tone="light" />
        </div>
      </header>

      {!onboarding.complete ? (
        <div className="border-b border-accent-400/40 bg-accent-50">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm text-accent-900">
            <Badge tone="warning">Action needed</Badge>
            <span>
              Upload your identity, address and bank details before you can submit a listing.
            </span>
            <Link href="/host/onboarding" className="font-medium underline underline-offset-4">
              Complete onboarding
            </Link>
          </div>
        </div>
      ) : null}

      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
