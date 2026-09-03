-- INV-1 enforcement. Not expressible via Drizzle's table builder — apply
-- this by hand after the first `pnpm db:generate` / `pnpm db:migrate` run.
-- docs/engineering-spec.md §3 has the full commentary; do not remove either
-- trigger or the role grant. Test OV-6 asserts these throw.

CREATE OR REPLACE FUNCTION guard_confirmed_free() RETURNS trigger AS $$
BEGIN
  IF NEW.state = 'confirmed_free' AND NEW.written_by <> 'user' THEN
    RAISE EXCEPTION
      'INV-1: confirmed_free may only be written by a user action, got written_by=%',
      NEW.written_by;
  END IF;
  IF NEW.state = 'confirmed_free' AND NEW.confirmed_at IS NULL THEN
    RAISE EXCEPTION 'INV-1: confirmed_free requires confirmed_at';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_guard_confirmed_free ON signal_night;
CREATE TRIGGER trg_guard_confirmed_free
  BEFORE INSERT OR UPDATE ON signal_night
  FOR EACH ROW EXECUTE FUNCTION guard_confirmed_free();

-- FIX-4: the trigger above only checks a column the caller supplies, and a
-- sync job that passes written_by='user' would defeat it entirely. Add a
-- real boundary: the worker connects as its own role, which is physically
-- unable to write the offending value regardless of what written_by says.
--
-- __OVERLAP_WORKER_PASSWORD__ is substituted by migrate.ts from
-- $OVERLAP_WORKER_DB_PASSWORD before this file is sent to Postgres — plain
-- postgres.js has no psql-style `:'var'` substitution, so this can't be a
-- literal psql variable reference.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'overlap_worker') THEN
    CREATE ROLE overlap_worker LOGIN PASSWORD '__OVERLAP_WORKER_PASSWORD__';
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE ON busy_block TO overlap_worker;
GRANT SELECT ON signal, app_user, grp, group_member TO overlap_worker;

CREATE OR REPLACE FUNCTION guard_worker_role() RETURNS trigger AS $$
BEGIN
  IF current_user = 'overlap_worker' AND NEW.state = 'confirmed_free' THEN
    RAISE EXCEPTION 'INV-1: the worker role may never write confirmed_free';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_guard_worker_role ON signal_night;
CREATE TRIGGER trg_guard_worker_role
  BEFORE INSERT OR UPDATE ON signal_night
  FOR EACH ROW EXECUTE FUNCTION guard_worker_role();
