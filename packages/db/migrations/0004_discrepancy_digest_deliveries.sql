-- Tracks which distribution_list recipients have already received the
-- discrepancy digest for a given calendar night (America/Chicago), so a
-- re-trigger of the same night's run (manual retry via the internal ops
-- endpoint, or a future `attempts` > 1 BullMQ config) doesn't re-send to
-- recipients who already got it. See apps/worker/src/jobs/discrepancyDigest.ts.
CREATE TABLE discrepancy_digest_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_date date NOT NULL,
  recipient_id uuid NOT NULL REFERENCES distribution_list(id),
  delivered_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_date, recipient_id)
);
