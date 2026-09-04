import {
  groupCreateInputSchema,
  groupIdInputSchema,
  groupJoinByCodeInputSchema,
  type Group,
  type GroupOverlap,
  type GroupSummary,
  type GroupWithMembers,
  type HorizonWeek,
  type SignalWithNights,
  type WrittenBy,
} from '@overlap/shared';
import { TRPCError } from '@trpc/server';
import { and, eq, gte, inArray, isNull, or } from 'drizzle-orm';
import { isUniqueViolation } from '@/server/db/errors';
import { appUser, grp, groupMember, signal, signalNight } from '@/server/db/schema';
import { generateJoinCode } from '@/server/services/joinCode';
import { addDays, localDateInTimeZone, weekStartFor } from '@/lib/dateUtils';
import { computeOverlap } from '@/server/services/overlap';
import { resolveSignals } from '@/server/services/signals';
import { createTRPCRouter, protectedProcedure } from '../trpc';

const MAX_JOIN_CODE_ATTEMPTS = 5;

/**
 * engineering-spec.md §5. group.overlap (needs T6 signal data to mean
 * anything) and group.shareCard (A10, the cold-start artifact) are later
 * tickets — see routers/README.md.
 *
 * group.listMine is NOT in the spec's §5 list. The IA (§7.2, "Groups
 * (switcher, if >1)") requires the client to know which groups a user
 * belongs to, and nothing else in the API surface answers that — this
 * fills an actual gap rather than adding speculative surface.
 */
