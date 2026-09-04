import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseEnv } from './env';

/**
 * Refreshes the Supabase session cookie on every matched request. This is
 * the middleware half of the pattern started in ../server.ts's doc
 * comment: a Server Component can't write cookies, so without this,
 * sessions would only ever refresh on requests that happen to hit a Route
 * Handler or Server Action — i.e. rarely, and unpredictably.
 *
 * `supabase.auth.getUser()` (not `getSession()`) is deliberate: getSession
 * reads the JWT out of the cookie without checking it's still valid;
 * getUser() revalidates against Supabase. Skipping that check here would
 * mean a revoked session still passes the route-protection check below
 * until the access token happens to expire.
 *
 * Every request on the site (public landing page included — see the
 * matcher in ../../middleware.ts) runs this. If Supabase isn't configured
 * — no .env.local yet in local dev, or a misconfigured deploy — this must
 * degrade to "nobody is logged in" rather than throw, or a config problem
 * on an *unrelated* protected route would 500 the public marketing page
 * too. Protected paths still redirect to /login when this happens, which
 * is the correct behaviour anyway: nobody can hold a genuinely valid
 * session against a Supabase project the server can't reach.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  let env: ReturnType<typeof getSupabaseEnv>;
  try {
    env = getSupabaseEnv();
  } catch (err) {
    console.error('[middleware] Supabase not configured, treating as signed out:', err);
    return { response, user: null };
  }

  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return { response, user };
  } catch (err) {
    // Supabase configured but unreachable (network blip, wrong URL, project
    // paused) — same degrade-to-signed-out reasoning as the env check above.
    console.error('[middleware] Supabase getUser() failed, treating as signed out:', err);
    return { response, user: null };
  }
}
