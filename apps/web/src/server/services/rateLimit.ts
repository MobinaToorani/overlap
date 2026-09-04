/**
 * FIX-9 (engineering-spec.md §5.2): every unauthenticated route is an abuse
 * vector, and auth.requestOtp is a direct billing-attack vector — each call
 * sends a real, paid SMS. "Do not defer these to before launch."
 *
 * RateLimiter is a narrow interface so the auth router depends on
 * *behaviour*, not on Upstash specifically — tests inject an in-memory
 * fake via tRPC context (see trpc/context.ts) rather than mocking a module.
 */
export interface RateLimiter {
  /** Consumes one unit for `key` and reports whether it was under the limit. */
  check(key: string): Promise<{ allowed: boolean }>;
}

/**
 * A single-process sliding-window limiter. The algorithm is correct (see
 * its tests) but the *state* only lives as long as the module instance
 * holding it.
 *
 * Measured on 2026-09-04, this is weaker than "works on one server":
 * sending 10 OTP requests to `next dev` never throttled once, because the
 * module was re-instantiated underneath them and the counter reset each
 * time. The identical sequence throttles correctly in-process
 * (tests/trpc/rateLimitWiring.test.ts). On Vercel, where invocations are
 * separate instances by design, expect the same — which means this
 * fallback provides approximately no protection in any real deployment,
 * not merely degraded protection.
 *
 * It exists so local development works without an Upstash account. It is
 * not a production posture: FIX-9 is only genuinely satisfied once
 * UPSTASH_REDIS_REST_URL/TOKEN are set.
 */
export function createInMemoryRateLimiter(config: {
  limit: number;
  windowMs: number;
}): RateLimiter {
  const hits = new Map<string, number[]>();

  return {
    async check(key) {
      const now = Date.now();
      const windowStart = now - config.windowMs;
      const existing = hits.get(key) ?? [];
      const withinWindow = existing.filter((t) => t > windowStart);

      const allowed = withinWindow.length < config.limit;
      withinWindow.push(now);
      hits.set(key, withinWindow);

      return { allowed };
    },
  };
}

/**
 * Upstash-backed sliding-window limiter, shared correctly across
 * serverless/edge instances since the counters live in Redis, not process
 * memory. Falls back to the in-memory limiter (with a warning) when
 * UPSTASH_REDIS_REST_URL/TOKEN aren't set, so local dev works without an
 * Upstash account.
 */
export async function createRateLimiter(config: {
  name: string;
  limit: number;
  windowSeconds: number;
}): Promise<RateLimiter> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    console.warn(
      `[rateLimit:${config.name}] UPSTASH_REDIS_REST_URL/TOKEN not set — using an ` +
        'in-memory limiter. This does NOT reliably throttle anything: its ' +
        'counter resets whenever the module is re-instantiated, which is ' +
        'every request in some environments. Treat this endpoint as ' +
        'UNRATELIMITED until Upstash is configured — which must happen ' +
        'before Twilio is live, since each unthrottled OTP is a paid SMS (FIX-9).',
    );
    return createInMemoryRateLimiter({
      limit: config.limit,
      windowMs: config.windowSeconds * 1000,
    });
  }

  const [{ Redis }, { Ratelimit }] = await Promise.all([
    import('@upstash/redis'),
    import('@upstash/ratelimit'),
  ]);

  const ratelimit = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(config.limit, `${config.windowSeconds} s`),
    prefix: `overlap:ratelimit:${config.name}`,
  });

  return {
    async check(key) {
      const { success } = await ratelimit.limit(key);
      return { allowed: success };
    },
  };
}
