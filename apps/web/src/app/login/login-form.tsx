'use client';

/**
 * Two-step phone-OTP form (spec sections 7.1, 8.1).
 *
 * One component rather than two routes: the whole point of the 60-second criterion is that a
 * new user never leaves the page, and a navigation between steps is where that time goes.
 */
import { useActionState, useEffect, useRef } from 'react';
import { sendOtp, verifyOtp, type AuthState } from './actions';

const initialState: AuthState = {};

export function LoginForm({ next }: { next: string }) {
  const [sendState, sendAction, sending] = useActionState(sendOtp, initialState);
  const [verifyState, verifyAction, verifying] = useActionState(verifyOtp, initialState);

  const otpSent = sendState.otpSent ?? verifyState.otpSent ?? false;
  const phone = verifyState.phone ?? sendState.phone ?? '';
  const error = verifyState.error ?? sendState.error;

  const codeRef = useRef<HTMLInputElement>(null);

  // Moving focus to the code field the moment it appears saves the user a tap on mobile,
  // which is where most of this traffic will be.
  useEffect(() => {
    if (otpSent) codeRef.current?.focus();
  }, [otpSent]);

  if (!otpSent) {
    return (
      <form action={sendAction} className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="phone" className="block text-sm font-medium text-slate-700">
            Mobile number
          </label>
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="rounded-md border border-slate-300 bg-slate-50 px-3 py-2.5 text-slate-600"
            >
              +91
            </span>
            <input
              id="phone"
              name="phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              required
              maxLength={10}
              placeholder="98765 43210"
              defaultValue={phone.replace('+91', '')}
              aria-describedby={error ? 'auth-error' : undefined}
              className="w-full rounded-md border border-slate-300 px-3 py-2.5 text-base focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
            />
          </div>
          <p className="text-xs text-slate-500">
            We will text you a 6-digit code. No password needed.
          </p>
        </div>

        {error ? <ErrorMessage>{error}</ErrorMessage> : null}

        <button
          type="submit"
          disabled={sending}
          className="w-full rounded-md bg-slate-900 px-4 py-2.5 font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
        >
          {sending ? 'Sending code...' : 'Send code'}
        </button>
      </form>
    );
  }

  return (
    <form action={verifyAction} className="space-y-4">
      <input type="hidden" name="phone" value={phone} />
      <input type="hidden" name="next" value={next} />

      <div className="space-y-2">
        <label htmlFor="token" className="block text-sm font-medium text-slate-700">
          Enter the code sent to {formatPhone(phone)}
        </label>
        <input
          ref={codeRef}
          id="token"
          name="token"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          required
          maxLength={6}
          pattern="\d{6}"
          placeholder="123456"
          aria-describedby={error ? 'auth-error' : undefined}
          className="w-full rounded-md border border-slate-300 px-3 py-2.5 text-center text-2xl tracking-[0.4em] focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
        />
      </div>

      {error ? <ErrorMessage>{error}</ErrorMessage> : null}

      <button
        type="submit"
        disabled={verifying}
        className="w-full rounded-md bg-slate-900 px-4 py-2.5 font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
      >
        {verifying ? 'Verifying...' : 'Verify and continue'}
      </button>

      <button
        type="submit"
        formAction={sendAction}
        name="phone"
        value={phone}
        className="w-full text-sm text-slate-600 underline underline-offset-4 hover:text-slate-900"
      >
        Send a new code
      </button>
    </form>
  );
}

function ErrorMessage({ children }: { children: React.ReactNode }) {
  return (
    <p id="auth-error" role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
      {children}
    </p>
  );
}

function formatPhone(phone: string): string {
  const digits = phone.replace('+91', '');
  return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
}
