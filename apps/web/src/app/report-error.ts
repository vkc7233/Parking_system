'use server';

/**
 * Lets a client error boundary report into the same tracker as server errors (spec §7.4).
 *
 * `onRequestError` covers everything that fails on the server. A component that throws while
 * hydrating, or a browser API that is missing, fails only in the browser — where nothing was
 * listening. §7.4 asks for capture of "application errors", not of half of them.
 *
 * The client sends a message and a stack, never an object. Anything a client can pass reaches
 * the error tracker, so this takes the two fields it needs and reconstructs the error here
 * rather than trusting a shape.
 */
import { captureError } from '@/lib/observability';
import { getProfile } from '@/lib/auth';

export async function reportClientError(input: {
  message: string;
  stack?: string;
  digest?: string;
  path: string;
}): Promise<void> {
  const error = new Error(input.message.slice(0, 500));
  error.name = 'ClientError';
  if (input.stack) error.stack = input.stack.slice(0, 8_000);

  const profile = await getProfile();

  await captureError(error, {
    source: 'client:error-boundary',
    severity: 'error',
    ...(profile ? { userId: profile.id } : {}),
    tags: {
      path: input.path.slice(0, 200),
      // Correlates the screen the user is looking at with the server log line.
      ...(input.digest ? { digest: input.digest } : {}),
    },
  });
}
