import Link from 'next/link';

/**
 * Also what a non-admin sees at /admin: the middleware rewrites there rather than returning a
 * 403, so the admin panel does not advertise its own existence (spec 8.4).
 */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 text-center">
      <h1 className="text-2xl font-semibold text-slate-900">Page not found</h1>
      <p className="mt-2 text-slate-600">
        The page you were looking for does not exist or has moved.
      </p>
      <Link
        href="/"
        className="mx-auto mt-6 rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
      >
        Back to home
      </Link>
    </main>
  );
}
