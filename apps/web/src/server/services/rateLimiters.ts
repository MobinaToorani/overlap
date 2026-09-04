import { createRateLimiter } from './rateLimit';

/**
 * Named, module-scope singletons for every rate-limited endpoint —
 * engineering-spec.md §5.2's table plus one addition (see verifyByPhone
 * below). Created once when this module first loads (a server instance's
 * lifetime), not per-request — recreating the Upstash client on every
 * tRPC call would be needless per-request setup cost for something meant
 * to be reused.
 */
const otpRequestByPhone = createRateLimiter({
  name: 'otp-request-by-phone',
  limit: 3,
  windowSeconds: 60 * 60,
});
const otpRequestByIp = createRateLimiter({
  name: 'otp-request-by-ip',
  limit: 10,
  windowSeconds: 60 * 60,
});

/**
 * Not in engineering-spec.md §5.2's table — that table only covers
 * requestOtp. But verifyOtp checks a 6-digit code, and with no limit of
 * our own an attacker could brute-force it. Whether Supabase's own GoTrue
 * service separately caps verification attempts isn't something to assume
 * without checking — cheap enough to cap here too rather than rely on an
 * unverified assumption about a third party's internal behaviour. 10/hour
 * per phone comfortably covers "fat-fingered the code twice."
 */
const otpVerifyByPhone = createRateLimiter({
  name: 'otp-verify-by-phone',
  limit: 10,
  windowSeconds: 60 * 60,
});

/** engineering-spec.md §5.2: "10/hour per IP — Prevents brute-forcing join codes." */
const groupJoinByIp = createRateLimiter({
  name: 'group-join-by-ip',
  limit: 10,
  windowSeconds: 60 * 60,
});

export async function getRateLimiters() {
  return {
    otpRequestByPhone: await otpRequestByPhone,
    otpRequestByIp: await otpRequestByIp,
    otpVerifyByPhone: await otpVerifyByPhone,
    groupJoinByIp: await groupJoinByIp,
  };
}
