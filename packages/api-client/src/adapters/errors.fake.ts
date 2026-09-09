import type { ErrorContext, ErrorTrackingAdapter } from './errors';

export interface RecordedError {
  message: string;
  stack: string | null;
  context: ErrorContext;
  at: Date;
}

/**
 * Console-and-memory error adapter for local development, CI and tests.
 *
 * It prints, because in development the terminal *is* the error dashboard, and it keeps what it
 * captured so a test can assert that a failure path actually reports rather than swallowing.
 * That second job matters: the usual way error tracking dies is a `catch {}` added during
 * debugging and never removed, which nothing detects because the application keeps working.
 */
export class FakeErrorTrackingAdapter implements ErrorTrackingAdapter {
  readonly name = 'fake';

  readonly errors: RecordedError[] = [];

  async capture(error: unknown, context: ErrorContext = {}): Promise<void> {
    const normalised = error instanceof Error ? error : new Error(String(error));

    this.errors.push({
      message: normalised.message,
      stack: normalised.stack ?? null,
      context,
      at: new Date(),
    });

    const where = context.source ? ` [${context.source}]` : '';
    console.error(`[error-tracking]${where} ${normalised.message}`, normalised.stack ?? '');
  }

  reset(): void {
    this.errors.length = 0;
  }
}
