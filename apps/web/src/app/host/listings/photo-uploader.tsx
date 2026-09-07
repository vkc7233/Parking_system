'use client';

import { useRef, useState, useTransition } from 'react';
import { PLATFORM } from '@parking/config';
import { Badge, Button, FormError } from '@parking/ui';
import { createClient } from '@/lib/supabase/client';
import { ListingThumbnail } from '../listing-thumbnail';
import { recordListingPhoto, removeListingPhoto } from './actions';

/**
 * Listing photos (spec §7.2 — a listing cannot be submitted with fewer than two).
 *
 * The file goes straight from the browser to Supabase Storage rather than through a server
 * action, because a server action body is capped at 1MB and photos are allowed up to 5MB.
 * That is safe: Storage RLS only accepts writes under the Host's own `<host_id>/` prefix, so
 * the browser cannot place a file anywhere it should not. The server action afterwards records
 * the row and re-checks the path.
 */

export interface ExistingPhoto {
  id: string;
  storagePath: string;
  url: string;
  altText: string | null;
}

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];

export function PhotoUploader({
  listingId,
  hostId,
  photos,
  listingTitle,
}: {
  listingId: string;
  hostId: string;
  photos: ExistingPhoto[];
  listingTitle: string;
}) {
  const [error, setError] = useState<string | undefined>();
  const [uploading, setUploading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const atLimit = photos.length >= PLATFORM.maxListingPhotos;
  const belowMinimum = photos.length < PLATFORM.minListingPhotos;

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(undefined);

    const remaining = PLATFORM.maxListingPhotos - photos.length;
    const chosen = Array.from(files).slice(0, remaining);

    setUploading(true);
    const supabase = createClient();

    for (const file of chosen) {
      if (!ACCEPTED.includes(file.type)) {
        setError('Photos must be JPG, PNG or WebP.');
        continue;
      }
      if (file.size > MAX_BYTES) {
        setError(`"${file.name}" is larger than ${MAX_BYTES / (1024 * 1024)}MB.`);
        continue;
      }

      // The first segment must be the host id - Storage RLS checks exactly that.
      const extension = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
      const path = `${hostId}/${listingId}/${crypto.randomUUID()}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from('listing-photos')
        .upload(path, file, { contentType: file.type, upsert: false });

      if (uploadError) {
        setError(`Upload failed: ${uploadError.message}`);
        continue;
      }

      const result = await recordListingPhoto(listingId, path, `${listingTitle} — parking space`);
      if (result.error) setError(result.error);
    }

    setUploading(false);
    if (inputRef.current) inputRef.current.value = '';
  }

  function remove(photoId: string) {
    startTransition(async () => {
      const result = await removeListingPhoto(listingId, photoId);
      setError(result.error);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={belowMinimum ? 'warning' : 'success'}>
          {photos.length} of {PLATFORM.maxListingPhotos}
        </Badge>
        <p className="text-sm text-slate-600">
          {belowMinimum
            ? `At least ${PLATFORM.minListingPhotos} photos are needed before you can submit.`
            : 'The first photo is the one seekers see in search results.'}
        </p>
      </div>

      {photos.length > 0 ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((photo, index) => (
            <li
              key={photo.id}
              className="group relative overflow-hidden rounded-lg border border-slate-200"
            >
              <div className="relative aspect-4/3 bg-slate-100">
                <ListingThumbnail
                  src={photo.url}
                  alt={photo.altText ?? `${listingTitle} photo ${index + 1}`}
                  sizes="(max-width: 640px) 50vw, 200px"
                  className="object-cover"
                />
              </div>

              {index === 0 ? (
                <span className="absolute left-2 top-2 rounded bg-slate-900/80 px-1.5 py-0.5 text-[11px] font-medium text-white">
                  Cover
                </span>
              ) : null}

              <button
                type="button"
                onClick={() => remove(photo.id)}
                disabled={isPending}
                className="absolute right-2 top-2 rounded bg-white/90 px-2 py-1 text-xs font-medium text-red-700 shadow-sm hover:bg-white disabled:opacity-50"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {error ? <FormError>{error}</FormError> : null}

      <div>
        <input
          ref={inputRef}
          id="listing-photos"
          type="file"
          accept={ACCEPTED.join(',')}
          multiple
          disabled={atLimit || uploading}
          onChange={(e) => void handleFiles(e.target.files)}
          className="sr-only"
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={atLimit || uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? 'Uploading...' : atLimit ? 'Maximum reached' : 'Add photos'}
        </Button>
        <p className="mt-1.5 text-xs text-slate-500">
          JPG, PNG or WebP, up to 5MB each. Clear daylight photos of the actual space get booked
          more.
        </p>
      </div>
    </div>
  );
}
