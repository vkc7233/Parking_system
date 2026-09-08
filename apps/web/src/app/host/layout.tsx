import Link from 'next/link';
import { Badge } from '@parking/ui';
import { getOnboardingState, requireHost } from '@/lib/auth';

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

  return (
    <div className="min-h-dvh bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/" className="text-sm font-semibold text-slate-900">
            Parking Marketplace
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            <Link href="/host" className="rounded-md px-3 py-1.5 text-slate-700 hover:bg-slate-100">
              My listings
            </Link>
            <Link
              href="/host/verify"
              className="rounded-md px-3 py-1.5 text-slate-700 hover:bg-slate-100"
            >
              Check a pass
            </Link>
            <Link
              href="/host/onboarding"
              className="rounded-md px-3 py-1.5 text-slate-700 hover:bg-slate-100"
            >
              Onboarding
            </Link>
          </nav>
        </div>
      </header>

      {!onboarding.complete ? (
        <div className="border-b border-amber-200 bg-amber-50">
          <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm text-amber-900">
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

      <main className="mx-auto max-w-4xl px-4 py-8">{children}</main>
    </div>
  );
}
