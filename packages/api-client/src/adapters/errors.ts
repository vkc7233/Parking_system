/**
 * Error tracking adapter (spec §7.4, §9.6).
 *
 * §7.4's acceptance criterion is that "a production error is visible in the error-tracking
 * dashboard within 1 minute". That is a statement about delivery, so the contract below is
 * deliberately narrow: capture one error with enough context to act on, and never fail.
 *
 * Behind an interface like every other vendor (§9.6). Error tracking is the integration most
 * likely to be swapped or dropped for cost, and the one that must never be able to take the
 * application down with it — a reporter that throws while reporting turns one broken request
 * into a broken deployment.
 */

export type ErrorSeverity = 'fatal' | 'error' | 'warning';

export interface ErrorContext {
  /** Where it happened: a route, an action name, a job. */
  source?: string;
  /** The platform user id when known. Never a phone number — see the note in `capture`. */
  userId?: string;
  /** Request path, HTTP method, booking reference: anything that narrows down a repro. */
  tags?: Record<string, string>;
  severity?: ErrorSeverity;
}

export interface ErrorTrackingAdapter {
  readonly name: string;

  /**
   * Reports one error.
   *
   * Implementations must swallow their own failures. The caller is already in a failure path;
   * an exception thrown from here would replace a handled error with an unhandled one, and the
   * original — the thing worth knowing about — would be lost.
   *
   * `userId` is the platform id, never a phone number or an email. An error tracker accumulates
   * a copy of the user directory otherwise, in a third-party system chosen for debugging rather
   * than for holding personal data (§12, and the DPDP obligations §7.4 is drafted against).
   */
  capture(error: unknown, context?: ErrorContext): Promise<void>;
}
