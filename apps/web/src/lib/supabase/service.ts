import 'server-only';

/**
 * Service-role Supabase client. BYPASSES ROW-LEVEL SECURITY ENTIRELY.
 *
 * Only for the operations RLS deliberately forbids clients from performing: creating a
 * booking at a server-computed price, confirming one from a verified payment webhook, and
 * triggering payouts (see the rls_policies migration, rule 1).
 *
 * Every call site must do its own authorisation check first. There is no safety net below
 * this line.
 */
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { clientEnv, getServerEnv } from '@/lib/env';

export function createServiceClient() {
  return createSupabaseClient(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    getServerEnv().SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
