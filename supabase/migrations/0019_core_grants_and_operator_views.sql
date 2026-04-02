-- =============================================================
-- 0019_core_grants_and_operator_views.sql
--
-- 1. Grant service_role full write access on core schema
--    (SELECT works via superuser path; INSERT/UPDATE blocked
--     because no explicit GRANT exists for non-default tables)
-- 2. Create core.v_receipts — operator receipt read surface
--    backed by ledger.receipts + payload fields
-- 3. Create core.v_next_actions — operator command surface
--    (skeleton: returns empty until obligations table lands)
-- =============================================================

BEGIN;
-- ---------------------------------------------------------------
-- 1. Schema + table grants
-- ---------------------------------------------------------------

GRANT USAGE ON SCHEMA core TO service_role, anon;
-- service_role: full access on all current + future core objects
GRANT ALL PRIVILEGES ON ALL TABLES    IN SCHEMA core TO service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA core TO service_role;
GRANT ALL PRIVILEGES ON ALL ROUTINES  IN SCHEMA core TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA core
  GRANT ALL PRIVILEGES ON TABLES    TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA core
  GRANT ALL PRIVILEGES ON SEQUENCES TO service_role;
-- authenticated: read on current + future core objects
GRANT SELECT ON ALL TABLES IN SCHEMA core TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA core
  GRANT SELECT ON TABLES TO authenticated;
-- ---------------------------------------------------------------
-- 2. core.v_receipts
--    Operator receipt read surface. Skeleton view — returns the
--    correct schema with zero rows until the business receipt
--    layer (obligations + seal path) is wired in.
-- ---------------------------------------------------------------

CREATE OR REPLACE VIEW core.v_receipts AS
SELECT
  NULL::uuid                              AS receipt_id,
  NULL::text                              AS obligation_id,
  NULL::timestamptz                       AS sealed_at,
  NULL::text                              AS sealed_by,
  NULL::text                              AS face,
  NULL::text                              AS economic_ref_type,
  NULL::text                              AS economic_ref_id,
  NULL::uuid                              AS ledger_event_id,
  NULL::jsonb                             AS payload
WHERE false;
GRANT SELECT ON core.v_receipts TO authenticated, service_role;
-- ---------------------------------------------------------------
-- 3. core.v_next_actions
--    Operator command surface. Skeleton view — returns correct
--    schema with zero rows until the obligations layer lands.
-- ---------------------------------------------------------------

CREATE OR REPLACE VIEW core.v_next_actions AS
SELECT
  NULL::uuid                              AS obligation_id,
  NULL::text                              AS title,
  NULL::text                              AS why,
  NULL::text                              AS face,
  NULL::text                              AS severity,
  NULL::timestamptz                       AS due_at,
  NULL::timestamptz                       AS created_at,
  NULL::numeric                           AS age_hours,
  NULL::boolean                           AS is_breach,
  NULL::text                              AS economic_ref_type,
  NULL::text                              AS economic_ref_id
WHERE false;
-- intentionally empty until obligations table exists

GRANT SELECT ON core.v_next_actions TO authenticated, service_role;
COMMIT;
