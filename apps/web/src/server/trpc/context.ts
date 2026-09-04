import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getOtpRateLimiters } from '@/server/services/otpRateLimiters';

export async function createTRPCContext(opts: { headers: Headers }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return {
    supabase,
    user,
    otpRateLimiters: await getOtpRateLimiters(),
    // FIX-9 needs a per-IP key too. Vercel (and most proxies) set
    // x-forwarded-for; fall back to a constant locally so the by-phone
    // limiter is still exercisable in dev without a real proxy in front.
    ip: opts.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local',
  };
}

export type Context = Awaited<ReturnType<typeof createTRPCContext>>;
