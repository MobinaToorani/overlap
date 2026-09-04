import { getDb } from '@/server/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getRateLimiters } from '@/server/services/rateLimiters';

export async function createTRPCContext(opts: { headers: Headers }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return {
    supabase,
    user,
    // A function reference, not `getDb()` invoked here — getDb() throws if
    // DATABASE_URL isn't set, and most procedures (all of auth.*) never
    // touch the database at all. Eagerly calling it on every request would
    // make every tRPC call require DATABASE_URL even when unused.
    // Procedures that need it call `ctx.db()`; it's a cheap memoized
    // singleton after the first real call. See server/db/index.ts.
    db: getDb,
    rateLimiters: await getRateLimiters(),
    // FIX-9/§5.2 need a per-IP key. Vercel (and most proxies) set
    // x-forwarded-for; fall back to a constant locally so IP-keyed limiters
    // are still exercisable in dev without a real proxy in front.
    ip: opts.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local',
  };
}

export type Context = Awaited<ReturnType<typeof createTRPCContext>>;
