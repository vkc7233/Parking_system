'use server';

/**
 * Recording a Host Listing Agreement signature (spec §7.2, assumption A6).
 *
 * What is stored is deliberately more than "they clicked yes": the typed name, the server
 * timestamp, the client IP and user agent, the agreement version, and the SHA-256 of the exact
 * text that was rendered. The hash is the part that matters in a dispute — it proves which
 * wording was agreed to, after the wording has since changed.
 *
 * The evidence table has no update or delete policy. A signature is written once.
 */
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireHost } from '@/lib/auth';
import { getHostAgreement } from '@/lib/agreement';
import { createClient } from '@/lib/supabase/server';

export interface SignState {
  error?: string;
  success?: boolean;
}

const schema = z.object({
  listingId: z.string().uuid(),
  signedName: z
    .string()
    .trim()
    .min(3, 'Type your full legal name')
    .max(120, 'That name is too long'),
  accepted: z.literal('on', { message: 'Tick the box to confirm you agree' }),
  // Guards against signing a version other than the one on screen - if the agreement changed
  // while the page was open, the signature would attest to text the Host never saw.
  version: z.string().min(1),
});

export async function signAgreement(_prev: SignState, formData: FormData): Promise<SignState> {
  const profile = await requireHost('/host');

  const parsed = schema.safeParse({
    listingId: formData.get('listingId'),
    signedName: formData.get('signedName') ?? '',
    accepted: formData.get('accepted') ?? '',
    version: formData.get('version') ?? '',
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' };
  }

  const agreement = await getHostAgreement();

  if (parsed.data.version !== agreement.version) {
    return {
      error: 'The agreement has been updated since you opened this page. Reload and read it again.',
    };
  }

  const requestHeaders = await headers();
  // Behind Vercel the client address is in x-forwarded-for; the first entry is the client.
  const forwardedFor = requestHeaders.get('x-forwarded-for');
  const ipAddress = forwardedFor?.split(',')[0]?.trim() || requestHeaders.get('x-real-ip') || null;

  const supabase = await createClient();

  const { error } = await supabase.from('listing_agreements').insert({
    listing_id: parsed.data.listingId,
    host_id: profile.id,
    agreement_version: agreement.version,
    agreement_hash: agreement.hash,
    signed_name: parsed.data.signedName,
    ip_address: ipAddress,
    user_agent: requestHeaders.get('user-agent'),
  });

  if (error) {
    // The unique index on (listing_id, agreement_version) makes a second signature a no-op
    // rather than an error the Host has to understand.
    if (error.code === '23505') {
      return { success: true };
    }
    return { error: `Could not record your signature: ${error.message}` };
  }

  revalidatePath(`/host/listings/${parsed.data.listingId}/edit`);
  revalidatePath('/host');

  return { success: true };
}
