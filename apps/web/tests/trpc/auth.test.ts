/**
 * Unit tests for the auth router's own logic — rate-limit gating (FIX-9)
 * and error mapping — using a fake Supabase client and fake rate limiters
 * injected via context. What these deliberately do NOT cover: whether
 * Supabase's phone-OTP flow itself works end to end, or whether FIX-1's DB
 * trigger actually creates an app_user row. Those need a live Supabase
 * project (see docs/backlog.md's T3 entry) — not something a unit test can
 * honestly claim to verify.
 */
import { TRPCError } from '@trpc/server';
import { describe, expect, it } from 'vitest';
import { appRouter } from '@/server/trpc/routers/_app';
import { createTestContext, fakeSupabaseAuth } from './helpers';

describe('auth.requestOtp', () => {
  it('calls Supabase signInWithOtp and returns ok when under the rate limit', async () => {
    const supabaseAuth = fakeSupabaseAuth();
    supabaseAuth.signInWithOtp.mockResolvedValue({ error: null });
    const caller = appRouter.createCaller(createTestContext({ supabaseAuth }));

    const result = await caller.auth.requestOtp({ phone: '+15195551234' });

    expect(result).toEqual({ ok: true });
    expect(supabaseAuth.signInWithOtp).toHaveBeenCalledWith({ phone: '+15195551234' });
  });

  it('rejects with TOO_MANY_REQUESTS and never calls Supabase when the per-phone limit is tripped', async () => {
    const supabaseAuth = fakeSupabaseAuth();
    const caller = appRouter.createCaller(
      createTestContext({
        supabaseAuth,
        otpRequestByPhone: { check: async () => ({ allowed: false }) },
      }),
    );

    await expect(caller.auth.requestOtp({ phone: '+15195551234' })).rejects.toMatchObject({
      code: 'TOO_MANY_REQUESTS',
    } satisfies Partial<TRPCError>);
    expect(supabaseAuth.signInWithOtp).not.toHaveBeenCalled();
  });

  it('rejects with TOO_MANY_REQUESTS when the per-IP limit is tripped, even if the per-phone limit is fine', async () => {
    const supabaseAuth = fakeSupabaseAuth();
    const caller = appRouter.createCaller(
      createTestContext({
        supabaseAuth,
        otpRequestByIp: { check: async () => ({ allowed: false }) },
      }),
    );

    await expect(caller.auth.requestOtp({ phone: '+15195551234' })).rejects.toMatchObject({
      code: 'TOO_MANY_REQUESTS',
    });
  });

  it('maps a Supabase error to BAD_REQUEST', async () => {
    const supabaseAuth = fakeSupabaseAuth();
    supabaseAuth.signInWithOtp.mockResolvedValue({ error: { message: 'invalid phone' } });
    const caller = appRouter.createCaller(createTestContext({ supabaseAuth }));

    await expect(caller.auth.requestOtp({ phone: '+15195551234' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('rejects a malformed phone before ever reaching Supabase (zod)', async () => {
    const supabaseAuth = fakeSupabaseAuth();
    const caller = appRouter.createCaller(createTestContext({ supabaseAuth }));

    await expect(caller.auth.requestOtp({ phone: 'not-a-phone' })).rejects.toThrow();
    expect(supabaseAuth.signInWithOtp).not.toHaveBeenCalled();
  });
});

describe('auth.verifyOtp', () => {
  it('returns the session on a valid code', async () => {
    const supabaseAuth = fakeSupabaseAuth();
    const session = { access_token: 'a', refresh_token: 'b' };
    supabaseAuth.verifyOtp.mockResolvedValue({ data: { session }, error: null });
    const caller = appRouter.createCaller(createTestContext({ supabaseAuth }));

    const result = await caller.auth.verifyOtp({ phone: '+15195551234', code: '123456' });

    expect(result).toEqual({ session });
    expect(supabaseAuth.verifyOtp).toHaveBeenCalledWith({
      phone: '+15195551234',
      token: '123456',
      type: 'sms',
    });
  });

  it('rejects with UNAUTHORIZED on an invalid or expired code', async () => {
    const supabaseAuth = fakeSupabaseAuth();
    supabaseAuth.verifyOtp.mockResolvedValue({
      data: { session: null },
      error: { message: 'Token has expired or is invalid' },
    });
    const caller = appRouter.createCaller(createTestContext({ supabaseAuth }));

    await expect(
      caller.auth.verifyOtp({ phone: '+15195551234', code: '000000' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('rejects a code that is not 6 digits before reaching Supabase (zod)', async () => {
    const supabaseAuth = fakeSupabaseAuth();
    const caller = appRouter.createCaller(createTestContext({ supabaseAuth }));

    await expect(
      caller.auth.verifyOtp({ phone: '+15195551234', code: '123' }),
    ).rejects.toThrow();
    expect(supabaseAuth.verifyOtp).not.toHaveBeenCalled();
  });

  it('rejects with TOO_MANY_REQUESTS and never calls Supabase when verify attempts are exhausted', async () => {
    const supabaseAuth = fakeSupabaseAuth();
    const caller = appRouter.createCaller(
      createTestContext({
        supabaseAuth,
        otpVerifyByPhone: { check: async () => ({ allowed: false }) },
      }),
    );

    await expect(
      caller.auth.verifyOtp({ phone: '+15195551234', code: '123456' }),
    ).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' });
    expect(supabaseAuth.verifyOtp).not.toHaveBeenCalled();
  });
});
