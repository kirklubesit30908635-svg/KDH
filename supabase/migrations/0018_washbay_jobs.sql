-- =============================================================
-- 0018_washbay_jobs.sql
-- Washbay job board — persistent job tracking.
-- Replaces local JSON file store with governed Supabase table.
-- =============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS core.washbay_jobs (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slot          text        NOT NULL,
  boat_customer text        NOT NULL,
  status        text        NOT NULL DEFAULT 'queued'
                            CHECK (status IN ('queued','scheduled','in_progress','blocked','ready_for_delivery','completed')),
  owner         text        NOT NULL DEFAULT '',
  next_action   text        NOT NULL DEFAULT 'Review and schedule',
  value         integer     NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz
);

CREATE INDEX idx_washbay_jobs_status    ON core.washbay_jobs (status);
CREATE INDEX idx_washbay_jobs_updated   ON core.washbay_jobs (updated_at DESC);

CREATE TRIGGER washbay_jobs_set_updated_at
  BEFORE UPDATE ON core.washbay_jobs
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();

ALTER TABLE core.washbay_jobs ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS — API routes use supabaseAdmin (service role)
-- Authenticated operators can read
CREATE POLICY washbay_jobs_select
  ON core.washbay_jobs FOR SELECT
  TO authenticated
  USING (true);

COMMIT;
