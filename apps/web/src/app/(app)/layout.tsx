import { requireUser } from '@/server/auth/requireUser';

// Every route under (app) needs a live session — never prerender/cache it
// statically. Without this, Next tries to statically render e.g. /me at
// build time, before it can discover (via cookies()) that the route is
// inherently dynamic, and the build fails on missing runtime env instead
// of just skipping static generation for this route group.
export const dynamic = 'force-dynamic';

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireUser(); // redirects to /login if unauthenticated
  return <>{children}</>;
}
