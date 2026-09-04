import {
  groupCreateInputSchema,
  groupIdInputSchema,
  groupJoinByCodeInputSchema,
  type Group,
  type GroupSummary,
  type GroupWithMembers,
} from '@overlap/shared';
import { TRPCError } from '@trpc/server';
import { and, eq, isNull } from 'drizzle-orm';
import { isUniqueViolation } from '@/server/db/errors';
import { appUser, grp, groupMember } from '@/server/db/schema';
import { generateJoinCode } from '@/server/services/joinCode';
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

  listMine: protectedProcedure.query(async ({ ctx }): Promise<GroupSummary[]> => {
    const db = ctx.db();

    return db
      .select({ id: grp.id, name: grp.name, avatarUrl: grp.avatarUrl })
      .from(groupMember)
      .innerJoin(grp, eq(groupMember.groupId, grp.id))
      .where(and(eq(groupMember.userId, ctx.user.id), isNull(grp.deletedAt)));
  }),
});
