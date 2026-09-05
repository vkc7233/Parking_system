import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { LoginForm } from './login-form';

export const metadata = { title: 'Sign in' };

/** Spec 8.1: "Landing / Login (phone entry) -> OTP verification". */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { next } = await searchParams;
  const destination = next?.startsWith('/') ? next : '/';

  if (user) redirect(destination);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-12">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Sign in</h1>
        <p className="mt-1 mb-6 text-sm text-slate-600">
          One account for booking parking and for listing your own space.
        </p>
        <LoginForm next={destination} />
      </div>
    </main>
  );
}
