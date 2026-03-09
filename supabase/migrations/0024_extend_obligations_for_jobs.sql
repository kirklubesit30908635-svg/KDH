-- =============================================================
-- 0024_extend_obligations_for_jobs.sql
-- Extend core.obligations with job-domain columns.
--
-- core.obligations was created in 0020_obligations_and_receipts.sql
-- with a minimal schema for the business-layer obligation surface
-- (title, why, face, severity, status, sealed_at, sealed_by, etc.).
--
-- The washbay/service API (0025_api_washbay.sql) requires:
--   - job_id            — FK to core.jobs
--   - obligation_type   — structured type name (vs free-text title)
--   - trigger_event_id  — causal ledger event
--   - satisfied_by_receipt_id — proof of completion from ledger.receipts
--
-- Status vocabulary extended:
--   Track 1 had:   open | sealed | cancelled
--   Track 2 adds:  satisfied | expired | voided
--   'sealed' (Track 1 UI term) and 'satisfied' (kernel term) are
--   both valid; kernel API uses 'satisfied'.
-- =============================================================

BEGIN;

-- ---------------------------------------------------------------
-- 1. Add job-domain columns to core.obligations
-- ---------------------------------------------------------------
ALTER TABLE core.obligations
  ADD COLUMN IF NOT EXISTS job_id
      uuid REFERENCES core.jobs(id),

  ADD COLUMN IF NOT EXISTS obligation_type
      text,  -- structured type: assign_operator, confirm_service, etc.

  ADD COLUMN IF NOT EXISTS trigger_event_id
      uuid REFERENCES ledger.events(id),  -- causal event that opened this obligation

  ADD COLUMN IF NOT EXISTS satisfied_by_receipt_id
      uuid REFERENCES ledger.receipts(id);  -- proof receipt from ledger

-- ---------------------------------------------------------------
-- 2. Extend status CHECK constraint
--
-- PostgreSQL does not support ALTER CONSTRAINT on CHECK constraints.
-- Drop the auto-generated constraint and replace with extended version.
-- Auto-name from 0020: obligations_status_check
-- ---------------------------------------------------------------
ALTER TABLE core.obligations
  DROP CONSTRAINT IF EXISTS obligations_status_check;

ALTER TABLE core.obligations
  ADD CONSTRAINT obligations_status_check
    CHECK (status IN (
      'open',        -- initial state
      'sealed',      -- Track 1 UI close term (backward compat)
      'satisfied',   -- kernel close term (washbay API)
      'cancelled',   -- administratively cancelled
      'expired',     -- deadline passed without satisfaction
      'voided'       -- voided (e.g. job voided before work began)
    ));

-- ---------------------------------------------------------------
-- 3. Indexes for job-domain query patterns
-- ---------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_obligations_job_id
  ON core.obligations (job_id)
  WHERE job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_obligations_job_open
  ON core.obligations (job_id, obligation_type)
  WHERE job_id IS NOT NULL AND status = 'open';

CREATE INDEX IF NOT EXISTS idx_obligations_workspace_open
  ON core.obligations (workspace_id, due_at)
  WHERE status = 'open';

COMMIT;
