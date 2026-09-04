/**
 * The tests that only a real Postgres can run — everything pg-mem couldn't
 * reach (ADR-0006): the plpgsql guard triggers that enforce INV-1, FIX-1's
 * app_user-on-signup trigger, and the partial-index upsert target that
 * signal.submit depends on.
 *
 * Runs only when DATABASE_URL is set, so CI (which has no database) skips
 * the file rather than failing. Every write happens inside a transaction
 * that is deliberately rolled back, so running this against a real project
 * — including a production one — leaves nothing behind.
 */
import { config as loadEnv } from 'dotenv';
import postgres from 'postgres';
import { sql as sqlTag } from 'drizzle-orm';
import { afterAll, describe, expect, it, vi } from 'vitest';

loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

// Every test here is network-bound against a hosted database, and the
// multi-step ones make a dozen or more round trips. Vitest's 5s default is
// for pure functions; leaving it would make this file fail intermittently
// on latency alone, and a suite that cries wolf stops being read.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const DATABASE_URL = process.env.DATABASE_URL;
const sql = DATABASE_URL ? postgres(DATABASE_URL, { max: 1, onnotice: () => {} }) : null;

// File-scoped, not per-describe: the connection is shared across every
// describe here, so closing it inside one of them would end it while a
// later block is still running.
afterAll(async () => {
  await sql?.end();
});

/** Runs `fn` inside a transaction and always rolls it back. */
async function inRollback(fn: (tx: postgres.TransactionSql) => Promise<void>) {
  const ROLLBACK = Symbol('rollback');
  try {
    await sql!.begin(async (tx) => {
      await fn(tx);
      throw ROLLBACK; // postgres.js rolls back when the callback throws
    });
  } catch (err) {
    if (err !== ROLLBACK) throw err;
  }
}

/** A user, its app_user row, and a signal — the FK chain most tests need. */
async function seedUser(tx: postgres.TransactionSql) {
  const [row] = await tx<{ id: string }[]>`
    INSERT INTO auth.users (id, instance_id, aud, role, email, phone, created_at, updated_at)
    VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated',
            'authenticated', NULL, '+15195550199', now(), now())
    RETURNING id
  `;
  return row!.id;
}

