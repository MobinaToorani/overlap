import { createRateLimiter } from './rateLimit';

/**
 * Module-scope singletons, per engineering-spec.md §5.2's table: 3/hour per
 * phone, 10/hour per IP. Created once when this module first loads (a
 * server instance's lifetime), not per-request — recreating the Upstash
 * client on every tRPC call would be needless per-request setup cost for
 * something meant to be reused.
 */
const byPhone = createRateLimiter({ name: 'otp-by-phone', limit: 3, windowSeconds: 60 * 60 });
const byIp = createRateLimiter({ name: 'otp-by-ip', limit: 10, windowSeconds: 60 * 60 });

export async function getOtpRateLimiters() {
  return { byPhone: await byPhone, byIp: await byIp };
}
