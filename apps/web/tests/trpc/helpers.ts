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

/** A minimal stand-in for Supabase's User type — real User has many more
 * required fields (aud, app_metadata, ...) that no router code here reads. */
export function fakeUser(id: string): NonNullable<Context['user']> {
  return { id } as unknown as NonNullable<Context['user']>;
}

/**
 * A tRPC Context built from test doubles — no cookies(), no env, no
 * network, no real database.
 *
 * `db` defaults to a vi.fn() that throws if called: most router tests here
 * only exercise the parts of a procedure that run *before* touching the
 * database (zod validation, rate-limit gating) and assert the db was never
 * reached — see group.test.ts's doc comment for why the actual query
 * logic (join/insert/transaction behavior) isn't faked and tested here.
 * Pass a real `db` fake only for a test that specifically needs one.
 */
export function createTestContext(overrides: {
  supabaseAuth?: ReturnType<typeof fakeSupabaseAuth>;
  db?: Context['db'];
  otpRequestByPhone?: RateLimiter;
  otpRequestByIp?: RateLimiter;
  otpVerifyByPhone?: RateLimiter;
  groupJoinByIp?: RateLimiter;
  user?: Context['user'];
  ip?: string;
} = {}): Context {
  const supabaseAuth = overrides.supabaseAuth ?? fakeSupabaseAuth();

  return {
    supabase: { auth: supabaseAuth } as unknown as Context['supabase'],
    user: overrides.user ?? null,
    db:
      overrides.db ??
      vi.fn(() => {
        throw new Error('ctx.db() was called but this test did not provide a db fake');
      }),
    rateLimiters: {
      otpRequestByPhone: overrides.otpRequestByPhone ?? alwaysAllow,
      otpRequestByIp: overrides.otpRequestByIp ?? alwaysAllow,
      otpVerifyByPhone: overrides.otpVerifyByPhone ?? alwaysAllow,
      groupJoinByIp: overrides.groupJoinByIp ?? alwaysAllow,
    },
    ip: overrides.ip ?? '127.0.0.1',
  };
}
