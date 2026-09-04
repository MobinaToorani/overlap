import { requestOtpInputSchema, verifyOtpInputSchema } from '@overlap/shared';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, publicProcedure } from '../trpc';

/**
 * engineering-spec.md §5. FIX-1 (app_user creation on a verified OTP) is
 * NOT handled here — it's a DB trigger on auth.users
 * (src/server/db/sql/0002_create_app_user_on_signup.sql), per the spec's
 * own suggestion ("in an after-insert trigger on auth.users, or in the OTP
 * verify handler"). The trigger was chosen so app_user creation can never
 * be skipped by a future second code path (worker backfill, admin tool)
 * that verifies a user some other way — see that file's doc comment.
 */
export const authRouter = createTRPCRouter({
  requestOtp: publicProcedure.input(requestOtpInputSchema).mutation(async ({ ctx, input }) => {
    // FIX-9: both limits apply — either one tripping blocks the send.
    const [phoneResult, ipResult] = await Promise.all([
      ctx.rateLimiters.otpRequestByPhone.check(input.phone),
      ctx.rateLimiters.otpRequestByIp.check(ctx.ip),
    ]);
    if (!phoneResult.allowed || !ipResult.allowed) {
      throw new TRPCError({
        code: 'TOO_MANY_REQUESTS',
        message: 'Too many codes requested. Try again later.',
      });
    }

    const { error } = await ctx.supabase.auth.signInWithOtp({ phone: input.phone });
    if (error) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: error.message });
    }

    return { ok: true as const };
  }),

  verifyOtp: publicProcedure.input(verifyOtpInputSchema).mutation(async ({ ctx, input }) => {
    // Not in engineering-spec.md's rate-limit table, but unlimited guesses
    // at a 6-digit code is its own abuse vector — see rateLimiters.ts.
    const { allowed } = await ctx.rateLimiters.otpVerifyByPhone.check(input.phone);
    if (!allowed) {
      throw new TRPCError({
        code: 'TOO_MANY_REQUESTS',
        message: 'Too many attempts. Request a new code.',
      });
    }

    const { data, error } = await ctx.supabase.auth.verifyOtp({
      phone: input.phone,
      token: input.code,
      type: 'sms',
    });
    if (error || !data.session) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: error?.message ?? 'That code is invalid or expired.',
      });
    }

    return { session: data.session };
  }),
});
