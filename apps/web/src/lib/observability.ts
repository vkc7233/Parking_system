import 'server-only';

import { createErrorTrackingAdapter, type ErrorContext } from '@parking/api-client';
import { clientEnv } from '@/lib/env';

/**
 * Error reporting (spec §7.4).
 *
 * §7.4 asks for "automatic capture of application errors in production", visible in the
 * dashboard within a minute. `captureError` is the single seam every failure path reports
 * through, and — like `track` — it can never throw. A reporter that throws while reporting
 * replaces a handled error with an unhandled one and loses the original, which is the thing
 * worth knowing about.
 *
 * With no DSN configured it prints to the console, which in development is the error dashboard.
 */
export async function captureError(error: unknown, context: ErrorContext = {}): Promise<void> {
  try {
    const errors = createErrorTrackingAdapter({
      ...(clientEnv.NEXT_PUBLIC_SENTRY_DSN ? { SENTRY_DSN: clientEnv.NEXT_PUBLIC_SENTRY_DSN } : {}),
      SENTRY_ENVIRONMENT: process.env.NODE_ENV,
      ...(process.env.VERCEL_GIT_COMMIT_SHA
        ? { SENTRY_RELEASE: process.env.VERCEL_GIT_COMMIT_SHA }
        : {}),
    });

    await errors.capture(error, context);
  } catch {
    // Nowhere left to report to. Swallowing is the only option that does not make things worse.
  }
}