export const groupRouter = createTRPCRouter({
  create: protectedProcedure.input(groupCreateInputSchema).mutation(async ({ ctx, input }): Promise<Group> => {
    const db = ctx.db();

    for (let attempt = 0; attempt < MAX_JOIN_CODE_ATTEMPTS; attempt++) {
      const joinCode = generateJoinCode();
      try {
        return await db.transaction(async (tx) => {
          const [group] = await tx
            .insert(grp)
            .values({ name: input.name, createdBy: ctx.user.id, joinCode })
            .returning();
          if (!group) {
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
          }

          await tx.insert(groupMember).values({
            groupId: group.id,
            userId: ctx.user.id,
            role: 'admin', // the founder — engineering-spec.md §3's member_role_t
          });

          return {
            id: group.id,
            name: group.name,
            avatarUrl: group.avatarUrl,
            joinCode: group.joinCode,
            createdAt: group.createdAt,
          };
        });
      } catch (err) {
        if (isUniqueViolation(err)) continue; // join_code collision — vanishingly rare at 32^12, but retry rather than fail a user's group creation on it
        throw err;
      }
    }

    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Could not generate a unique join code. Try again.',
    });
  }),

  joinByCode: protectedProcedure
    .input(groupJoinByCodeInputSchema)
    .mutation(async ({ ctx, input }): Promise<Group> => {
      // engineering-spec.md §5.2: 10/hour per IP, to prevent brute-forcing
      // join codes.
      const { allowed } = await ctx.rateLimiters.groupJoinByIp.check(ctx.ip);
      if (!allowed) {
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: 'Too many attempts. Try again later.',
        });
      }

      const db = ctx.db();
      const normalizedCode = input.joinCode.toUpperCase();

      const [group] = await db
        .select()
        .from(grp)
        .where(and(eq(grp.joinCode, normalizedCode), isNull(grp.deletedAt)))
        .limit(1);
      if (!group) {
        throw new TRPCError({ code: 'NOT_FOUND', message: "That code doesn't match a group." });
      }

      // Re-joining a group you're already in should succeed quietly, not
      // error — group_member's primary key (group_id, user_id) makes this
      // a plain conflict-do-nothing rather than a SELECT-then-INSERT race.
      await db.insert(groupMember).values({
        groupId: group.id,
        userId: ctx.user.id,
        role: 'member',
      }).onConflictDoNothing();

      return {
        id: group.id,
        name: group.name,
        avatarUrl: group.avatarUrl,
        joinCode: group.joinCode,
        createdAt: group.createdAt,
      };
    }),

  get: protectedProcedure.input(groupIdInputSchema).query(async ({ ctx, input }): Promise<GroupWithMembers> => {
    const db = ctx.db();

    const [group] = await db
      .select()
      .from(grp)
      .where(and(eq(grp.id, input.groupId), isNull(grp.deletedAt)))
      .limit(1);
    if (!group) {
      throw new TRPCError({ code: 'NOT_FOUND' });
    }

    // Privacy boundary: "a member of Group A cannot infer anything about
    // Group B" (master doc §10) — check membership with a cheap targeted
    // lookup BEFORE fetching the roster, not after, so an unauthorized
    // request never causes the (more expensive, joined) member query to
    // run at all.
    const [membership] = await db
      .select({ userId: groupMember.userId })
      .from(groupMember)
      .where(and(eq(groupMember.groupId, input.groupId), eq(groupMember.userId, ctx.user.id)))
      .limit(1);
    if (!membership) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Not a member of this group.' });
    }

    const members = await db
      .select({
        userId: appUser.id,
        displayName: appUser.displayName,
        avatarUrl: appUser.avatarUrl,
        role: groupMember.role,
        joinedAt: groupMember.joinedAt,
      })
      .from(groupMember)
      .innerJoin(appUser, eq(groupMember.userId, appUser.id))
      .where(eq(groupMember.groupId, input.groupId));

    return {
      id: group.id,
      name: group.name,
      avatarUrl: group.avatarUrl,
      joinCode: group.joinCode,
      createdAt: group.createdAt,
      members,
    };
  }),

  /**
   * §5's group.overlap. Reads signals, resolves them (§4.0), and runs the
   * engine — the read path the heatmap renders.
   *
   * Note this deliberately does no caching. §8.1 describes a Redis cache
   * per (group_id, week) invalidated on signal write, but that is the
   * overlap_precompute worker job (§6), not this ticket; adding an
   * ad-hoc cache here would make that job's invalidation contract harder
   * to get right later.
   */
  overlap: protectedProcedure.input(groupIdInputSchema).query(async ({ ctx, input }): Promise<GroupOverlap> => {
    const db = ctx.db();
    const now = new Date();

    // Same privacy boundary as group.get, checked before reading anything
    // about the group: availability is exactly the data master doc §10
    // promises never leaks between groups.
    const [membership] = await db
      // cadence_weeks rides along on the membership check rather than costing
      // a second round trip: resolveSignals derives its freshness windows
      // from it (FIX-13), so the engine can't be called without it.
      .select({ userId: groupMember.userId, cadenceWeeks: grp.cadenceWeeks })
      .from(groupMember)
      .innerJoin(grp, eq(grp.id, groupMember.groupId))
      .where(and(eq(groupMember.groupId, input.groupId), eq(groupMember.userId, ctx.user.id)))
      .limit(1);
    if (!membership) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Not a member of this group.' });
    }

    const members = await db
      .select({
        userId: appUser.id,
        displayName: appUser.displayName,
        timezone: appUser.timezone,
      })
      .from(groupMember)
      .innerJoin(appUser, eq(groupMember.userId, appUser.id))
      .where(eq(groupMember.groupId, input.groupId));

    if (members.length === 0) {
      return computeOverlap({
        groupId: input.groupId,
        members: [],
        resolved: new Map(),
        signalledUserIds: new Set(),
        today: now,
      });
    }

    const memberIds = members.map((m) => m.userId);
    // A signal covers 21 days from its week start, so anything older than
    // that can't touch today's horizon. Fetching by week_start_date rather
    // than by night date keeps this to one indexed range scan.
    const earliestRelevantWeek = weekStartFor(addDays(localDateInTimeZone(now, 'UTC'), -21));

    const rows = await db
      .select({
        id: signal.id,
        userId: signal.userId,
        groupId: signal.groupId,
        weekStartDate: signal.weekStartDate,
        vibe: signal.vibe,
        submittedAt: signal.submittedAt,
        nightDate: signalNight.date,
        nightState: signalNight.state,
        nightHorizonWeek: signalNight.horizonWeek,
        nightWrittenBy: signalNight.writtenBy,
      })
      .from(signal)
      // LEFT, not INNER. A signal with zero nights is a real and important
      // submission — "I'm slammed this week, nothing works" — and an inner
      // join drops it entirely. That would under-report signalledCount,
      // could drag a group back under the liveness floor even though
      // everyone signalled, and would under-count Signal Completion for
      // exactly the busiest members (the "Sam" persona in master doc §4.2).
      // Caught by the live end-to-end test, not by any unit test.
      .leftJoin(signalNight, eq(signalNight.signalId, signal.id))
      .where(
        and(
          inArray(signal.userId, memberIds),
          gte(signal.weekStartDate, earliestRelevantWeek),
          // Global signals, plus any override scoped to THIS group. Another
          // group's override must never leak in — resolveSignals filters
          // again, but not fetching it is cheaper and safer.
          or(isNull(signal.groupId), eq(signal.groupId, input.groupId)),
        ),
      );

    // Re-assemble the flat join into the engine's SignalWithNights shape.
    const signalsById = new Map<string, SignalWithNights>();
    for (const row of rows) {
      let entry = signalsById.get(row.id);
      if (!entry) {
        entry = {
          id: row.id,
          userId: row.userId,
          groupId: row.groupId,
          weekStartDate: row.weekStartDate,
          vibe: row.vibe,
          submittedAt: row.submittedAt.toISOString(),
          nights: [],
        };
        signalsById.set(row.id, entry);
      }
      // Null night columns mean the left join found a signal with no
      // nights — the signal still counts, it just contributes no dates.
      if (row.nightDate !== null && row.nightState !== null && row.nightHorizonWeek !== null) {
        entry.nights.push({
          date: row.nightDate,
          state: row.nightState,
          horizonWeek: row.nightHorizonWeek as HorizonWeek,
          writtenBy: row.nightWrittenBy as WrittenBy,
        });
      }
    }
    const signals = [...signalsById.values()];

    // "Signalled" means submitted a signal for the week the member is
    // currently living in — computed per member's own timezone, exactly as
    // signal.submit does, so someone near midnight isn't miscounted. See
    // computeOverlap's doc comment for why this can't be derived from the
    // resolved nights.
    const signalledUserIds = new Set<string>();
    for (const member of members) {
      const currentWeek = weekStartFor(localDateInTimeZone(now, member.timezone));
      const hasCurrent = signals.some(
        (s) => s.userId === member.userId && s.weekStartDate === currentWeek,
      );
      if (hasCurrent) signalledUserIds.add(member.userId);
    }

    return computeOverlap({
      groupId: input.groupId,
      members,
      resolved: resolveSignals({
        signals,
        groupId: input.groupId,
        now,
        cadenceWeeks: membership.cadenceWeeks,
      }),
      signalledUserIds,
      today: now,
    });
  }),

  listMine: protectedProcedure.query(async ({ ctx }): Promise<GroupSummary[]> => {
    const db = ctx.db();

    return db
      .select({ id: grp.id, name: grp.name, avatarUrl: grp.avatarUrl })
      .from(groupMember)
      .innerJoin(grp, eq(groupMember.groupId, grp.id))
      .where(and(eq(groupMember.userId, ctx.user.id), isNull(grp.deletedAt)));
  }),
});
