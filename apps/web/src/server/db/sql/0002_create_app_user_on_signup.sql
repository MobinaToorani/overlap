-- FIX-1: a verified OTP must produce exactly one app_user row, linked to
-- auth.users(id) — never an independently generated uuid
-- (engineering-spec.md §3's comment on app_user). Implemented as a trigger,
-- not application code in the OTP verify handler, so app_user creation
-- can't be skipped by some other future path that creates an auth.users
-- row (an admin tool, a different auth provider, a manual dashboard
-- action) — the trigger fires regardless of how the row got there. This is
-- the standard Supabase "create a profile row on signup" pattern.
--
-- display_name has no product-defined default — engineering-spec.md's DDL
-- doesn't specify one either, and the phone-OTP flow only ever collects a
-- phone number at signup. This uses the phone number itself as a visible
-- placeholder until the user sets a real name via a future
-- me.updateProfile procedure (not built yet — no ticket before T3 needed
-- one). Revisit if that reads badly in the UI once group creation exists.
--
-- REQUIRES auth.users to already exist — unlike 0001_guard_invariants.sql,
-- there's no defensive check here, because DROP TRIGGER ... ON auth.users
-- itself fails if the table doesn't exist (IF EXISTS only covers the
-- trigger, not the table it's attached to). This is fine against Supabase,
-- which provisions auth.users itself before any of our migrations run; for
-- local/non-Supabase testing, create a minimal stub
-- (`create schema auth; create table auth.users (id uuid primary key,
-- phone text);`) first.
--
-- NEW.phone can be NULL — Supabase's auth.users supports email-only
-- signups too, and this product doesn't. The guard below means a
-- non-phone auth.users row (an admin-created account, a future OAuth
-- provider) is simply not mirrored into app_user, rather than throwing and
-- blocking the write to Supabase's own core table — a trigger that can
-- fail an INSERT into auth.users is a very sharp edge to leave unguarded.
--
-- Also worth verifying once a live Supabase project exists (not done yet —
-- no project provisioned): whether GoTrue inserts the auth.users row at
-- signInWithOtp() (request time) or only after a successful verifyOtp().
-- If it's the former, an unverified/never-completed phone number would
-- still get an app_user row. Nothing in this file depends on which is
-- true, but the product assumption ("a verified OTP produces exactly one
-- app_user row") is worth confirming against real behaviour.
CREATE OR REPLACE FUNCTION create_app_user_on_signup() RETURNS trigger AS $$
BEGIN
  IF NEW.phone IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO app_user (id, phone_e164, display_name)
  VALUES (NEW.id, NEW.phone, COALESCE(NEW.phone, 'New member'))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_create_app_user_on_signup ON auth.users;
CREATE TRIGGER trg_create_app_user_on_signup
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION create_app_user_on_signup();
