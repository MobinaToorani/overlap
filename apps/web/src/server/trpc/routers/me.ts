import { meUpdateProfileInputSchema, type UserProfile } from '@overlap/shared';
import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';
import { appUser } from '@/server/db/schema';
import { needsDisplayName } from '@/server/services/profile';
import { createTRPCRouter, protectedProcedure } from '../trpc';

/**
 * engineering-spec.md §5's `me.*`. `me.updateProfile` was specified from
 * the start and never built, which is half of coherence-audit finding
 * X-12: `display_name` is NOT NULL, FIX-1's trigger seeds a placeholder,
 * and until this ticket nothing in T1-T25 ever collected a real one. A
 * pilot group would have been seven people called "New member".
 *
 * `me.get` is NOT in §5's list, the same way `group.listMine` isn't. The
 * client has to know whether to ask for a name before it can ask, and no
 * other procedure answers that — the session carries an auth user, not an
 * app_user row. This fills a real gap rather than adding speculative
 * surface.
 *
 * The rest of §5's me.* (notificationPrefs, exportData, deleteAccount)
 * belong to T22 and are not here.
 */
export const meRouter = createTRPCRouter({
  get: protectedProcedure.query(async ({ ctx }): Promise<UserProfile> => {
    const db = ctx.db();

    const [row] = await db
      .select({
        id: appUser.id,
        displayName: appUser.displayName,
        avatarUrl: appUser.avatarUrl,
        timezone: appUser.timezone,
      })
      .from(appUser)
      .where(eq(appUser.id, ctx.user.id))
      .limit(1);

    // A valid session whose app_user row is missing means FIX-1's trigger
    // didn't fire for this account. Failing loudly is right: the
    // alternative is inventing a profile the database doesn't have, and
    // every group query downstream joins against that row.
    if (!row) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'No profile for this account.' });
    }

    return { ...row, needsDisplayName: needsDisplayName(row.displayName) };
  }),

  updateProfile: protectedProcedure
    .input(meUpdateProfileInputSchema)
    .mutation(async ({ ctx, input }): Promise<UserProfile> => {
      const db = ctx.db();

      // Only the keys actually sent — a partial update must not blank the
      // field the caller left out, and Drizzle would happily write
      // `undefined` as NULL into a NOT NULL column.
      const patch: Partial<{ displayName: string; timezone: string }> = {};
      if (input.displayName !== undefined) patch.displayName = input.displayName;
      if (input.timezone !== undefined) patch.timezone = input.timezone;

      const [row] = await db
        .update(appUser)
        .set(patch)
        // Scoped to the caller's own id, which is the whole authorization
        // check: there is no path here that takes a user id as input.
        .where(eq(appUser.id, ctx.user.id))
        .returning({
          id: appUser.id,
          displayName: appUser.displayName,
          avatarUrl: appUser.avatarUrl,
          timezone: appUser.timezone,
        });

      if (!row) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'No profile for this account.' });
      }

      return { ...row, needsDisplayName: needsDisplayName(row.displayName) };
    }),
});
