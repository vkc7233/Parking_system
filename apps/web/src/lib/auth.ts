import 'server-only';

import { redirect } from 'next/navigation';
import type { KycStatus, UserRole } from '@parking/types';
import { createClient } from '@/lib/supabase/server';

/**
 * Session helpers for server components and server actions.
 *
 * These are a convenience and a redirect, not a security boundary. The boundary is RLS: even if
 * every check here were deleted, a Seeker's query for another Host's listings would return
 * nothing. Middleware keeps people off pages they cannot use; these keep the components honest
 * about what they can assume.
 */

export interface Profile {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  role: UserRole;
  kycStatus: KycStatus;
  suspendedAt: string | null;
}

/** The signed-in user's profile, or null when signed out. */
export async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient();

  // getUser() revalidates with the auth server; getSession() would trust the cookie.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from('users')
    .select('id, phone, name, email, role, kyc_status, suspended_at')
    .eq('id', user.id)
    .single();

  if (!data) return null;

  return {
    id: data.id,
    phone: data.phone,
    name: data.name,
    email: data.email,
    role: data.role,
    kycStatus: data.kyc_status,
    suspendedAt: data.suspended_at,
  };
}

/** Redirects to sign-in, preserving where the user was heading. */
export async function requireProfile(returnTo: string): Promise<Profile> {
  const profile = await getProfile();

  if (!profile) {
    redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  }

  return profile;
}

/**
 * Anyone signed in may enter the Host experience - spec §8.4 is explicit that Host is a mode of
 * the same account, not a separate one, reached through "List Your Space". The `role` column is
 * promoted to 'host' when their first listing is submitted, not as a precondition for looking.
 */
export async function requireHost(returnTo: string): Promise<Profile> {
  const profile = await requireProfile(returnTo);

  if (profile.suspendedAt) {
    redirect('/host/suspended');
  }

  return profile;
}

/** Documents on file, and whether onboarding is complete (spec §7.2). */
export interface OnboardingState {
  identityProof: DocumentRow | null;
  addressProof: DocumentRow | null;
  bankDetails: DocumentRow | null;
  /** All three uploaded - what the database requires before a listing may be submitted. */
  complete: boolean;
  /** All three reviewed and accepted by an Admin. */
  verified: boolean;
  rejected: DocumentRow[];
}

export interface DocumentRow {
  id: string;
  type: 'identity_proof' | 'address_proof' | 'bank_details';
  filePath: string;
  verifiedStatus: 'pending' | 'verified' | 'rejected';
  rejectionReason: string | null;
  createdAt: string;
}

export async function getOnboardingState(userId: string): Promise<OnboardingState> {
  const supabase = await createClient();

  const { data } = await supabase
    .from('documents')
    .select('id, type, file_path, verified_status, rejection_reason, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  const rows: DocumentRow[] = (data ?? []).map((d) => ({
    id: d.id,
    type: d.type,
    filePath: d.file_path,
    verifiedStatus: d.verified_status,
    rejectionReason: d.rejection_reason,
    createdAt: d.created_at,
  }));

  // The database allows one non-rejected document per type, so the current one is the first
  // non-rejected match; a rejected one is shown separately with its reason.
  const current = (type: DocumentRow['type']) =>
    rows.find((r) => r.type === type && r.verifiedStatus !== 'rejected') ?? null;

  const identityProof = current('identity_proof');
  const addressProof = current('address_proof');
  const bankDetails = current('bank_details');
  const present = [identityProof, addressProof, bankDetails];

  return {
    identityProof,
    addressProof,
    bankDetails,
    complete: present.every((d) => d !== null),
    verified: present.every((d) => d?.verifiedStatus === 'verified'),
    rejected: rows.filter((r) => r.verifiedStatus === 'rejected'),
  };
}
