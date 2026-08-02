-- Phase 2: technician mobile MVP support.

CREATE TABLE job_draft_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id uuid NOT NULL REFERENCES job_drafts(id) ON DELETE CASCADE,
  s3_key text NOT NULL UNIQUE,
  content_type text,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_job_draft_photos_draft ON job_draft_photos (draft_id);

-- Sample work codes so the mobile form has something to pick from before
-- the app_admin work-code management screen exists (Phase 5). Safe to edit
-- via direct SQL/seed script in the meantime.
INSERT INTO work_codes (code, description, required_photo_count) VALUES
  ('STD-INSTALL', 'Standard installation', 3),
  ('SPLICE', 'Splice/repair work', 3),
  ('AERIAL-DROP', 'Aerial drop install', 4),
  ('UNDERGROUND-DROP', 'Underground drop install', 5);
