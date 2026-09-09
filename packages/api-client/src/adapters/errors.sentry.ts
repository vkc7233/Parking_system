import type { ErrorContext, ErrorTrackingAdapter } from './errors';

/**
 * Sentry adapter, over the Store endpoint.
 *
 * No SDK, for the same reason the analytics adapter has none: `@sentry/nextjs` installs a build
 * plugin, wraps the server runtime and ships a client bundle, which is a large amount of moving
 * machinery to satisfy one acceptance criterion — §7.4's "a production error is visible in the
 * error-tracking dashboard within 1 minute". A single JSON POST meets it. If richer tracing is
 * wanted later, this file is what gets replaced.
 */

/** The pieces of a Sentry DSN needed to address its ingest endpoint. */
export interface ParsedDsn {
  endpoint: string;
  publicKey: string;
  projectId: string;
}

/**
 * Splits a DSN of the form `https://<key>@<host>/<project_id>`.
 *
 * Returns null rather than throwing on a malformed value: a typo in an environment variable
 * must degrade to "errors are not reported" and not to "the server will not start".
 */
export function parseSentryDsn(dsn: string): ParsedDsn | null {
  try {
    const url = new URL(dsn);
    const projectId = url.pathname.replace(/^\//, '');

    if (!url.username || !projectId) return null;

    return {
      endpoint: `${url.protocol}//${url.host}/api/${projectId}/store/`,
      publicKey: url.username,
      projectId,
    };
  } catch {
    return null;
  }
}

export class SentryErrorTrackingAdapter implements ErrorTrackingAdapter {
  readonly name = 'sentry';

  private readonly dsn: ParsedDsn;
  private readonly environment: string;
  private readonly release: string | undefined;

  constructor(config: { dsn: ParsedDsn; environment?: string; release?: string }) {
    this.dsn = config.dsn;
    this.environment = config.environment ?? 'production';
    if (config.release !== undefined) this.release = config.release;
  }

  async capture(error: unknown, context: ErrorContext = {}): Promise<void> {
    const normalised = error instanceof Error ? error : new Error(String(error));

    const payload = {
      event_id: crypto.randomUUID().replaceAll('-', ''),
      timestamp: new Date().toISOString(),
      platform: 'javascript',
      level: context.severity ?? 'error',
      environment: this.environment,
      ...(this.release ? { release: this.release } : {}),
      logger: context.source ?? 'app',
      // Only the platform id. Never phone or email — see the note on the interface.
      ...(context.userId ? { user: { id: context.userId } } : {}),
      tags: context.tags ?? {},
      exception: {
        values: [
          {
            type: normalised.name,
            value: normalised.message,
            stacktrace: { frames: parseStack(normalised.stack) },
          },
        ],
      },
    };

    // Capped hard and its failure swallowed. The caller is already handling a failure; a slow
    // or unreachable error tracker must not extend or replace it.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2_000);

    try {
      await fetch(this.dsn.endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-sentry-auth': [
            'Sentry sentry_version=7',
            'sentry_client=parking-marketplace/1.0',
            `sentry_key=${this.dsn.publicKey}`,
          ].join(', '),
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch {
      // Deliberately silent: console.error here would recurse through any handler that reports
      // console errors, and there is nowhere better to send it.
    } finally {
      clearTimeout(timeout);
    }
  }
}

/**
 * Turns a V8 stack string into Sentry's frame list, oldest first.
 *
 * Sentry renders the last frame as the throw site, which is the opposite of the order V8 prints,
 * so the list is reversed. Getting this backwards is not an error anyone sees — it just puts the
 * least interesting frame at the top of every issue.
 */
function parseStack(stack: string | undefined): {
  filename: string;
  function: string;
  lineno?: number;
  colno?: number;
}[] {
  if (!stack) return [];

  const frames = stack
    .split('\n')
    .slice(1)
    .map((line) => {
      const match = /at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?$/.exec(line.trim());
      if (!match) return null;

      return {
        function: match[1] ?? '<anonymous>',
        filename: match[2] ?? '<unknown>',
        lineno: Number(match[3]),
        colno: Number(match[4]),
      };
    })
    .filter((frame): frame is NonNullable<typeof frame> => frame !== null);

  return frames.reverse();
}
