'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface NavTab {
  href: string;
  label: string;
  /** Rendered after the label — a count of things waiting, in the admin panel. */
  badge?: number;
}

/**
 * Navigation for the Host and Admin shells, with the current section marked.
 *
 * Neither shell showed which section you were in, which matters most in the Admin panel: six
 * queues that look alike, reached by clicking between them all day. `aria-current="page"` does
 * the same job for a screen reader that the underline does for everyone else.
 *
 * Matching is exact for the section root and prefix-based below it, so `/admin/listings/abc`
 * still marks Listings — otherwise the indicator vanishes the moment you open a record.
 */
export function NavTabs({ tabs, tone }: { tabs: NavTab[]; tone: 'light' | 'dark' }) {
  const pathname = usePathname();

  // Longest match wins, so `/host/listings` does not also light up `/host`.
  const activeHref = tabs
    .filter((tab) => pathname === tab.href || pathname.startsWith(tab.href + '/'))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <nav className="no-scrollbar -mx-1 flex items-center gap-0.5 overflow-x-auto px-1 text-sm">
      {tabs.map((tab) => {
        const active = tab.href === activeHref;

        const classes =
          tone === 'dark'
            ? active
              ? 'bg-white/10 text-white'
              : 'text-slate-300 hover:bg-white/5 hover:text-white'
            : active
              ? 'bg-brand-50 text-brand-700'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900';

        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={
              'flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium whitespace-nowrap transition-colors ' +
              classes
            }
          >
            {tab.label}
            {tab.badge ? (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-500 px-1.5 text-xs font-semibold text-accent-900">
                {tab.badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
