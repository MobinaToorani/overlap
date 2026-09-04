'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { trpc } from '@/lib/trpc/client';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');

  const requestOtp = trpc.auth.requestOtp.useMutation({
    onSuccess: () => setStep('code'),
  });
  const verifyOtp = trpc.auth.verifyOtp.useMutation({
    onSuccess: () => {
      // The mutation's response already carried a Set-Cookie for the new
      // session (same-origin fetch via httpBatchLink) — router.refresh()
      // re-runs Server Components (incl. the (app) layout's requireUser())
      // against it rather than a stale cached tree.
      router.push(searchParams.get('next') ?? '/me');
      router.refresh();
    },
  });

  const error = requestOtp.error?.message ?? verifyOtp.error?.message;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-6">
      <h1 className="font-display text-3xl text-text">Log in</h1>

      {step === 'phone' ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            requestOtp.mutate({ phone });
          }}
        >
          <label className="text-sm text-text-muted" htmlFor="phone">
            Phone number
          </label>
          <input
            id="phone"
            type="tel"
            required
            placeholder="+15195551234"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="rounded-[var(--radius)] border border-border bg-surface px-3 py-2 text-text"
          />
          <button
            type="submit"
            disabled={requestOtp.isPending}
            className="rounded-[var(--radius)] bg-accent px-3 py-2 text-white disabled:opacity-50"
          >
            {requestOtp.isPending ? 'Sending…' : 'Send code'}
          </button>
        </form>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            verifyOtp.mutate({ phone, code });
          }}
        >
          <p className="text-sm text-text-muted">Code sent to {phone}.</p>
          <label className="text-sm text-text-muted" htmlFor="code">
            6-digit code
          </label>
          <input
            id="code"
            type="text"
            inputMode="numeric"
            required
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="rounded-[var(--radius)] border border-border bg-surface px-3 py-2 text-text"
          />
          <button
            type="submit"
            disabled={verifyOtp.isPending}
            className="rounded-[var(--radius)] bg-accent px-3 py-2 text-white disabled:opacity-50"
          >
            {verifyOtp.isPending ? 'Verifying…' : 'Verify'}
          </button>
          <button
            type="button"
            onClick={() => setStep('phone')}
            className="text-sm text-text-muted underline"
          >
            Use a different number
          </button>
        </form>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
    </main>
  );
}

export default function LoginPage() {
  // useSearchParams() requires a Suspense boundary in the App Router.
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
