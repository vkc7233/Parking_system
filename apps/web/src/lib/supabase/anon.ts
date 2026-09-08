import 'server-only';

/**
 * A signed-out Supabase client: the anon key, no cookies, no session.
 *
 * For reading data that is public by RLS policy, from a context that has no user and must not
 * acquire one. The sitemap is the case that forced this: building it with the cookie-bound
 * server client made `/sitemap.xml` a dynamic route that read `cookies()` during the build,
 * which threw, and the catch around it turned that into a sitemap containing no listings at
 * all — a silent failure of the exact thing the file exists to do.
 *
 * RLS still applies. It sees an anonymous caller, which is precisely what a crawler is.
 */
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { clientEnv } from '@/lib/env';

export function createAnonClient() {
  return createSupabaseClient(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
