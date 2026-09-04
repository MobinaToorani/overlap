import { redirect } from 'next/navigation';
import { cache } from 'react';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Null if unauthenticated — for places that branch rather than redirect.
 *
 * Wrapped in React's per-request cache(): (app)/layout.tsx's requireUser()
 * and a page under it (e.g. me/page.tsx) both call this during the same
 * request, and each call is a real network round trip to Supabase. Without
 * this, a single page load was hitting Supabase's auth server 3 times
 * (once in middleware.ts, which runs in a separate runtime cache() can't
 * reach, then twice more here) — cache() collapses the two RSC-tree calls
 * into one, which is the standard fix for this in Next's App Router.
 */
export const getUser = cache(async () => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/** Server-component half of the protected-route wrapper — see middleware.ts. */
export async function requireUser() {
  const user = await getUser();
  if (!user) {
    redirect('/login');
  }
  return user;
}
