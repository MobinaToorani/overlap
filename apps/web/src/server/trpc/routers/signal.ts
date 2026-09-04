import { HORIZON_WEEKS, signalSubmitInputSchema } from '@overlap/shared';
import { TRPCError } from '@trpc/server';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { appUser, signal, signalNight } from '@/server/db/schema';
import {
  horizonWeekFor,
  localDateInTimeZone,
  weekStartFor,
} from '@/lib/dateUtils';
import { createTRPCRouter, protectedProcedure } from '../trpc';

/**
 * engineering-spec.md §5's signal.* surface. signal.getDraft (pre-fill from
 * busy_block and the prior week) is T10, deliberately not here — T6 builds
 * the grid, T10 pre-fills it.
 *
 * INV-1 lives here more than anywhere else in the app: this is the only
 * code path in the product permitted to write `confirmed_free`, and it may
 * only do so because a human tapped a night. The server — never the
 * client — sets `written_by` and `confirmed_at`; the client's input schema
 * can't even express any other night state (see signalSubmitInputSchema).
 * The database enforces the same thing independently via
 * guard_confirmed_free, so this code being wrong is caught rather than
 * trusted.
 */
export const signalRouter = createTRPCRouter({
  /**
   * §5 specifies `signal.getCurrent () → Signal | null`. This returns an
   * envelope — `{ weekStartDate, signal }` — instead, because the client
   * needs the week anchor even when no signal exists yet: the three weeks
   * of night pills have to be exactly the three weeks the server will
   * accept, and the server derives those from app_user.timezone, which the
   * browser has no way to know. Letting the client guess its own week start
   * would mean a user near midnight, or with a device timezone differing
   * from their profile, silently rendering dates their own submission would
   * then be rejected for.
   */
  getCurrent: protectedProcedure.query(async ({ ctx }) => {
    const db = ctx.db();
    const weekStartDate = await currentWeekStartFor(db, ctx.user.id);

    const [row] = await db
      .select()
      .from(signal)
      .where(
        and(
          eq(signal.userId, ctx.user.id),
          eq(signal.weekStartDate, weekStartDate),
          isNull(signal.groupId), // the global signal — Rule 3's default
        ),
      )
      .limit(1);
    if (!row) return { weekStartDate, signal: null };

    const nights = await db
      .select({
        date: signalNight.date,
        state: signalNight.state,
        horizonWeek: signalNight.horizonWeek,
      })
      .from(signalNight)
      .where(eq(signalNight.signalId, row.id));

    return {
      weekStartDate,
      signal: {
        id: row.id,
        vibe: row.vibe,
        note: row.note,
        // Converted at this boundary because SignalWithNights types
        // submittedAt as an ISO string while Drizzle hands back a Date.
        // resolveSignals parses it either way, but doing the conversion in
        // exactly one place keeps the shared type honest.
        submittedAt: row.submittedAt.toISOString(),
        nights,
      },
    };
  }),

  submit: protectedProcedure.input(signalSubmitInputSchema).mutation(async ({ ctx, input }) => {
    if (input.groupId) {
      // Per-group overrides exist in the data model (signal.group_id) and
      // in master doc §2.2's Rule 3, but they are explicitly "opt-in and
      // never prompted" — nothing in the product surfaces one yet. Writing
      // one would mean a second, untested upsert path against a different
      // partial unique index, so this refuses rather than quietly taking it.
      throw new TRPCError({
        code: 'NOT_IMPLEMENTED',
        message: 'Per-group signal overrides are not built yet.',
      });
    }

    const db = ctx.db();
    const weekStart = await currentWeekStartFor(db, ctx.user.id);

    // A night outside this signal's own three weeks would violate
    // signal_night's horizon_week CHECK at the database anyway; rejecting
    // here turns a constraint violation into a comprehensible error.
    for (const night of input.nights) {
      const week = horizonWeekFor(weekStart, night.date);
      if (week < 0 || week >= HORIZON_WEEKS) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `${night.date} is outside the three-week horizon for this signal.`,
        });
      }
    }

    const submittedAt = new Date();

    return db.transaction(async (tx) => {
      // Re-submitting replaces this week's signal rather than erroring:
      // changing your mind mid-week is normal use, and INV-8's partial
      // unique index would otherwise reject the second submission
      // outright. The conflict target must repeat the index's own WHERE
      // clause for Postgres to match the partial index.
      const [row] = await tx
        .insert(signal)
        .values({
          userId: ctx.user.id,
          groupId: null,
          weekStartDate: weekStart,
          vibe: input.vibe,
          note: input.note ?? null,
          submittedAt,
        })
        .onConflictDoUpdate({
          target: [signal.userId, signal.weekStartDate],
          targetWhere: sql`${signal.groupId} is null`,
          set: { vibe: input.vibe, note: input.note ?? null, submittedAt },
        })
        .returning();
      if (!row) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      }

      // Replace the night set wholesale. An untapped night is an absence,
      // not a stored 'blocked' row, so leaving previous rows behind would
      // silently keep availability the user just cleared.
      await tx.delete(signalNight).where(eq(signalNight.signalId, row.id));

      if (input.nights.length > 0) {
        await tx.insert(signalNight).values(
          input.nights.map((night) => ({
            signalId: row.id,
            date: night.date,
            state: night.state,
            horizonWeek: horizonWeekFor(weekStart, night.date),
            // INV-1: both of these are the server's to set. guard_confirmed_free
            // rejects a confirmed_free row whose confirmed_at is null, and
            // rejects any writer that isn't 'user'.
            confirmedAt: night.state === 'confirmed_free' ? submittedAt : null,
            writtenBy: 'user' as const,
          })),
        );
      }

      return {
        id: row.id,
        weekStartDate: row.weekStartDate,
        vibe: row.vibe,
        note: row.note,
        submittedAt: row.submittedAt.toISOString(),
      };
    });
  }),
});

/**
 * The Sunday that starts the signal week *for this user* — computed from
 * their own timezone, not the server's. Someone signalling at 9pm Saturday
 * in Toronto is still in a different week from someone doing it at the same
 * instant in Tokyo, and week_start_date is what INV-8's uniqueness is keyed
 * on, so getting this wrong would let one person hold two signals for what
 * they experience as one week.
 */
async function currentWeekStartFor(
  db: ReturnType<import('@/server/trpc/context').Context['db']>,
  userId: string,
): Promise<string> {
  const [user] = await db
    .select({ timezone: appUser.timezone })
    .from(appUser)
    .where(eq(appUser.id, userId))
    .limit(1);
  if (!user) {
    // The app_user row is created by a trigger when auth.users gains a row
    // (FIX-1), so a valid session without one means that trigger didn't run.
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'No app_user row for this session.',
    });
  }

  return weekStartFor(localDateInTimeZone(new Date(), user.timezone));
}
