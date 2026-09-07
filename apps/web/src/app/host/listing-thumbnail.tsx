'use client';

import Image from 'next/image';
import { useState } from 'react';

/**
 * A listing photo that degrades to a placeholder instead of a broken-image icon.
 *
 * A `listing_photos` row can outlive the object it points at — a failed upload, a Storage
 * object removed out of band, or (in local development) seed rows that reference paths nothing
 * ever uploaded. The row is still the source of truth for how many photos a listing has, so the
 * fix belongs at the render edge rather than by deleting rows.
 */
export function ListingThumbnail({
  src,
  alt,
  sizes,
  className,
}: {
  src: string;
  alt: string;
  sizes: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-slate-100 text-[11px] text-slate-400">
        No image
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      className={className}
      // Supabase Storage serves these already sized; the optimizer would only add a hop.
      unoptimized
      onError={() => setFailed(true)}
    />
  );
}
