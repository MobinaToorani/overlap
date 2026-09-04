/**
 * FIX-9, wired end to end with the REAL rateLimiters module — not the fake
 * limiters the other router tests inject. Those prove the router reacts
 * correctly to a limiter that says no; this proves a limiter is actually
 * attached to the real procedure and counts real requests.
 *
 * Worth its own file because the two failure modes look identical from the
 * outside: a correctly-wired limiter and a completely absent one both
 * return success for the first three requests. Verified on 2026-09-04 that
 * this passes in-process while the same sequence against `next dev` did
 * NOT throttle — see rateLimit.ts's warning for why that isn't a
 * contradiction.
 */
import { describe, expect, it, vi } from 'vitest';
import { appRouter } from '@/server/trpc/routers/_app';
import { getRateLimiters } from '@/server/services/rateLimiters';
import type { Context } from '@/server/trpc/context';

describe('FIX-9 wiring with the REAL rateLimiters module', () => {
  it('trips TOO_MANY_REQUESTS on the 4th request for one phone', async () => {
    const supabaseAuth = { signInWithOtp: vi.fn().mockResolvedValue({ error: null }) };
    const rateLimiters = await getRateLimiters();

    const ctx = {
      supabase: { auth: supabaseAuth } as unknown as Context['supabase'],
      user: null,
      db: (() => { throw new Error('db not needed'); }) as unknown as Context['db'],
      rateLimiters,
      ip: '203.0.113.9',
    } as Context;

    const caller = appRouter.createCaller(ctx);
    const codes: string[] = [];
    for (let i = 0; i < 4; i++) {
      try {
        await caller.auth.requestOtp({ phone: '+15195550888' });
        codes.push('OK');
      } catch (e) {
        codes.push((e as { code: string }).code);
      }
    }
    console.log('OUTCOMES:', codes.join(', '));
    expect(codes.slice(0, 3)).toEqual(['OK', 'OK', 'OK']);
    expect(codes[3]).toBe('TOO_MANY_REQUESTS');
    expect(supabaseAuth.signInWithOtp).toHaveBeenCalledTimes(3); // 4th never reached Supabase
  });
});
