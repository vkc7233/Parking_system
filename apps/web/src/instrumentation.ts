/**
 * Runs once when the server boots.
 *
 * Validating provider configuration here means a deployment with PAYMENTS_PROVIDER=razorpay
 * and no key fails immediately and visibly, rather than at the moment a real Seeker tries to
 * pay for a real parking spot.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { assertProvidersConfigured } = await import('@/lib/env');
    assertProvidersConfigured();
  }
}
