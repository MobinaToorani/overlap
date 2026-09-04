import { describe, expect, it, vi } from 'vitest';
import { createInMemoryRateLimiter } from '@/server/services/rateLimit';

describe('createInMemoryRateLimiter', () => {
  it('allows requests up to the limit, then blocks within the window', async () => {
    const limiter = createInMemoryRateLimiter({ limit: 3, windowMs: 60_000 });

    expect((await limiter.check('a')).allowed).toBe(true);
    expect((await limiter.check('a')).allowed).toBe(true);
    expect((await limiter.check('a')).allowed).toBe(true);
    expect((await limiter.check('a')).allowed).toBe(false); // 4th call, over the limit of 3
  });

  it('tracks each key independently', async () => {
    const limiter = createInMemoryRateLimiter({ limit: 1, windowMs: 60_000 });

    expect((await limiter.check('phone-a')).allowed).toBe(true);
    expect((await limiter.check('phone-b')).allowed).toBe(true); // different key, unaffected by 'phone-a'
    expect((await limiter.check('phone-a')).allowed).toBe(false);
  });

  it('allows again once the window has elapsed', async () => {
    vi.useFakeTimers();
    try {
      const limiter = createInMemoryRateLimiter({ limit: 1, windowMs: 1000 });
      expect((await limiter.check('a')).allowed).toBe(true);
      expect((await limiter.check('a')).allowed).toBe(false);

      vi.advanceTimersByTime(1001);
      expect((await limiter.check('a')).allowed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
