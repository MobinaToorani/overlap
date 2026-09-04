import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/** Null if unauthenticated — for places that branch rather than redirect. */
export async function getUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** Server-component half of the protected-route wrapper — see middleware.ts. */
export async function requireUser() {
  const user = await getUser();
  if (!user) {
    redirect('/login');
  }
  return user;
}