describe.skipIf(!DATABASE_URL)('live Postgres', () => {
  it('applied the full schema', async () => {
    const rows = await sql!`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' ORDER BY table_name
    `;
    const names = rows.map((r) => r.table_name);
    for (const expected of [
      'app_user', 'busy_block', 'calendar_connection', 'group_member', 'grp',
      'message', 'notification_log', 'plan', 'poke', 'rsvp', 'signal',
      'signal_night', 'someday_item',
    ]) {
      expect(names).toContain(expected);
    }
  });

  it('installed the INV-1 guard trigger', async () => {
    const rows = await sql!`
      SELECT tgname FROM pg_trigger
      WHERE NOT tgisinternal AND tgrelid = 'public.signal_night'::regclass
    `;
    expect(rows.map((r) => r.tgname)).toContain('trg_guard_confirmed_free');
  });

  it('FIX-1: inserting an auth.users row creates exactly one app_user row', async () => {
    await inRollback(async (tx) => {
      const userId = await seedUser(tx);
      const rows = await tx`SELECT id, phone_e164 FROM app_user WHERE id = ${userId}`;
      expect(rows).toHaveLength(1);
      expect(rows[0]!.phone_e164).toBe('+15195550199');
    });
  });

  it('OV-6: sync may not write confirmed_free', async () => {
    // The test engineering-spec.md §4 lists as mandatory and that has been
    // an it.todo since T2 for want of a database.
    await inRollback(async (tx) => {
      const userId = await seedUser(tx);
      const [created] = await tx<{ id: string }[]>`
        INSERT INTO signal (user_id, week_start_date, vibe)
        VALUES (${userId}, '2026-09-06', 'low_key') RETURNING id
      `;
      const signalId = created!.id;

      await expect(
        tx`
          INSERT INTO signal_night (signal_id, date, state, horizon_week, confirmed_at, written_by)
          VALUES (${signalId}, '2026-09-07', 'confirmed_free', 0, now(), 'sync')
        `,
      ).rejects.toThrow(/INV-1/);
    });
  });

  it('INV-1: confirmed_free without confirmed_at is rejected even from a user', async () => {
    await inRollback(async (tx) => {
      const userId = await seedUser(tx);
      const [created] = await tx<{ id: string }[]>`
        INSERT INTO signal (user_id, week_start_date, vibe)
        VALUES (${userId}, '2026-09-06', 'low_key') RETURNING id
      `;
      const signalId = created!.id;

      await expect(
        tx`
          INSERT INTO signal_night (signal_id, date, state, horizon_week, confirmed_at, written_by)
          VALUES (${signalId}, '2026-09-07', 'confirmed_free', 0, NULL, 'user')
        `,
      ).rejects.toThrow(/INV-1/);
    });
  });

  it('INV-1: a user-tapped confirmed_free night is accepted — the guard blocks sync, not people', async () => {
    await inRollback(async (tx) => {
      const userId = await seedUser(tx);
      const [created] = await tx<{ id: string }[]>`
        INSERT INTO signal (user_id, week_start_date, vibe)
        VALUES (${userId}, '2026-09-06', 'low_key') RETURNING id
      `;
      const signalId = created!.id;
      const rows = await tx`
        INSERT INTO signal_night (signal_id, date, state, horizon_week, confirmed_at, written_by)
        VALUES (${signalId}, '2026-09-07', 'confirmed_free', 0, now(), 'user')
        RETURNING id
      `;
      expect(rows).toHaveLength(1);
    });
  });

  it("signal.submit's upsert conflict target matches INV-8's partial index", async () => {
    // pg-mem cannot parse `ON CONFLICT (...) WHERE ...` at all, so this
    // spent T6 as an it.todo. It is exactly the kind of statement that
    // compiles fine and fails only against a real server.
    await inRollback(async (tx) => {
      const userId = await seedUser(tx);
      await tx`
        INSERT INTO signal (user_id, group_id, week_start_date, vibe)
        VALUES (${userId}, NULL, '2026-09-06', 'low_key')
      `;
      await tx`
        INSERT INTO signal (user_id, group_id, week_start_date, vibe)
        VALUES (${userId}, NULL, '2026-09-06', 'down_for_anything')
        ON CONFLICT (user_id, week_start_date) WHERE group_id is null
        DO UPDATE SET vibe = 'down_for_anything'
      `;

      const rows = await tx`SELECT vibe FROM signal WHERE user_id = ${userId}`;
      expect(rows).toHaveLength(1); // updated, not duplicated
      expect(rows[0]!.vibe).toBe('down_for_anything');
    });
  });

  it('INV-8: a second global signal for the same week is rejected', async () => {
    await inRollback(async (tx) => {
      const userId = await seedUser(tx);
      await tx`
        INSERT INTO signal (user_id, group_id, week_start_date, vibe)
        VALUES (${userId}, NULL, '2026-09-06', 'low_key')
      `;
      await expect(
        tx`
          INSERT INTO signal (user_id, group_id, week_start_date, vibe)
          VALUES (${userId}, NULL, '2026-09-06', 'slammed')
        `,
      ).rejects.toThrow();
    });
  });
});

/**
 * Sprint 1's definition of done includes "two phones can OTP-login, one
 * creates a group, the other joins by code". The OTP half needs Twilio,
 * which doesn't exist yet — but the group half is our own code, and until
 * now it had never run against a real database (ADR-0006 explains why the
 * in-memory harness couldn't reach it).
 *
 * These drive the real tRPC procedures through the same createCaller path
 * the app uses, backed by a real Drizzle instance — so the transaction in
 * group.create, the innerJoin in group.get, and onConflictDoNothing in
 * joinByCode are all genuinely exercised. The whole thing runs inside one
 * outer transaction that gets rolled back; the router's own
 * db.transaction() nests as a savepoint inside it.
 */
describe.skipIf(!DATABASE_URL)('group + signal routers against live Postgres', () => {
  it('create → joinByCode → get → listMine, and a non-member is refused', async () => {
    const { drizzle } = await import('drizzle-orm/postgres-js');
    const schema = await import('@/server/db/schema');
    const { appRouter } = await import('@/server/trpc/routers/_app');
    const { createTestContext, fakeUser } = await import('../trpc/helpers');

    const db = drizzle(sql!, { schema });
    const ROLLBACK = Symbol('rollback');

    try {
      await db.transaction(async (tx) => {
        const seed = async (phone: string) => {
          const [row] = await tx.execute<{ id: string }>(
            sqlTag`INSERT INTO auth.users (id, instance_id, aud, role, phone, created_at, updated_at)
                   VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
                           'authenticated', 'authenticated', ${phone}, now(), now())
                   RETURNING id`,
          );
          return (row as unknown as { id: string }).id;
        };

        const alice = await seed('+15195550101');
        const bob = await seed('+15195550102');
        const carol = await seed('+15195550103');

        const callerFor = (userId: string) =>
          appRouter.createCaller(
            createTestContext({
              user: fakeUser(userId),
              db: (() => tx) as unknown as ReturnType<typeof createTestContext>['db'],
            }),
          );

        // Alice creates a group — exercises the real transaction + join code.
        const group = await callerFor(alice).group.create({ name: 'Live Test Crew' });
        expect(group.joinCode).toHaveLength(12);

        // Bob joins by code, lowercased, to prove normalization works live.
        const joined = await callerFor(bob).group.joinByCode({
          joinCode: group.joinCode.toLowerCase(),
        });
        expect(joined.id).toBe(group.id);

        // Joining twice is idempotent (onConflictDoNothing against the real PK).
        await callerFor(bob).group.joinByCode({ joinCode: group.joinCode });

        const fetched = await callerFor(alice).group.get({ groupId: group.id });
        expect(fetched.members).toHaveLength(2); // not 3 — no duplicate row
        expect(fetched.members.find((m) => m.userId === alice)?.role).toBe('admin');
        expect(fetched.members.find((m) => m.userId === bob)?.role).toBe('member');

        // The privacy boundary, against a real query rather than a fake.
        await expect(callerFor(carol).group.get({ groupId: group.id })).rejects.toMatchObject({
          code: 'FORBIDDEN',
        });

        expect((await callerFor(alice).group.listMine()).map((g) => g.id)).toContain(group.id);
        expect((await callerFor(carol).group.listMine()).map((g) => g.id)).not.toContain(group.id);

        throw ROLLBACK;
      });
    } catch (err) {
      if (err !== ROLLBACK) throw err;
    }
  });
});

