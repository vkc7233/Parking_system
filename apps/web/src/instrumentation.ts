/**
 * Next.js instrumentation hook (spec §7.4).
 *
 * `onRequestError` is where every uncaught server-side error surfaces — server components,
 * server actions, route handlers and middleware alike. Reporting here rather than in each
 * `catch` is what makes the capture *automatic*, which is the word §7.4 uses: an error nobody
 * remembered to wrap still reaches the dashboard.
 *
 * The import is dynamic because this module is evaluated in both the Node and Edge runtimes,
 * and the reporting path pulls in `server-only` code that must not be loaded at Edge boot.
 */
export async function onRequestError(
  error: unknown,
  request: { path: string; method: string; headers: Record<string, string | undefined> },
  context: { routerKind: string; routePath: string; routeType: string },
): Promise<void> {
  const { captureError } = await import('@/lib/observability');

  await captureError(error, {
    source: `${context.routerKind}:${context.routeType}`,
    severity: 'error',
    tags: {
      path: request.path,
      method: request.method,
      route: context.routePath,
    },
  });
}
