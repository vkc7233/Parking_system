import type { MetadataRoute } from 'next';
import { PILOT_DESTINATIONS } from '@parking/config';
import { clientEnv } from '@/lib/env';
import { createAnonClient } from '@/lib/supabase/anon';

/**
 * Sitemap (spec §7.4 "indexable listing/city pages so the platform is discoverable via search").
 *
 * Only `live` listings are listed. A pending or paused listing 404s for a signed-out visitor, so
 * submitting it here would hand crawlers a page of soft-404s and cost the whole site trust for
 * pages that are genuinely good.
 *
 * The area pages carry a higher priority than individual listings on purpose: "parking in
 * Koregaon Park" is the search people actually run, and those eight pages are the ones that can
 * rank for it. A single listing ranks for nothing on its own.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = clientEnv.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '');

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: base, changeFrequency: 'daily', priority: 1 },
    { url: `${base}/legal/terms`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/legal/privacy`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/legal/cancellation`, changeFrequency: 'yearly', priority: 0.3 },
  ];

  const areaRoutes: MetadataRoute.Sitemap = PILOT_DESTINATIONS.map((destination) => ({
    url: `${base}/?place=${destination.slug}`,
    changeFrequency: 'daily' as const,
    priority: 0.8,
  }));

  // Read with the anon client rather than the cookie-bound one: live listings are public by
  // RLS policy, and reading cookies here would make this route dynamic and unbuildable.
  //
  // A sitemap that throws takes the whole route down; one missing its listings for a single
  // crawl costs almost nothing. But the failure is logged loudly, because a silently empty
  // sitemap is indistinguishable from a working one until rankings quietly fail to appear.
  let listingRoutes: MetadataRoute.Sitemap = [];

  try {
    const supabase = createAnonClient();
    const { data, error } = await supabase
      .from('listings')
      .select('id, updated_at')
      .eq('status', 'live')
      .order('updated_at', { ascending: false })
      .limit(5_000);

    if (error) throw new Error(error.message);

    listingRoutes = (data ?? []).map((listing) => ({
      url: `${base}/listings/${listing.id}`,
      lastModified: new Date(listing.updated_at),
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    }));
  } catch (error) {
    console.error('[sitemap] shipping WITHOUT listing URLs:', error);
  }

  return [...staticRoutes, ...areaRoutes, ...listingRoutes];
}
