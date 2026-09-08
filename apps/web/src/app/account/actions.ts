'use server';

/**
 * Profile & Settings (spec §8.1 "Profile & Settings", §8.2).
 *
 * Written with the seeker's own session rather than the service role. The RLS policy on `users`
 * already restricts an update to the row whose id matches the caller, so routing this through
 * the service role would replace a database-enforced rule with a hand-written `eq('id', …)` —
 * one `if` away from letting anyone edit anyone.
 */
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { identify } from '@/lib/analytics';

export interface AccountState {
  error?: string;
  success?: string;
}

const profileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Enter your name as the host should see it')
    .max(80, 'That is longer than we can print on a pass'),
  // Optional throughout: §7.4 signs people in by phone, so an account with no email is normal
  // and must stay saveable. An empty string clears it rather than failing validation.
  email: z.union([z.literal(''), z.string().trim().email('That does not look like an email')]),
});

export async function updateProfile(
  _prev: AccountState,
  formData: FormData,
): Promise<AccountState> {
  const profile = await requireProfile('/account');

  const parsed = profileSchema.safeParse({
    name: formData.get('name') ?? '',
    email: formData.get('email') ?? '',
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the details and try again.' };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from('users')
    .update({
      name: parsed.data.name,
      email: parsed.data.email === '' ? null : parsed.data.email,
    })
    .eq('id', profile.id);

  if (error) {
    if (error.code === '23505') {
      return { error: 'That email is already on another account.' };
    }
    return { error: 'Could not save those details. Please try again.' };
  }

  await identify(profile.id, { role: profile.role, has_email: parsed.data.email !== '' });

  revalidatePath('/account');
  revalidatePath('/bookings');
  return { success: 'Saved.' };
}
