import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

/**
 * The "protected route wrapper" (T3). Belt-and-suspenders with
 * src/app/(app)/layout.tsx's server-side requireUser() check: this one
 * runs first and redirects before a protected page even starts rendering;
 * the layout check exists in case a route is ever reached by some path
 * that bypasses middleware (e.g. Next.js internals), so the app is never
 * left relying on only one of the two.
 *
 * Route groups like (app) and (auth) don't appear in the URL, so this
 * matches on the actual pathnames those groups produce.
 */
const PROTECTED_PREFIXES = ['/g', '/signal', '/me'];

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export async function middleware(request: NextRequest) {
  const { response, user } = await updateSession(request);

  if (isProtectedPath(request.nextUrl.pathname) && !user) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    // Skip static assets, the OG image route, and the public invite pages
    // (/p/[slug] must stay reachable with zero auth, per spec §5.1) —
    // everything else gets a session refresh.
    '/((?!_next/static|_next/image|favicon.ico|api/og|p/).*)',
  ],
};
