'use server';

/**
 * Phone-OTP authentication (spec section 7.1).
 *
 * Acceptance criteria this implements:
 *   - "A new number can register in under 60 seconds"
 *   - "a returning number logs in with OTP only, no password"
 *
 * Sending and verifying both go through Supabase Auth, which in production routes the SMS via
 * the custom MSG91 hook (spec 9.5). In local development Supabase prints the code to its own
 * logs, so no SMS provider is needed to sign in.
 */
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { parseIndianMobile } from '@parking/core';
import { createClient } from '@/lib/supabase/server';
import { identify, track } from '@/lib/analytics';

export interface AuthState {
  error?: string;
  phone?: string;
  /** Set once an OTP has been sent, which flips the form to the code-entry step. */
  otpSent?: boolean;
}

// Parsing lives in @parking/core so the login form, the display formatter and the seed all
// agree on what a valid number is - and on which of the two formats they are holding.
const phoneSchema = z
  .string()
  .transform((value) => parseIndianMobile(value))
  .refine((parsed) => parsed !== null, 'Enter a valid 10-digit Indian mobile number')
  .transform((parsed) => parsed!.e164);

const otpSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'Enter the 6-digit code');

export async function sendOtp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = phoneSchema.safeParse(formData.get('phone') ?? '');

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Enter a valid mobile number' };
  }

  const supabase = await createClient();

  // shouldCreateUser: a first-time number is registered on the spot, which is what keeps
  // signup inside the 60-second criterion - there is no separate registration step.
  const { error } = await supabase.auth.signInWithOtp({
    phone: parsed.data,
    options: { shouldCreateUser: true },
  });

  if (error) {
    return { error: describeAuthError(error.message), phone: parsed.data };
  }

  return { phone: parsed.data, otpSent: true };
}

export async function verifyOtp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const phone = phoneSchema.safeParse(formData.get('phone') ?? '');
  const token = otpSchema.safeParse(formData.get('token') ?? '');

  if (!phone.success) {
    return { error: 'Something went wrong with that number. Please start again.' };
  }
  if (!token.success) {
    return {
      error: token.error.issues[0]?.message ?? 'Enter the 6-digit code',
      phone: phone.data,
      otpSent: true,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    phone: phone.data,
    token: token.data,
    type: 'sms',
  });

  if (error) {
    return { error: describeAuthError(error.message), phone: phone.data, otpSent: true };
  }

  // Counted once per account, not once per sign-in: an account whose `created_at` is within a
  // few seconds of now was created by this verification. Without that guard every returning
  // seeker would inflate the signup number in §3 and make acquisition look like retention.
  const { data: session } = await supabase.auth.getUser();
  const user = session.user;

  if (user) {
    const isNew = Date.now() - new Date(user.created_at).getTime() < 10_000;

    await identify(user.id, { role: 'seeker' });
    if (isNew) {
      await track('signup_completed', { distinctId: user.id });
    }
  }

  const next = formData.get('next');
  redirect(typeof next === 'string' && next.startsWith('/') ? next : '/');
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/');
}

/** Supabase's raw messages leak implementation detail; these are what a Seeker should read. */
function describeAuthError(message: string): string {
  const lower = message.toLowerCase();

  if (lower.includes('expired')) return 'That code has expired. Request a new one.';
  if (lower.includes('invalid')) return 'That code is not right. Check it and try again.';
  if (lower.includes('rate') || lower.includes('too many')) {
    return 'Too many attempts. Wait a minute before requesting another code.';
  }
  return 'We could not sign you in just now. Please try again.';
}
