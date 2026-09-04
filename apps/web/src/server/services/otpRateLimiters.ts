import { createRateLimiter } from './rateLimit';

/**
 * Module-scope singletons, per engineering-spec.md §5.2's table: 3/hour per
 * phone, 10/hour per IP for requestOtp. Created once when this module first
 * loads (a server instance's lifetime), not per-request — recreating the
 * Upstash client on every tRPC call would be needless per-request setup
 * cost for something meant to be reused.
 */
const requestByPhone = createRateLimiter({ name: 'otp-request-by-phone', limit: 3, windowSeconds: 60 * 60 });
const requestByIp = createRateLimiter({ name: 'otp-request-by-ip', limit: 10, windowSeconds: 60 * 60 });

/**
 * Not in engineering-spec.md §5.2's table — that table only covers
 * requestOtp. But verifyOtp checks a 6-digit code, and with no limit of our
 * own an attacker could brute-force it (1-in-a-million odds per guess get
 * a lot less reassuring at automated request rates). Whether Supabase's own
 * GoTrue service separately caps verification attempts isn't something to
 * assume without checking — cheap enough to cap here too rather than rely
 * on an unverified assumption about a third party's internal behaviour.
 * 10/hour per phone comfortably covers "fat-fingered the code twice."
 */
const verifyByPhone = createRateLimiter({ name: 'otp-verify-by-phone', limit: 10, windowSeconds: 60 * 60 });

export async function getOtpRateLimiters() {
  return {
    requestByPhone: await requestByPhone,
    requestByIp: await requestByIp,
    verifyByPhone: await verifyByPhone,
  };
}
