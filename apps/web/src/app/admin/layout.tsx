import Link from 'next/link';
import { Badge } from '@parking/ui';
import { requireAdmin } from '@/lib/auth';

export const metadata = { title: 'Admin' };

/**
 * Admin shell (spec §8.3, §8.4).
 *
 * §8.4 keeps /admin off the main navigation entirely — it is reached by typing the URL. The
 * darker chrome is deliberate: it should never be possible to glance at a screen and wonder
 * whether you are looking at the seeker app or the operations panel.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();

  const tabs = [
    { href: '/admin', label: 'Dashboard' },
    { href: '/admin/listings', label: 'Listings' },
    { href: '/admin/documents', label: 'Documents' },
    { href: '/admin/users', label: 'Users' },
  ];

  return (
    <div className="min-h-dvh bg-slate-100">
      <header className="bg-slate-900">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <Link href="/admin" className="text-sm font-semibold text-white">
            Parking Marketplace
          </Link>
          <Badge tone="warning">Admin</Badge>

          <nav className="ml-auto flex flex-wrap items-center gap-1 text-sm">
            {tabs.map((tab) => (
              <Link
                key={tab.href}
                href={tab.href}
                className="rounded-md px-3 py-1.5 text-slate-300 transition hover:bg-slate-800 hover:text-white"
              >
                {tab.label}
              </Link>
            ))}
            <Link href="/" className="ml-2 rounded-md px-3 py-1.5 text-slate-400 hover:text-white">
              Exit
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
