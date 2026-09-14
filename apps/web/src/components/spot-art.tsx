import type { SpotType } from '@parking/types';

/**
 * A drawn stand-in for a listing with no usable photo.
 *
 * A grid of identical grey "No image" boxes reads as a broken page rather than a new
 * marketplace, and early Pune listings will often have no photo for days — a host uploads one
 * when they get round to it, and a `listing_photos` row can outlive the object it points at.
 * The stand-in shows the one thing a seeker can still use: what kind of space this is. It is
 * drawn rather than fetched, so it costs no request and cannot itself fail to load.
 */

const SPOT_ART: Record<SpotType, { label: string; art: 'roof' | 'sky' | 'underground' | 'gate' }> =
  {
    covered: { label: 'Covered', art: 'roof' },
    open: { label: 'Open air', art: 'sky' },
    basement: { label: 'Basement', art: 'underground' },
    stilt: { label: 'Stilt', art: 'roof' },
    garage: { label: 'Garage', art: 'gate' },
    driveway: { label: 'Driveway', art: 'gate' },
  };

export function SpotArt({ spotType }: { spotType: SpotType }) {
  const { label, art } = SPOT_ART[spotType] ?? SPOT_ART.open;

  return (
    <div
      className="flex h-full w-full items-center justify-center bg-linear-135 from-brand-50 via-slate-50 to-brand-100/70"
      role="img"
      aria-label={`No photo yet — ${label.toLowerCase()} space`}
    >
      <svg viewBox="0 0 96 72" className="h-24 w-32 text-brand-300" aria-hidden="true">
        {art === 'underground' ? (
          <path
            d="M8 22h80M18 22v30M78 22v30M32 52h32M36 42h24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        ) : art === 'gate' ? (
          <path
            d="M14 52V26l34-16 34 16v26M30 52V36h36v16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
        ) : art === 'roof' ? (
          <path
            d="M10 26 48 8l38 18M18 26v26M78 26v26M34 52V40h28v12"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          <path
            d="M12 50h72M24 50V36h48v14M32 36l5-12h22l5 12M32 44h6M58 44h6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        <text x="48" y="68" textAnchor="middle" fontSize="9" fill="currentColor">
          {label}
        </text>
      </svg>
    </div>
  );
}
