/**
 * A pg-mem instance loaded with the actual generated migration SQL
 * (0000_initial_schema.sql), for testing that the DDL — and the
 * constraints it declares — are real, valid, and behave the way the
 * schema and the invariants say they do.
 *
 * pg-mem has no plpgsql interpreter, so the hand-written trigger functions
 * (sql/0001_guard_invariants.sql, sql/0002_create_app_user_on_signup.sql —
 * INV-1 and FIX-1) cannot run here and are not attempted. Those still need
 * a live Postgres — tracked in docs/backlog.md, not silently assumed to
 * be covered by this.
 *
 * This also intentionally does NOT go through Drizzle. drizzle-orm's
 * node-postgres driver always sends `rowMode: 'array'` and a custom
 * `types.getTypeParser` on every query, and pg-mem's `pg`-compatible
 * adapter explicitly refuses both (throws "Not supported"). The
 * getTypeParser one can be stripped safely (it only changes which type
 * coercion runs); rowMode can't be stripped safely — silently converting
 * an array-mode response back to object shape without drizzle knowing
 * risks corrupted-but-not-crashed query results, which is worse than no
 * test at all. So: raw SQL against pg-mem's own query interface, not
 * TypeScript query-builder code — narrower coverage than hoped, but real.
 */
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DataType, newDb } from 'pg-mem';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_DIR = path.resolve(__dirname, '../../src/server/db');

export function createEmulatedDb() {
  const mem = newDb({ autoCreateForeignKeyIndices: true });

  mem.public.registerFunction({
    name: 'gen_random_uuid',
    returns: DataType.uuid,
    implementation: () => randomUUID(),
    impure: true,
  });

  // Supabase's managed auth schema, stubbed exactly as schema.ts's
  // authUsers comment tells a local/non-Supabase tester to.
  mem.public.none('CREATE SCHEMA auth; CREATE TABLE auth.users (id uuid PRIMARY KEY, phone text);');

  const raw = readFileSync(path.join(DB_DIR, 'migrations/0000_initial_schema.sql'), 'utf-8');
  const statements = raw
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter(Boolean);

  for (const stmt of statements) {
    if (stmt.startsWith('DO $$')) {
      // drizzle-kit wraps each FK constraint in a DO $$ ... EXCEPTION WHEN
      // duplicate_object ... $$ block for idempotent re-runs. pg-mem can't
      // execute the DO block (no plpgsql), but the ALTER TABLE inside it
      // is plain SQL — extract and run just that. Idempotency doesn't
      // matter: this DB is created fresh once per test file.
      const alterTable = stmt.match(/ALTER TABLE[\s\S]*?;/)?.[0];
      if (!alterTable) {
        throw new Error(`createEmulatedDb: could not extract ALTER TABLE from:\n${stmt}`);
      }
      mem.public.none(alterTable);
    } else {
      mem.public.none(stmt);
    }
  }

  return mem.public;
}