describe.skipIf(!DATABASE_URL)('the full Signal → overlap chain against live Postgres', () => {
  it('three members signal the same night and the heatmap sees it', async () => {
    const { drizzle } = await import('drizzle-orm/postgres-js');
    const schema = await import('@/server/db/schema');
    const { appRouter } = await import('@/server/trpc/routers/_app');
    const { createTestContext, fakeUser } = await import('../trpc/helpers');
    const { addDays, localDateInTimeZone, weekStartFor } = await import('@/lib/dateUtils');

    const db = drizzle(sql!, { schema });
    const ROLLBACK = Symbol('rollback');

    // A night inside the current three-week horizon, computed the same way
    // signal.submit will, so the submission isn't rejected as out of range.
    const weekStart = weekStartFor(localDateInTimeZone(new Date(), 'America/Toronto'));
    const target = addDays(weekStart, 9); // week 1 — safely not in the past

    try {
      await db.transaction(async (tx) => {
        const seed = async (phone: string) => {
          const [row] = await tx.execute<{ id: string }>(
            sqlTag`INSERT INTO auth.users (id, instance_id, aud, role, phone, created_at, updated_at)
                   VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
                           'authenticated', 'authenticated', ${phone}, now(), now())
                   RETURNING id`,
          );
          return (row as unknown as { id: string }).id;
        };
        const callerFor = (userId: string) =>
          appRouter.createCaller(
            createTestContext({
              user: fakeUser(userId),
              db: (() => tx) as unknown as ReturnType<typeof createTestContext>['db'],
            }),
          );

        const ids = [
          await seed('+15195550201'),
          await seed('+15195550202'),
          await seed('+15195550203'),
        ];

        const group = await callerFor(ids[0]!).group.create({ name: 'Heatmap Crew' });
        await callerFor(ids[1]!).group.joinByCode({ joinCode: group.joinCode });
        await callerFor(ids[2]!).group.joinByCode({ joinCode: group.joinCode });

        // Every submit goes through guard_confirmed_free for real.
        for (const id of ids) {
          await callerFor(id).signal.submit({
            vibe: 'down_for_anything',
            nights: [{ date: target, state: 'confirmed_free' }],
          });
        }

        const overlap = await callerFor(ids[0]!).group.overlap({ groupId: group.id });

        expect(overlap.memberCount).toBe(3);
        expect(overlap.signalledCount).toBe(3);
        expect(overlap.isLive).toBe(true); // 3 signalled clears the cold-start floor

        const night = overlap.nights.find((n) => n.date === target);
        expect(night, `expected ${target} within the 21-day horizon`).toBeDefined();
        expect(night!.confirmedCount).toBe(3);
        expect(night!.isBestNight).toBe(true);
        expect(overlap.headline).toContain('3 of 3 free');

        // INV-3: a cohort of 3 is below the floor of 5, so no exact counts.
        expect(night!.vibeCounts).toBeNull();

        // Re-submitting replaces rather than accumulating (INV-8 upsert).
        await callerFor(ids[0]!).signal.submit({ vibe: 'slammed', nights: [] });
        const after = await callerFor(ids[0]!).group.overlap({ groupId: group.id });
        expect(after.signalledCount).toBe(3); // still signalled, just with no free nights
        expect(after.nights.find((n) => n.date === target)!.confirmedCount).toBe(2);

        throw ROLLBACK;
      });
    } catch (err) {
      if (err !== ROLLBACK) throw err;
    }
  });
});
