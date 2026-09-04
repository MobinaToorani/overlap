/**
 * Fail loudly and immediately if the two public Supabase vars are missing,
 * instead of letting `createClient(undefined, undefined)` produce a client
 * that fails confusingly on first use. Kept in one place so every Supabase
 * client factory (server, browser, middleware) reads it the same way.
 */
export function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set — see apps/web/.env.example',
    );
  }
  return { url, anonKey };
}
