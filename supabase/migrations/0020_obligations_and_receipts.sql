-- =============================================================
-- 0020_obligations_and_receipts.sql
--
-- 1. core.obligations — business-layer action tracking
-- 2. core.receipts    — business-layer proof artifacts
-- 3. Replace skeleton v_next_actions with real query
-- 4. Replace skeleton v_receipts with real query
-- =============================================================

BEGIN;
-- ---------------------------------------------------------------
-- 1. core.obligations
-- ---------------------------------------------------------------

CREATE TABLE core.obligations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title             text NOT NULL,
  why               text,
  face              text DEFAULT 'unknown',
  severity          text NOT NULL DEFAULT 'queue'
                    CHECK (severity IN ('critical','at_risk','due_today','queue')),
  status            text NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','sealed','cancelled')),
  due_at            timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  sealed_at         timestamptz,
  sealed_by         text,
  economic_ref_type text,
  economic_ref_id   text,
  source_event_id   uuid,
  workspace_id      uuid
);
ALTER TABLE core.obligations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_read_obligations"
  ON core.obligations FOR SELECT TO authenticated USING (true);
-- ---------------------------------------------------------------
-- 2. core.receipts
-- ---------------------------------------------------------------

CREATE TABLE core.receipts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obligation_id     uuid REFERENCES core.obligations(id),
  sealed_at         timestamptz NOT NULL DEFAULT now(),
  sealed_by         text,
  face              text,
  economic_ref_type text,
  economic_ref_id   text,
  ledger_event_id   uuid,
  payload           jsonb,
  workspace_id      uuid
);
ALTER TABLE core.receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_read_receipts"
  ON core.receipts FOR SELECT TO authenticated USING (true);
-- ---------------------------------------------------------------
-- 3. Replace skeleton v_next_actions
-- ---------------------------------------------------------------

CREATE OR REPLACE VIEW core.v_next_actions AS
SELECT
  o.id                                                    AS obligation_id,
  o.title,
  o.why,
  o.face,
  o.severity,
  o.due_at,
  o.created_at,
  EXTRACT(EPOCH FROM (now() - o.created_at)) / 3600      AS age_hours,
  (o.due_at IS NOT NULL AND o.due_at < now())             AS is_breach,
  o.economic_ref_type,
  o.economic_ref_id
FROM core.obligations o
WHERE o.status = 'open';
GRANT SELECT ON core.v_next_actions TO authenticated, service_role;
-- ---------------------------------------------------------------
-- 4. Replace skeleton v_receipts
-- ---------------------------------------------------------------

CREATE OR REPLACE VIEW core.v_receipts AS
SELECT
  r.id                  AS receipt_id,
  r.obligation_id::text AS obligation_id,
  r.sealed_at,
  r.sealed_by,
  r.face,
  r.economic_ref_type,
  r.economic_ref_id,
  r.ledger_event_id,
  r.payload
FROM core.receipts r;
GRANT SELECT ON core.v_receipts TO authenticated, service_role;
COMMIT;
