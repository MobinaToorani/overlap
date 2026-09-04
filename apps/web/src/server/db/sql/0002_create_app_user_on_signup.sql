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
CREATE OR REPLACE FUNCTION create_app_user_on_signup() RETURNS trigger AS $$
BEGIN
  INSERT INTO app_user (id, phone_e164, display_name)
  VALUES (NEW.id, NEW.phone, COALESCE(NEW.phone, 'New member'))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_create_app_user_on_signup ON auth.users;
CREATE TRIGGER trg_create_app_user_on_signup
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION create_app_user_on_signup();
