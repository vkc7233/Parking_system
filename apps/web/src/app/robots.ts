import type { MetadataRoute } from 'next';
import { clientEnv } from '@/lib/env';

/**
 * Crawl rules (spec §7.4).
 *
 * Search and listing pages are the point of being indexed. Everything behind a sign-in is
 * disallowed — not as a security measure, since RLS and the route guards are that, but because
 * a crawler following those links only ever reaches a redirect or a 404, and a site that answers
 * crawlers with dead ends is ranked as one.
 *
 * `/admin` is listed here despite §8.4 keeping it unlinked. Naming it in robots.txt tells the
 * world the path exists, but the path was never the protection: a non-admin gets a 404 there.
 * The alternative is Google indexing an admin login discovered some other way, which is worse.
 */
export default function robots(): MetadataRoute.Robots {
  const base = clientEnv.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '');

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/admin/', '/account', '/bookings', '/host', '/login', '/api/'],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
