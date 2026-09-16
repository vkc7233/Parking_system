import { describe, expect, it } from 'vitest';
import { searchNearbyListings } from './search';

/**
 * The message a developer or an on-call reader actually sees when search breaks.
 *
 * `fetch failed` is the entire message Node gives for an unreachable host: no status, no URL,
 * nothing to act on. It is also the most common failure in development (Supabase not started
 * yet) and in a fresh deployment (wrong URL). These pin that the message names the address and
 * says which of the two it probably is.
 */
function clientThatFails(url: string, message: string) {
  return {
    supabaseUrl: url,
    rpc: async () => ({ data: null, error: { message } }),
  } as unknown as Parameters<typeof searchNearbyListings>[0];
}

const filters = { center: { lat: 18.53, lng: 73.84 }, radiusMeters: 5_000 };

describe('when the database cannot be reached', () => {
  it('names a local URL and says how to start it', async () => {
    const client = clientThatFails('http://127.0.0.1:54321', 'TypeError: fetch failed');

    await expect(searchNearbyListings(client, filters)).rejects.toThrow(
      /Could not reach the database at http:\/\/127\.0\.0\.1:54321.*pnpm db:start/s,
    );
  });

  it('names a remote URL and points at the configuration instead', async () => {
    const client = clientThatFails('https://abc.supabase.co', 'TypeError: fetch failed');

    await expect(searchNearbyListings(client, filters)).rejects.toThrow(
      /Could not reach the database at https:\/\/abc\.supabase\.co.*NEXT_PUBLIC_SUPABASE_URL/s,
    );
  });

  it.each(['ECONNREFUSED 127.0.0.1:54321', 'getaddrinfo ENOTFOUND abc.supabase.co'])(
    'treats %s as unreachable too',
    async (message) => {
      const client = clientThatFails('http://127.0.0.1:54321', message);
      await expect(searchNearbyListings(client, filters)).rejects.toThrow(/Could not reach/);
    },
  );
});

describe('when the database answers but rejects the query', () => {
  it('passes the provider message through unchanged', async () => {
    // A missing function or a bad argument explains itself; rewriting it would lose the detail.
    const client = clientThatFails(
      'http://127.0.0.1:54321',
      'function public.search_nearby_listings does not exist',
    );

    await expect(searchNearbyListings(client, filters)).rejects.toThrow(
      /Nearby search failed: function public\.search_nearby_listings does not exist/,
    );
  });
});
