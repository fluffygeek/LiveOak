-- Automated background jobs (nightly duplicate reconciliation) write audit_log
-- rows, and audit_log.actor_id is NOT NULL, so a fixed system user is seeded
-- here for them to reference. `active = false` so it can never sign in.
--
-- `users.email` is a separate unique constraint from the primary key, so a
-- plain `ON CONFLICT (id) DO NOTHING` can't handle every re-run scenario:
-- fail loudly if the email is already taken by a different id (rather than
-- erroring on the unique-email constraint), and if the fixed id already
-- exists, reconcile it back to the canonical role/active/email rather than
-- silently leaving it in whatever state it drifted to.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM users
    WHERE email = 'system@liveoak.internal'
      AND id <> '00000000-0000-0000-0000-000000000001'
  ) THEN
    RAISE EXCEPTION 'system user email system@liveoak.internal is already in use by a different user id';
  END IF;

  INSERT INTO users (id, email, role, display_name, active)
  VALUES ('00000000-0000-0000-0000-000000000001', 'system@liveoak.internal', 'app_admin', 'System (automated)', false)
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    role = EXCLUDED.role,
    display_name = EXCLUDED.display_name,
    active = EXCLUDED.active;
END $$;
