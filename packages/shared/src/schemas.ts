/**
 * zod schemas mirroring ./types.ts. Every tRPC procedure validates input
 * with one of these (working agreement: "every tRPC procedure validates
 * input with zod").
 */
import { z } from 'zod';
import { NIGHT_STATES, VIBES } from './types';

export const vibeSchema = z.enum(VIBES);
export const nightStateSchema = z.enum(NIGHT_STATES);
export const horizonWeekSchema = z.union([z.literal(0), z.literal(1), z.literal(2)]);

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected an ISO date (YYYY-MM-DD)');

export const signalNightSchema = z.object({
  date: isoDateSchema,
  state: nightStateSchema,
  horizonWeek: horizonWeekSchema,
  writtenBy: z.enum(['user', 'sync']),
});

export const signalSubmitInputSchema = z.object({
  vibe: vibeSchema,
  nights: z
    .array(
      z.object({
        date: isoDateSchema,
        // The client may only ever assert these two states; 'blocked' and
        // the 'sync' writer are server/worker-only (INV-1).
        state: z.enum(['confirmed_free', 'blocked']),
      }),
    )
    .max(21),
  note: z.string().max(140).optional(),
  groupId: z.string().uuid().optional(), // omitted = global signal
});

export const memberSchema = z.object({
  userId: z.string().uuid(),
  displayName: z.string().min(1),
  timezone: z.string().min(1),
});

// auth.* — engineering-spec.md §5. E.164: a leading '+', country code, up to
// 15 digits total, no punctuation — the exact shape Supabase's phone auth
// and Twilio both expect, so validating it here instead of trusting the
// client saves both of them from ever seeing a malformed number.
export const phoneE164Schema = z
  .string()
  .regex(/^\+[1-9]\d{1,14}$/, 'expected an E.164 phone number, e.g. +15195551234');

export const requestOtpInputSchema = z.object({
  phone: phoneE164Schema,
});

export const verifyOtpInputSchema = z.object({
  phone: phoneE164Schema,
  code: z.string().regex(/^\d{6}$/, 'expected a 6-digit code'),
});
