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
