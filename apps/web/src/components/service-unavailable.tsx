import { Card, CardBody } from '@parking/ui';

/**
 * Shown when the database cannot be reached.
 *
 * A search page whose backend is down should say so, not throw. In production this is a brief
 * outage and the seeker should be told to try again; in local development it is almost always
 * that Supabase is not running, so the message says that too rather than making someone read a
 * stack trace to work it out.
 */
export function ServiceUnavailable({ what }: { what: string }) {
  return (
    <Card>
      <CardBody className="py-10 text-center">
        <h2 className="text-sm font-medium text-slate-900">{what} is unavailable right now</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">
          We could not reach our servers. This is usually brief — please try again in a moment.
        </p>

        {process.env.NODE_ENV === 'development' ? (
          <div className="mx-auto mt-4 max-w-md rounded-md bg-amber-50 px-3 py-2 text-left text-xs text-amber-900">
            <p className="font-medium">Development note</p>
            <p className="mt-1">
              The local Supabase stack is not responding. Start it with{' '}
              <code className="font-mono">pnpm db:start</code>, or if Docker itself is down,{' '}
              <code className="font-mono">pnpm docker:up</code> first.
            </p>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
