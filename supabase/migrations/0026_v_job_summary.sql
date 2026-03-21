-- =============================================================
-- 0026_v_job_summary.sql
-- Projection view: core.v_job_summary
--
-- The operator-facing and founder-facing read surface for the
-- job domain. Flattens core.jobs with derived economic metrics,
-- obligation health, receipt chain depth, and status signals.
--
-- Design rules:
--   - No raw ledger or base table access from the browser.
--     Next.js API routes read this view via supabaseAdmin.
--   - RLS enforced through core.jobs (workspace member gate).
--   - Subqueries for obligation/receipt counts are correlated;
--     acceptable at current scale, index-backed on job_id.
--   - Amounts always in cents (integer arithmetic, no float).
--   - Timestamps always timestamptz (UTC).
--
-- Consumer API routes (to be built):
--   GET /api/washbay/jobs          → WHERE workspace_id = :ws
--   GET /api/washbay/jobs/:id      → WHERE job_id = :id
--   GET /api/founder/leakage       → WHERE has_leakage = true
--   GET /api/founder/open-jobs     → WHERE status NOT IN ('closed','voided')
-- =============================================================

BEGIN;
-- ---------------------------------------------------------------
-- core.v_job_summary
-- ---------------------------------------------------------------
CREATE OR REPLACE VIEW core.v_job_summary AS
SELECT
  -- Identity
  j.id                                                              AS job_id,
  j.workspace_id,
  j.customer_id,
  j.asset_id,
  j.operator_id,
  op.handle                                                         AS operator_handle,

  -- Service / commercial state
  j.service_package,
  j.status,

  -- Raw economic amounts (all cents)
  j.quoted_cents,
  j.addon_cents,
  j.retail_cents,
  j.discount_cents,
  j.invoice_cents,
  j.payment_cents,

  -- Derived: expected revenue (pre-invoice fallback)
  -- If invoice is locked, that IS the expected amount.
  -- Otherwise fall back to quoted + addon + retail - discount.
  COALESCE(
    j.invoice_cents,
    j.quoted_cents + j.addon_cents + j.retail_cents - j.discount_cents
  )                                                                 AS expected_cents,

  -- Derived: variance (payment vs expected)
  --   NULL  → payment not yet recorded
  --   < 0   → leakage (paid less than expected)
  --   > 0   → overpayment (investigate)
  --   = 0   → exact match
  CASE
    WHEN j.payment_cents IS NOT NULL THEN
      j.payment_cents
      - COALESCE(
          j.invoice_cents,
          j.quoted_cents + j.addon_cents + j.retail_cents - j.discount_cents
        )
    ELSE NULL
  END                                                               AS variance_cents,

  -- Leakage flag: true when paid < expected
  CASE
    WHEN j.payment_cents IS NOT NULL
     AND j.payment_cents < COALESCE(
           j.invoice_cents,
           j.quoted_cents + j.addon_cents + j.retail_cents - j.discount_cents
         )
    THEN true
    ELSE false
  END                                                               AS has_leakage,

  -- Obligation health
  (
    SELECT COUNT(*)
      FROM core.obligations o
     WHERE o.job_id = j.id
       AND o.status = 'open'
  )::int                                                            AS open_obligation_count,

  (
    SELECT COUNT(*)
      FROM core.obligations o
     WHERE o.job_id = j.id
  )::int                                                            AS total_obligation_count,

  -- Open obligation with nearest deadline (for breach detection)
  (
    SELECT MIN(o.due_at)
      FROM core.obligations o
     WHERE o.job_id = j.id
       AND o.status = 'open'
       AND o.due_at IS NOT NULL
  )                                                                 AS next_obligation_due_at,

  -- Is any obligation in breach right now?
  EXISTS (
    SELECT 1
      FROM core.obligations o
     WHERE o.job_id = j.id
       AND o.status = 'open'
       AND o.due_at < now()
  )                                                                 AS has_obligation_breach,

  -- Receipt chain depth for this job
  -- Chain key pattern: 'job:' || job_id  (set by api.create_job)
  (
    SELECT COUNT(*)
      FROM ledger.receipts lr
     WHERE lr.workspace_id = j.workspace_id
       AND lr.chain_key    = 'job:' || j.id::text
  )::int                                                            AS receipt_count,

  -- Timestamps
  j.scheduled_at,
  j.checked_in_at,
  j.started_at,
  j.completed_at,
  j.invoiced_at,
  j.paid_at,
  j.closed_at,
  j.created_at,
  j.updated_at,

  -- Derived: age of the job in hours (from creation to now)
  EXTRACT(EPOCH FROM (now() - j.created_at)) / 3600               AS age_hours,

  -- Derived: cycle time in hours (started → completed)
  CASE
    WHEN j.started_at IS NOT NULL AND j.completed_at IS NOT NULL THEN
      EXTRACT(EPOCH FROM (j.completed_at - j.started_at)) / 3600
    ELSE NULL
  END                                                               AS cycle_time_hours,

  -- Derived: days since completion (for aging / SLA tracking)
  CASE
    WHEN j.completed_at IS NOT NULL THEN
      EXTRACT(EPOCH FROM (now() - j.completed_at)) / 86400
    ELSE NULL
  END                                                               AS days_since_completed,

  -- Causal anchor
  j.created_event_id

FROM core.jobs j
LEFT JOIN core.operators op ON op.id = j.operator_id;
-- ---------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------
GRANT SELECT ON core.v_job_summary TO authenticated, service_role;
COMMENT ON VIEW core.v_job_summary IS
  'Flattened operator/founder read surface for the job domain. '
  'Includes derived economic metrics (variance, leakage flag), '
  'obligation health counts, and receipt chain depth. '
  'RLS enforced via core.jobs (workspace member gate). '
  'All API routes read through this view via supabaseAdmin.';
COMMIT;
