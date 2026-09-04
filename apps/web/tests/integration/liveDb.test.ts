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
import { afterAll, describe, expect, it } from 'vitest';

loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

const DATABASE_URL = process.env.DATABASE_URL;
const sql = DATABASE_URL ? postgres(DATABASE_URL, { max: 1, onnotice: () => {} }) : null;

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
  afterAll(async () => {
    await sql?.end();
  });

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
