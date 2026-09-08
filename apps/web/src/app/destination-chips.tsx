import Link from 'next/link';
import { PILOT_DESTINATIONS } from '@parking/config';

/**
 * One-tap Pune destinations (spec §8.1).
 *
 * A seeker who opens the app already knows where they are going, but not the name the geocoder
 * wants for it. These are the micro-markets §16 says the pilot is chosen for, so the common
 * case is one tap rather than typing — and because each is a plain link with the coordinates in
 * the URL, they are also eight crawlable landing pages for exactly the searches people run
 * ("parking in Koregaon Park"), which §7.4 asks for.
 */
export function DestinationChips({ activeSlug }: { activeSlug: string | null }) {
  return (
    <nav aria-label="Popular areas" className="flex flex-wrap gap-2">
      {PILOT_DESTINATIONS.map((destination) => {
        const active = destination.slug === activeSlug;

        return (
          <Link
            key={destination.slug}
            href={`/?place=${destination.slug}`}
            aria-current={active ? 'page' : undefined}
            className={
              'group rounded-full border px-3 py-1.5 text-sm transition ' +
              (active
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50')
            }
          >
            <span className="font-medium">{destination.name}</span>
            <span
              className={
                'ml-1.5 text-xs ' + (active ? 'text-slate-300' : 'text-slate-500')
              }
            >
              {destination.blurb}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
