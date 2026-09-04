'use client';

import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export function SignOutButton() {
  const router = useRouter();

  return (
    <button
      type="button"
      className="rounded-[var(--radius)] border border-border px-3 py-2 text-text"
      onClick={async () => {
        await createSupabaseBrowserClient().auth.signOut();
        router.push('/login');
        router.refresh();
      }}
    >
      Sign out
    </button>
  );
}
