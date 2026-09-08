import type { LatLng } from '@parking/types';

/**
 * A link that opens the seeker's own maps app at the space.
 *
 * The coordinates were previously printed raw on the listing page, which is developer output
 * dressed as information: nobody types a decimal degree into anything. What a seeker needs is
 * the last two hundred metres — a gated society off a lane is exactly the kind of address a
 * driver cannot find from the street name alone.
 *
 * A plain link rather than an embed: it costs no API key and no billed call, and it hands the
 * navigation to whichever app the phone already trusts.
 */
export function DirectionsLink({
  location,
  label,
  className,
}: {
  location: LatLng;
  /** Shown as the destination name in the maps app. */
  label: string;
  className?: string;
}) {
  // Coordinates rather than the address string: the spaces on this platform are unmarked bays
  // inside gated societies and behind shop fronts, which address search routes to the wrong side
  // of the block often enough to matter.
  const href =
    'https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=' +
    encodeURIComponent(`${location.lat},${location.lng}`);

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={
        className ??
        'inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700 hover:underline'
      }
    >
      <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" aria-hidden="true">
        <path
          d="M8 14.5s5-4.6 5-8a5 5 0 0 0-10 0c0 3.4 5 8 5 8Z"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
        <circle cx="8" cy="6.4" r="1.7" stroke="currentColor" strokeWidth="1.4" />
      </svg>
      Directions to {label}
    </a>
  );
}
