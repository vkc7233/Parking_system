/**
 * Session refresh and route protection.
 *
 * Two jobs:
 *
 *  1. Refresh the Supabase auth cookie on every request. Server components cannot write
 *     cookies, so without this a session silently expires mid-flow.
 *
 *  2. Gate the protected route groups. Spec 8.4 requires /admin to be "a separate, restricted
 *     route never exposed in the main navigation", and spec 7.3 requires the restriction to be
 *     enforced server-side.
 *
 * This is the first of two gates, not the only one. Middleware runs before the page and keeps
 * unauthorised users from ever seeing an admin shell, but the real guarantee is the RLS policy
 * on each table: even if this file were deleted, an admin query from a seeker account would
 * return nothing.
 */
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PROTECTED_PREFIXES = ['/bookings', '/host', '/admin', '/profile'];
const ADMIN_PREFIX = '/admin';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getUser() revalidates the token with the auth server. getSession() would read it from the
  // cookie without verifying, which is not good enough to gate an admin route on.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const needsAuth = PROTECTED_PREFIXES.some((prefix) => path.startsWith(prefix));

  if (needsAuth && !user) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', path);
    return NextResponse.redirect(loginUrl);
  }

  if (path.startsWith(ADMIN_PREFIX) && user) {
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    // 404 rather than 403: an admin panel that announces its own existence to every logged-in
    // seeker is an invitation. Spec 8.4 keeps /admin off the main navigation for the same reason.
    if (profile?.role !== 'admin') {
      return NextResponse.rewrite(new URL('/not-found', request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and image files - matching those would refresh the
     * session dozens of times per page load.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
