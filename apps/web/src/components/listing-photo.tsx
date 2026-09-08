import type { SpotType } from '@parking/types';
import { ListingThumbnail } from '@/app/host/listing-thumbnail';
import { SpotArt } from '@/components/spot-art';

/**
 * A listing's photo on a seeker-facing screen, drawn as its spot type when there is none.
 *
 * Both cases route through the same art: no photo row at all, and a photo row whose object no
 * longer loads. To a seeker those are the same situation, so they should look the same.
 */
export function ListingPhoto({
  src,
  alt,
  spotType,
  sizes,
}: {
  src: string | null;
  alt: string;
  spotType: SpotType;
  sizes: string;
}) {
  if (!src) return <SpotArt spotType={spotType} />;

  return (
    <ListingThumbnail
      src={src}
      alt={alt}
      sizes={sizes}
      className="object-cover"
      fallback={<SpotArt spotType={spotType} />}
    />
  );
}
