'use client';

/**
 * Browser Supabase client. Uses the anon key, so every query it makes is subject to the RLS
 * policies in supabase/migrations/*_rls_policies.sql - which is the point (spec section 11).
 */
import { createBrowserClient } from '@supabase/ssr';
import { clientEnv } from '@/lib/env';

export function createClient() {
  return createBrowserClient(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
