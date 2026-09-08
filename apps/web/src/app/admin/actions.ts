'use server';

/**
 * Admin operations (spec §7.3).
 *
 * Every function here re-checks the caller is an admin before touching anything. That check is
 * not the security boundary — the RLS policies are, and they gate on `public.is_admin()` at the
 * database — but it is what turns "the query returned nothing" into a clear refusal, and it is
 * what makes the audit entry attributable.
 *
 * Every state change writes to `admin_audit_log`. Approvals, rejections, suspensions and
 * payouts all move money or livelihoods, so each one records who did it.
 */
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { track } from '@/lib/analytics';

export interface AdminActionState {
  error?: string;
  success?: string;
}

/**
 * The audit log has no client insert policy by design, so an admin cannot author their own
 * trail. Writing it needs the service role.
 */
async function audit(
  adminId: string,
  action: string,
  entityType: string,
  entityId: string,
  details: Record<string, unknown> = {},
) {
  await createServiceClient().from('admin_audit_log').insert({
    admin_id: adminId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    details,
  });
}

const approveSchema = z.object({ listingId: z.string().uuid() });

const rejectSchema = z.object({
  listingId: z.string().uuid(),
  reason: z
    .string()
    .trim()
    .min(10, 'Give the host a reason they can act on — at least 10 characters')
    .max(1000),
});

/** Spec §7.3: a listing cannot appear in seeker search until explicitly approved. */
export async function approveListing(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requireAdmin();

  const parsed = approveSchema.safeParse({ listingId: formData.get('listingId') });
  if (!parsed.success) return { error: 'Unknown listing.' };

  const supabase = await createClient();

  const { error } = await supabase
    .from('listings')
    .update({ status: 'live', approved_by: admin.id, rejection_reason: null })
    .eq('id', parsed.data.listingId);

  if (error) {
    // The lifecycle trigger refuses to publish an unsigned listing (spec §7.2). That is the
    // rule working, so it deserves an explanation rather than a generic failure.
    if (error.message.toLowerCase().includes('signed host listing agreement')) {
      return {
        error:
          'This listing has no signed Host Listing Agreement on file, so it cannot go live. ' +
          'Ask the host to sign it first.',
      };
    }
    return { error: `Could not approve: ${error.message}` };
  }

  await audit(admin.id, 'approve_listing', 'listing', parsed.data.listingId);

  await track('listing_approved', {
    distinctId: admin.id,
    properties: { listing_id: parsed.data.listingId },
  });

  revalidatePath('/admin/listings');
  revalidatePath('/admin');
  return { success: 'Listing approved and live.' };
}

export async function rejectListing(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requireAdmin();

  const parsed = rejectSchema.safeParse({
    listingId: formData.get('listingId'),
    reason: formData.get('reason') ?? '',
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form.' };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from('listings')
    .update({ status: 'rejected', rejection_reason: parsed.data.reason, approved_by: null })
    .eq('id', parsed.data.listingId);

  if (error) return { error: `Could not reject: ${error.message}` };

  await audit(admin.id, 'reject_listing', 'listing', parsed.data.listingId, {
    reason: parsed.data.reason,
  });

  revalidatePath('/admin/listings');
  revalidatePath('/admin');
  return { success: 'Listing rejected and the host notified.' };
}

/** Spec §7.3: suspending a host immediately delists all of that host's listings. */
export async function setUserSuspended(
  userId: string,
  suspended: boolean,
  reason?: string,
): Promise<AdminActionState> {
  const admin = await requireAdmin();

  if (userId === admin.id) {
    return { error: 'You cannot suspend your own account.' };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from('users')
    .update({
      suspended_at: suspended ? new Date().toISOString() : null,
      suspended_reason: suspended ? (reason ?? 'Suspended by admin') : null,
    })
    .eq('id', userId);

  if (error) return { error: `Could not update that account: ${error.message}` };

  await audit(admin.id, suspended ? 'suspend_user' : 'unsuspend_user', 'user', userId, {
    reason: reason ?? null,
  });

  revalidatePath('/admin/users');
  return { success: suspended ? 'Account suspended and listings delisted.' : 'Account restored.' };
}

/** KYC-lite review (spec §4.2, §7.2). */
export async function reviewDocument(
  documentId: string,
  verdict: 'verified' | 'rejected',
  rejectionReason?: string,
): Promise<AdminActionState> {
  const admin = await requireAdmin();

  if (verdict === 'rejected' && !rejectionReason?.trim()) {
    return { error: 'A rejection needs a reason the host can act on.' };
  }

  const supabase = await createClient();

  const { data: document, error } = await supabase
    .from('documents')
    .update({
      verified_status: verdict,
      reviewed_by: admin.id,
      reviewed_at: new Date().toISOString(),
      rejection_reason: verdict === 'rejected' ? rejectionReason : null,
    })
    .eq('id', documentId)
    .select('user_id')
    .single();

  if (error) return { error: `Could not record that review: ${error.message}` };

  // kyc_status on the user is a rollup of their documents: verified only once all three are.
  if (document) {
    const { data: docs } = await supabase
      .from('documents')
      .select('verified_status')
      .eq('user_id', document.user_id);

    const statuses = (docs ?? []).map((d) => d.verified_status);
    const kycStatus = statuses.includes('rejected')
      ? 'rejected'
      : statuses.length >= 3 && statuses.every((s) => s === 'verified')
        ? 'verified'
        : 'pending';

    await supabase.from('users').update({ kyc_status: kycStatus }).eq('id', document.user_id);
  }

  await audit(admin.id, `document_${verdict}`, 'document', documentId, {
    reason: rejectionReason ?? null,
  });

  revalidatePath('/admin/documents');
  revalidatePath('/admin');
  return { success: verdict === 'verified' ? 'Document verified.' : 'Document rejected.' };
}

/** A short-lived signed URL so an admin can view a private KYC document. */
export async function getAdminDocumentUrl(path: string): Promise<string | null> {
  await requireAdmin();

  const { data } = await createServiceClient()
    .storage.from('kyc-documents')
    .createSignedUrl(path, 120);

  return data?.signedUrl ?? null;
}
