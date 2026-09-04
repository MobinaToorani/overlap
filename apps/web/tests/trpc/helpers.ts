import type { Context } from '@/server/trpc/context';
import type { RateLimiter } from '@/server/services/rateLimit';
import { vi } from 'vitest';

const alwaysAllow: RateLimiter = { check: async () => ({ allowed: true }) };

export function fakeSupabaseAuth() {
  return {
    signInWithOtp: vi.fn(),
    verifyOtp: vi.fn(),
    getUser: vi.fn(),
  };
}

/** A tRPC Context built from test doubles — no cookies(), no env, no network.
 * The auth router only ever touches ctx.supabase.auth.* and
 * ctx.otpRateLimiters.*, so those are the only two things worth faking;
 * everything else is cast through `unknown` rather than stubbed field by
 * field. */
export function createTestContext(overrides: {
  supabaseAuth?: ReturnType<typeof fakeSupabaseAuth>;
  byPhone?: RateLimiter;
  byIp?: RateLimiter;
  user?: Context['user'];
  ip?: string;
} = {}): Context {
  const supabaseAuth = overrides.supabaseAuth ?? fakeSupabaseAuth();

  return {
    supabase: { auth: supabaseAuth } as unknown as Context['supabase'],
    user: overrides.user ?? null,
    otpRateLimiters: {
      byPhone: overrides.byPhone ?? alwaysAllow,
      byIp: overrides.byIp ?? alwaysAllow,
    },
    ip: overrides.ip ?? '127.0.0.1',
  };
}
