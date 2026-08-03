-- Automated background jobs (nightly duplicate reconciliation) write audit_log
-- rows, and audit_log.actor_id is NOT NULL, so a fixed system user is seeded
-- here for them to reference. `active = false` so it can never sign in.
INSERT INTO users (id, email, role, display_name, active)
VALUES ('00000000-0000-0000-0000-000000000001', 'system@liveoak.internal', 'app_admin', 'System (automated)', false)
ON CONFLICT (id) DO NOTHING;
