import Link from 'next/link';
import { getUser } from '@/server/auth/requireUser';
import { DisplayNameForm } from './DisplayNameForm';
import { SignOutButton } from './SignOutButton';

// Proves the login loop end-to-end (T3's own definition of done: "two
// phones can OTP-login") and now carries the name field (T25 / X-12).
// Calendar connections, notification prefs and privacy controls — the
// rest of §7.2's Me screen — are T9, T15 and T22.
export default async function MePage() {
  const user = await getUser(); // never null here — (app)/layout.tsx already redirected otherwise

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-6">
      <h1 className="font-display text-3xl text-text">You&apos;re in</h1>
      <p className="text-text-muted">Signed in as {user?.phone}.</p>
      <DisplayNameForm />
      <Link href="/g" className="text-accent underline">
        Your groups
      </Link>
      <SignOutButton />
    </main>
  );
}
