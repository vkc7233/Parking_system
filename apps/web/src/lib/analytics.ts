import 'server-only';

import { PILOT_CITY } from '@parking/config';
import {
  createAnalyticsAdapter,
  type AnalyticsEvent,
  type AnalyticsProperties,
} from '@parking/api-client';
import { clientEnv } from '@/lib/env';

/**
 * Funnel instrumentation (spec §7.4, §3).
 *
 * One rule, and it is the whole reason this wrapper exists rather than call sites reaching for
 * the adapter: **`track` never throws and never blocks.** An analytics vendor being slow or down
 * must not be able to fail a booking or hold a seeker on a payment screen. Every call is
 * fire-and-forget with its rejection swallowed here, so a caller cannot forget to guard it.
 *
 * That trade is deliberate: a lost event costs a slightly wrong denominator in a dashboard, and
 * a thrown one costs a booking. §3 exists to measure the marketplace, not to be the marketplace.
 */
export async function track(
  event: AnalyticsEvent,
  input: {
    /** The platform user id, or an anonymous id for a signed-out seeker. Never a phone number. */
    distinctId: string;
    properties?: AnalyticsProperties;
  },
): Promise<void> {
  const analytics = createAnalyticsAdapter({
    ANALYTICS_PROVIDER: clientEnv.NEXT_PUBLIC_POSTHOG_KEY ? 'posthog' : 'fake',
    ...(clientEnv.NEXT_PUBLIC_POSTHOG_KEY
      ? { POSTHOG_KEY: clientEnv.NEXT_PUBLIC_POSTHOG_KEY }
      : {}),
    ...(clientEnv.NEXT_PUBLIC_POSTHOG_HOST
      ? { POSTHOG_HOST: clientEnv.NEXT_PUBLIC_POSTHOG_HOST }
      : {}),
  });

  try {
    await analytics.capture({
      distinctId: input.distinctId,
      event,
      properties: {
        // Stamped on everything, because the pilot is one city today and will not be tomorrow;
        // without it, none of §3's numbers can be read per-city later.
        city: PILOT_CITY.name,
        ...input.properties,
      },
    });
  } catch (error) {
    console.error(`[analytics] ${event} not recorded`, error);
  }
}

/** Attaches durable traits, so §3's funnels can be split by role. */
export async function identify(distinctId: string, traits: AnalyticsProperties): Promise<void> {
  const analytics = createAnalyticsAdapter({
    ANALYTICS_PROVIDER: clientEnv.NEXT_PUBLIC_POSTHOG_KEY ? 'posthog' : 'fake',
    ...(clientEnv.NEXT_PUBLIC_POSTHOG_KEY
      ? { POSTHOG_KEY: clientEnv.NEXT_PUBLIC_POSTHOG_KEY }
      : {}),
    ...(clientEnv.NEXT_PUBLIC_POSTHOG_HOST
      ? { POSTHOG_HOST: clientEnv.NEXT_PUBLIC_POSTHOG_HOST }
      : {}),
  });

  try {
    await analytics.identify({ distinctId, traits: { city: PILOT_CITY.name, ...traits } });
  } catch (error) {
    console.error('[analytics] identify failed', error);
  }
}
