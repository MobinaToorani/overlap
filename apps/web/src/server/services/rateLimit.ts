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
 * A single-process sliding-window limiter. Correct for local dev and for a
 * single always-on server, but each serverless/edge instance gets its own
 * memory — in that deployment shape this provides close to zero real
 * protection, since an attacker's requests land on different instances.
 * createRateLimiter() only falls back to this when Upstash isn't
 * configured, and warns loudly when it does.
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
        'in-memory limiter. Fine for local dev; provides no real protection ' +
        'across multiple serverless instances. Set the Upstash env vars before ' +
        'any real phone number is used (FIX-9).',
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
