-- Hand-authored migration: native Postgres LIST partitioning by state for `jobs`
-- is not something drizzle-kit's generator emits, so this file is the source of
-- truth for the physical schema. Run before any drizzle-kit-generated migrations
-- that alter `jobs`' non-partitioning columns.

CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid()

CREATE TYPE user_role AS ENUM ('technician', 'payroll_admin', 'app_admin');
CREATE TYPE address_verification_status AS ENUM (
  'pending', 'verified', 'failed', 'skipped_new_build', 'unavailable'
);
CREATE TYPE job_status AS ENUM ('submitted', 'closed', 'pictures_downloaded');
CREATE TYPE audit_action AS ENUM (
  'submitted', 'field_updated', 'status_changed',
  'marked_discrepancy', 'cleared_discrepancy', 'marked_duplicate', 'photos_downloaded'
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext NOT NULL UNIQUE,
  role user_role NOT NULL,
  display_name text,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);

CREATE TABLE work_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  description text,
  required_photo_count int NOT NULL DEFAULT 3 CHECK (required_photo_count >= 3),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE discrepancy_reasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE job_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_id uuid NOT NULL UNIQUE REFERENCES users(id),
  job_number text,
  work_code_id uuid REFERENCES work_codes(id),
  footage numeric,
  notes text,
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  zip text,
  is_new_build boolean NOT NULL DEFAULT false,
  verified_address_line1 text,
  verified_city text,
  verified_state text,
  verified_zip text,
  verified_zip4 text,
  address_verification_status address_verification_status NOT NULL DEFAULT 'pending',
  address_verification_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Core job record, partitioned by state. `state` is stored uppercase 2-letter
-- (e.g. 'TX'); the DEFAULT partition catches any state without a dedicated
-- partition yet so inserts never fail while partitions are provisioned.
CREATE TABLE jobs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  state char(2) NOT NULL,
  job_number text NOT NULL,
  technician_id uuid NOT NULL REFERENCES users(id),
  work_code_id uuid NOT NULL REFERENCES work_codes(id),
  footage numeric NOT NULL,
  notes text,

  address_line1 text NOT NULL,
  address_line2 text,
  city text NOT NULL,
  zip text NOT NULL,
  is_new_build boolean NOT NULL DEFAULT false,

  verified_address_line1 text,
  verified_city text,
  verified_state text,
  verified_zip text,
  verified_zip4 text,
  address_verification_status address_verification_status NOT NULL DEFAULT 'pending',
  address_verification_checked_at timestamptz,

  status job_status NOT NULL DEFAULT 'submitted',

  is_discrepancy boolean NOT NULL DEFAULT false,
  discrepancy_reason_id uuid REFERENCES discrepancy_reasons(id),
  discrepancy_notes text,
  discrepancy_last_notified_at timestamptz,

  is_duplicate boolean NOT NULL DEFAULT false,
  duplicate_group_id uuid,

  submitted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (id, state)
) PARTITION BY LIST (state);

CREATE TABLE jobs_default PARTITION OF jobs DEFAULT;
-- Add a dedicated partition per state as technicians start submitting there, e.g.:
--   CREATE TABLE jobs_tx PARTITION OF jobs FOR VALUES IN ('TX');
-- New partitions can be attached online without downtime; rows already in
-- jobs_default for that state should be moved with `WITH (...) DETACH/ATTACH`
-- or a one-off backfill script.

CREATE INDEX idx_jobs_technician_submitted ON jobs (technician_id, submitted_at);
CREATE INDEX idx_jobs_discrepancy ON jobs (is_discrepancy) WHERE is_discrepancy = true;
CREATE INDEX idx_jobs_duplicate_group ON jobs (duplicate_group_id) WHERE duplicate_group_id IS NOT NULL;
CREATE INDEX idx_jobs_job_number ON jobs (job_number);

CREATE TABLE job_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  job_state char(2) NOT NULL,
  s3_key text NOT NULL UNIQUE,
  content_type text,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (job_id, job_state) REFERENCES jobs(id, state)
);

CREATE TABLE duplicate_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  duplicate_group_id uuid NOT NULL,
  job_id uuid NOT NULL,
  job_state char(2) NOT NULL,
  detected_at timestamptz NOT NULL DEFAULT now(),
  detection_method text NOT NULL DEFAULT 'normalized_address_match',
  FOREIGN KEY (job_id, job_state) REFERENCES jobs(id, state),
  UNIQUE (duplicate_group_id, job_id)
);

-- Append-only audit trail. INSERT-only grant applied below.
CREATE TABLE audit_log (
  id bigserial PRIMARY KEY,
  job_id uuid NOT NULL,
  job_state char(2) NOT NULL,
  actor_id uuid NOT NULL REFERENCES users(id),
  action audit_action NOT NULL,
  field_name text,
  old_value jsonb,
  new_value jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (job_id, job_state) REFERENCES jobs(id, state)
);

CREATE TABLE distribution_list (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext NOT NULL UNIQUE,
  label text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app_config (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Seed defaults
INSERT INTO discrepancy_reasons (label, sort_order) VALUES
  ('Address Mismatch', 1),
  ('Missing Photos', 2),
  ('Incorrect Work Code', 3),
  ('Footage Discrepancy', 4),
  ('Duplicate Submission', 5),
  ('Other', 6);

INSERT INTO app_config (key, value) VALUES
  ('usps.enabled', 'true'),
  ('digest_email.send_hour_local', '20'),
  ('google.workspace_domain', '""');

-- Audit-log immutability: the application's runtime DB role may only INSERT.
-- Replace `liveoak_app` with the actual role name used by the API/worker connection
-- once provisioned; this statement is safe to re-run once that role exists.
-- REVOKE UPDATE, DELETE ON audit_log FROM liveoak_app;
