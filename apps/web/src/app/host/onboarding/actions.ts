'use server';

/**
 * KYC-lite onboarding (spec §4.2, §7.2).
 *
 * Live e-KYC is deferred, so identity is verified by manual Admin review of uploaded documents.
 * Two things matter here:
 *
 *  - The file goes to a PRIVATE Storage bucket. These are identity and bank documents and fall
 *    under the DPDP Act handling requirement (spec §12); nothing about them is ever public.
 *  - Uploads are namespaced `<user_id>/...` because that first path segment is what the Storage
 *    RLS policy checks. A path built any other way would let one user write into another's
 *    folder.
 */
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { DocumentType } from '@parking/types';
import { requireHost } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export interface UploadState {
  error?: string;
  success?: string;
}

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPTED = ['image/jpeg', 'image/png', 'application/pdf'];

const DOCUMENT_LABELS: Record<DocumentType, string> = {
  identity_proof: 'Identity proof',
  address_proof: 'Address proof',
  bank_details: 'Bank details',
};

const schema = z.object({
  type: z.enum(['identity_proof', 'address_proof', 'bank_details']),
});

export async function uploadDocument(_prev: UploadState, formData: FormData): Promise<UploadState> {
  const profile = await requireHost('/host/onboarding');

  const parsed = schema.safeParse({ type: formData.get('type') });
  if (!parsed.success) {
    return { error: 'Unknown document type.' };
  }
  const { type } = parsed.data;

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Choose a file to upload.' };
  }
  if (file.size > MAX_BYTES) {
    return { error: `That file is larger than ${MAX_BYTES / (1024 * 1024)}MB.` };
  }
  if (!ACCEPTED.includes(file.type)) {
    return { error: 'Upload a JPG, PNG or PDF.' };
  }

  const supabase = await createClient();

  // The first path segment must be the user's id - the Storage RLS policy checks it.
  const extension = file.name.split('.').pop()?.toLowerCase() ?? 'bin';
  const path = `${profile.id}/${type}-${Date.now()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from('kyc-documents')
    .upload(path, file, { contentType: file.type, upsert: false });

  if (uploadError) {
    return { error: `Upload failed: ${uploadError.message}` };
  }

  // A resubmission replaces the previous attempt rather than leaving an Admin to guess which of
  // several uploads is current. The partial unique index allows exactly one non-rejected row per
  // type, so the old one is removed first.
  const { data: existing } = await supabase
    .from('documents')
    .select('id, file_path')
    .eq('user_id', profile.id)
    .eq('type', type)
    .neq('verified_status', 'rejected');

  if (existing?.length) {
    await supabase
      .from('documents')
      .delete()
      .in(
        'id',
        existing.map((d) => d.id),
      );

    // Best effort: an orphaned object costs storage but never blocks the user.
    await supabase.storage.from('kyc-documents').remove(existing.map((d) => d.file_path));
  }

  const { error: insertError } = await supabase.from('documents').insert({
    user_id: profile.id,
    type,
    file_path: path,
    verified_status: 'pending',
  });

  if (insertError) {
    await supabase.storage.from('kyc-documents').remove([path]);
    return { error: `Could not save that document: ${insertError.message}` };
  }

  revalidatePath('/host', 'layout');

  return { success: `${DOCUMENT_LABELS[type]} uploaded. An admin will review it shortly.` };
}

/**
 * A short-lived signed URL so a Host can check what they uploaded.
 *
 * The bucket is private, so there is no public URL to link to - and there should not be one.
 */
export async function getDocumentUrl(path: string): Promise<string | null> {
  const profile = await requireHost('/host/onboarding');

  // Defence in depth: Storage RLS would refuse anyway, but refusing here means a mistyped path
  // cannot even become a request.
  if (!path.startsWith(`${profile.id}/`)) return null;

  const supabase = await createClient();
  const { data } = await supabase.storage.from('kyc-documents').createSignedUrl(path, 60);

  return data?.signedUrl ?? null;
}
