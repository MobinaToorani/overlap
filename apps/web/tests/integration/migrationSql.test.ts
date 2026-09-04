/**
 * Validates that the actual generated migration (0000_initial_schema.sql)
 * is real, executable SQL, and that the constraints it declares behave the
 * way engineering-spec.md and the invariants say they do — checked against
 * a real (pg-mem-emulated) SQL engine, not asserted from reading the file.
 * See createEmulatedDb.ts's doc comment for what this can't cover
 * (anything requiring plpgsql — the trigger-enforced parts of INV-1/FIX-1).
 */
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createEmulatedDb } from './createEmulatedDb';

describe('0000_initial_schema.sql, against a real SQL engine', () => {
  let db: ReturnType<typeof createEmulatedDb>;
  let userId: string;

  beforeEach(() => {
    db = createEmulatedDb();
    userId = randomUUID();
    db.none(`INSERT INTO auth.users (id, phone) VALUES ('${userId}', '+15195550001')`);
    db.none(
      `INSERT INTO app_user (id, phone_e164, display_name) VALUES ('${userId}', '+15195550001', 'Alice')`,
    );
  });

  it('the full DDL (types, tables, checks, FKs, indexes) executes without error', () => {
    // If createEmulatedDb() didn't throw in beforeEach, the DDL already
    // ran successfully — this test exists so that shows up as a named,
    // readable pass/fail rather than only ever surfacing as an opaque
    // beforeEach crash. Also sanity-checks a table actually exists.
    expect(db.many('SELECT id FROM app_user')).toHaveLength(1); // the beforeEach user
  });

  it('grp.join_code is unique — a duplicate insert fails', () => {
    db.none(`INSERT INTO grp (name, created_by, join_code) VALUES ('G1', '${userId}', 'ABCDEFGHJKLM')`);
    expect(() =>
      db.none(`INSERT INTO grp (name, created_by, join_code) VALUES ('G2', '${userId}', 'ABCDEFGHJKLM')`),
    ).toThrow();
  });

  it('grp.cadence_weeks rejects anything other than 1 or 2 (FIX-7)', () => {
    expect(() =>
      db.none(
        `INSERT INTO grp (name, created_by, join_code, cadence_weeks) VALUES ('G', '${userId}', 'CADENCECODE1', 3)`,
      ),
    ).toThrow();
    expect(() =>
      db.none(
        `INSERT INTO grp (name, created_by, join_code, cadence_weeks) VALUES ('G', '${userId}', 'CADENCECODE2', 2)`,
      ),
    ).not.toThrow();
  });

  it('signal_night.horizon_week is constrained to 0-2', () => {
    const signalId = randomUUID();
    db.none(`INSERT INTO signal (id, user_id, week_start_date, vibe) VALUES ('${signalId}', '${userId}', '2026-09-01', 'low_key')`);

    expect(() =>
      db.none(
        `INSERT INTO signal_night (signal_id, date, state, horizon_week, written_by) VALUES ('${signalId}', '2026-09-02', 'no_known_conflict', 3, 'sync')`,
      ),
    ).toThrow();
    expect(() =>
      db.none(
        `INSERT INTO signal_night (signal_id, date, state, horizon_week, written_by) VALUES ('${signalId}', '2026-09-02', 'no_known_conflict', 2, 'sync')`,
      ),
    ).not.toThrow();
  });

  it('rsvp requires a user_id or a guest_name — neither is rejected', () => {
    const groupId = randomUUID();
    const planId = randomUUID();
    db.none(`INSERT INTO grp (id, name, created_by, join_code) VALUES ('${groupId}', 'G', '${userId}', 'RSVPCODE0001')`);
    db.none(
      `INSERT INTO plan (id, group_id, created_by, title, starts_at, ends_at, public_slug) VALUES ('${planId}', '${groupId}', '${userId}', 'Dinner', '2026-09-10T19:00:00Z', '2026-09-10T23:00:00Z', 'rsvp-test-slug')`,
    );

    expect(() => db.none(`INSERT INTO rsvp (plan_id, status) VALUES ('${planId}', 'going')`)).toThrow();
    expect(() =>
      db.none(`INSERT INTO rsvp (plan_id, guest_name, status) VALUES ('${planId}', 'Guest', 'going')`),
    ).not.toThrow();
  });

  it('deleting a group cascades to its group_member rows', () => {
    const groupId = randomUUID();
    db.none(`INSERT INTO grp (id, name, created_by, join_code) VALUES ('${groupId}', 'G', '${userId}', 'CASCADECODE1')`);
    db.none(`INSERT INTO group_member (group_id, user_id, role) VALUES ('${groupId}', '${userId}', 'admin')`);
    expect(db.many(`SELECT * FROM group_member WHERE group_id = '${groupId}'`)).toHaveLength(1);

    db.none(`DELETE FROM grp WHERE id = '${groupId}'`);
    expect(db.many(`SELECT * FROM group_member WHERE group_id = '${groupId}'`)).toHaveLength(0);
  });

  // signal.submit re-submits with `ON CONFLICT (user_id, week_start_date)
  // WHERE group_id IS NULL DO UPDATE`. Postgres only infers a *partial*
  // unique index when the conflict target repeats the index predicate; get
  // it wrong and you get "no unique or exclusion constraint matching the ON
  // CONFLICT specification" — at runtime, never at compile time, so
  // typecheck passing tells you nothing here.
  //
  // pg-mem cannot check this: its parser has no production for a WHERE
  // clause on a conflict target at all (it expects DO immediately after the
  // column list) and rejects the statement as a syntax error, even though
  // it is valid Postgres. Attempted and backed out during T6 rather than
  // weakening the assertion into something that would pass without meaning
  // anything. This is the ADR-0006 boundary showing up in practice.
  it.todo(
    "signal.submit's upsert conflict target matches INV-8's partial index (needs real Postgres — pg-mem can't parse ON CONFLICT ... WHERE)",
  );

  it('INV-8: at most one global signal per user per week, but a scoped signal for the same week is unaffected', () => {
    const groupId = randomUUID();
    db.none(`INSERT INTO grp (id, name, created_by, join_code) VALUES ('${groupId}', 'G', '${userId}', 'INV8CODE0001')`);

    db.none(
      `INSERT INTO signal (id, user_id, group_id, week_start_date, vibe) VALUES ('${randomUUID()}', '${userId}', NULL, '2026-09-01', 'low_key')`,
    );
    expect(() =>
      db.none(
        `INSERT INTO signal (id, user_id, group_id, week_start_date, vibe) VALUES ('${randomUUID()}', '${userId}', NULL, '2026-09-01', 'slammed')`,
      ),
    ).toThrow(); // second global signal, same user+week

    expect(() =>
      db.none(
        `INSERT INTO signal (id, user_id, group_id, week_start_date, vibe) VALUES ('${randomUUID()}', '${userId}', '${groupId}', '2026-09-01', 'slammed')`,
      ),
    ).not.toThrow(); // scoped signal, same user+week — a different partial index, not a conflict
  });
});
