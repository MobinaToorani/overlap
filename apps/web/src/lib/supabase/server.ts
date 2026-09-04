import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getSupabaseEnv } from './env';

/**
 * The cookie-aware Supabase client for Server Components, Route Handlers,
 * and Server Actions. Reads the current request's cookies and, where the
 * runtime allows writing them (Route Handlers/Server Actions — not plain
 * Server Components, which are read-only), writes refreshed session cookies
 * back out.
 *
 * `getAll`/`setAll` (not the older per-cookie get/set/remove) is the
 * @supabase/ssr-recommended shape as of this package's current major —
 * using the old shape here would silently stop refreshing sessions on a
 * future @supabase/ssr upgrade.
 */
export async function createSupabaseServerClient() {
  const { url, anonKey } = getSupabaseEnv();
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, where `cookies()` is read-only.
          // Harmless as long as middleware.ts is also refreshing the
          // session on every request — see ./middleware.ts's doc comment.
        }
      },
    },
  });
}
