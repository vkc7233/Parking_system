import 'server-only';

import { createMapsAdapter, type MapsAdapter } from '@parking/api-client';
import { clientEnv } from '@/lib/env';

/**
 * The maps adapter, configured from the environment.
 *
 * Wrapped rather than constructed at each call site so no screen ever reaches for a provider
 * SDK directly - spec §9.6 is explicit that the abstraction is what lets Google Maps be
 * swapped for Mapbox when its cost curve becomes the risk §16 names.
 *
 * Maps configuration is public (the browser SDK needs the key), so it lives in the client env
 * even though every call we make today runs on the server.
 */
export function maps(): MapsAdapter {
  return createMapsAdapter({
    MAPS_PROVIDER: clientEnv.NEXT_PUBLIC_MAPS_PROVIDER,
    ...(clientEnv.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
      ? { GOOGLE_MAPS_API_KEY: clientEnv.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY }
      : {}),
  });
}
