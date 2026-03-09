-- =============================================================
-- 0023_core_jobs.sql
-- Projection-level job record for the washbay / service domain.
--
-- Replaces: 0019_core_jobs_obligations.sql (archived .bak)
--   That file conflicted with Track 1's 0020_obligations_and_receipts.sql
--   because both tried to CREATE TABLE core.obligations.
--
-- This file creates ONLY core.jobs.
-- core.obligations already exists (Track 1 migration 0020).
-- Job-domain columns are added to core.obligations in the next
-- migration: 0024_extend_obligations_for_jobs.sql.
--
-- Design rules:
--   - Write-protected from authenticated role.
--   - All writes via api.* SECURITY DEFINER functions (0025+).
--   - RLS: operator must be workspace member to read.
--   - customer_id / asset_id are soft references — FK added when
--     core.customers and core.assets tables are built.
-- =============================================================

BEGIN;

-- ---------------------------------------------------------------
-- core.jobs
-- Projection-level record. The source of truth is ledger.events.
-- This table is a flattened read-optimised projection only.
-- ---------------------------------------------------------------
CREATE TABLE core.jobs (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id       uuid        NOT NULL REFERENCES core.workspaces(id),

  -- Soft references: FK added in later migration once entity tables exist
  customer_id        uuid,
  asset_id           uuid,
  operator_id        uuid        REFERENCES core.operators(id),

  -- Commercial state (cents, flattened for projection speed)
  service_package    text,
  quoted_cents       bigint      NOT NULL DEFAULT 0,
  addon_cents        bigint      NOT NULL DEFAULT 0,
  retail_cents       bigint      NOT NULL DEFAULT 0,
  discount_cents     bigint      NOT NULL DEFAULT 0,
  invoice_cents      bigint,   -- NULL until invoice.finalized
  payment_cents      bigint,   -- NULL until payment.received

  -- Job lifecycle status
  status             text        NOT NULL DEFAULT 'created'
                     CHECK (status IN (
                       'created', 'scheduled', 'checked_in',
                       'started', 'completed', 'closed', 'voided'
                     )),

  -- Lifecycle timestamps — written only by api.* functions
  scheduled_at       timestamptz,
  checked_in_at      timestamptz,
  started_at         timestamptz,
  completed_at       timestamptz,
  invoiced_at        timestamptz,
  paid_at            timestamptz,
  closed_at          timestamptz,

  -- Causal anchor: the ledger event that created this job
  created_event_id   uuid        REFERENCES ledger.events(id),

  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE core.jobs IS
  'Projection-level job record. Source of truth is ledger.events. '
  'Mutated only by api.* SECURITY DEFINER functions. Direct writes blocked.';

COMMENT ON COLUMN core.jobs.quoted_cents IS
  'Expected revenue from service package at job creation time.';

COMMENT ON COLUMN core.jobs.invoice_cents IS
  'Final invoiced amount. NULL until invoice.finalized event.';

COMMENT ON COLUMN core.jobs.payment_cents IS
  'Amount actually received. NULL until payment.received event.';

-- ---------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------
CREATE INDEX idx_jobs_workspace_status
  ON core.jobs (workspace_id, status);

CREATE INDEX idx_jobs_workspace_operator
  ON core.jobs (workspace_id, operator_id)
  WHERE operator_id IS NOT NULL;

CREATE INDEX idx_jobs_workspace_created
  ON core.jobs (workspace_id, created_at DESC);

CREATE INDEX idx_jobs_workspace_paid_at
  ON core.jobs (workspace_id, paid_at DESC)
  WHERE paid_at IS NOT NULL;

-- ---------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------
CREATE TRIGGER jobs_set_updated_at
  BEFORE UPDATE ON core.jobs
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();

-- ---------------------------------------------------------------
-- RLS — read only for authenticated workspace members
-- No INSERT/UPDATE/DELETE: all writes go through api.* functions.
-- ---------------------------------------------------------------
ALTER TABLE core.jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY jobs_select
  ON core.jobs FOR SELECT
  USING (core.is_member(workspace_id));

REVOKE INSERT, UPDATE, DELETE ON core.jobs FROM authenticated;

COMMIT;
