-- =====================================================
-- Rebuild core.obligations / core.objects for founder
-- console schema (kernel_constitution_v1).
--
-- Old tables (from 0020) had different columns (title,
-- severity, sealed_at). The constitution migration used
-- IF NOT EXISTS so it was a no-op. This drops and
-- recreates with the correct schema.
-- =====================================================

BEGIN;
-- 1. Drop dependent views
DROP VIEW IF EXISTS core.v_next_actions CASCADE;
DROP VIEW IF EXISTS core.v_receipts CASCADE;
-- 2. Drop old tables (FK order)
DROP TABLE IF EXISTS core.receipts CASCADE;
DROP TABLE IF EXISTS core.obligations CASCADE;
DROP TABLE IF EXISTS core.objects CASCADE;
DROP TABLE IF EXISTS core.object_class_postures CASCADE;
DROP TABLE IF EXISTS core.reason_codes CASCADE;
-- =====================================================
-- VOCAB
-- =====================================================

CREATE TABLE core.object_class_postures (
    kernel_class     text NOT NULL,
    economic_posture text NOT NULL,
    PRIMARY KEY (kernel_class, economic_posture)
);
CREATE TABLE core.reason_codes (
    code      text PRIMARY KEY,
    category  text NOT NULL,
    is_active boolean NOT NULL DEFAULT true
);
INSERT INTO core.reason_codes (code, category) VALUES
  ('customer_declined',       'sales'),
  ('unqualified',             'sales'),
  ('duplicate',               'system'),
  ('no_response',             'sales'),
  ('pricing_rejected',        'sales'),
  ('invalid_object',          'system'),
  ('external_loss',           'external'),
  ('client_routed_elsewhere', 'external')
ON CONFLICT DO NOTHING;
-- =====================================================
-- OBJECTS
-- =====================================================

CREATE TABLE core.objects (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id                uuid NOT NULL,
    kernel_class                text NOT NULL,
    economic_posture            text NOT NULL,
    status                      text NOT NULL DEFAULT 'acknowledged',
    acknowledged_at             timestamptz NOT NULL DEFAULT now(),
    acknowledged_by_actor_class text NOT NULL,
    acknowledged_by_actor_id    text NOT NULL,
    source_ref                  text,
    metadata                    jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT objects_status_check CHECK (
        status IN ('acknowledged','under_governance','terminal_resolution_recorded')
    )
);
-- =====================================================
-- OBLIGATIONS
-- =====================================================

CREATE TABLE core.obligations (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id            uuid NOT NULL,
    object_id               uuid NOT NULL REFERENCES core.objects(id),
    obligation_type         text NOT NULL,
    state                   text NOT NULL DEFAULT 'open',
    opened_at               timestamptz NOT NULL DEFAULT now(),
    opened_by_actor_class   text NOT NULL,
    opened_by_actor_id      text NOT NULL,
    resolved_at             timestamptz,
    resolved_by_actor_class text,
    resolved_by_actor_id    text,
    terminal_action         text,
    terminal_reason_code    text,
    metadata                jsonb NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT obligation_state_check CHECK (
        state IN ('open','active','resolved')
    ),
    CONSTRAINT obligation_terminal_action_check CHECK (
        terminal_action IN ('closed','terminated','eliminated')
        OR terminal_action IS NULL
    )
);
-- =====================================================
-- RLS
-- =====================================================

ALTER TABLE core.object_class_postures ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.reason_codes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.objects               ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.obligations           ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_postures"    ON core.object_class_postures FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all_reason"      ON core.reason_codes          FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all_objects"     ON core.objects               FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all_obligations" ON core.obligations           FOR ALL TO service_role USING (true);
CREATE POLICY "auth_read_objects"            ON core.objects      FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read_obligations"        ON core.obligations  FOR SELECT TO authenticated USING (true);
-- =====================================================
-- GRANTS
-- =====================================================

GRANT USAGE  ON SCHEMA core   TO service_role;
GRANT USAGE  ON SCHEMA api    TO service_role;
GRANT USAGE  ON SCHEMA ledger TO service_role;
GRANT SELECT ON core.objects               TO service_role, authenticated;
GRANT SELECT ON core.obligations           TO service_role, authenticated;
GRANT SELECT ON core.object_class_postures TO service_role;
GRANT SELECT ON core.reason_codes          TO service_role;
GRANT SELECT ON ledger.events              TO service_role;
GRANT SELECT ON ledger.receipts            TO service_role;
-- =====================================================
-- RPCs
-- =====================================================

CREATE OR REPLACE FUNCTION api.acknowledge_object(
    p_workspace_id     uuid,
    p_kernel_class     text,
    p_economic_posture text,
    p_actor_class      text,
    p_actor_id         text,
    p_metadata         jsonb DEFAULT '{}'::jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_object_id uuid;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM core.object_class_postures
        WHERE kernel_class = p_kernel_class
          AND economic_posture = p_economic_posture
    ) THEN
        RAISE EXCEPTION 'invalid kernel_class/economic_posture: %/%', p_kernel_class, p_economic_posture;
    END IF;

    INSERT INTO core.objects(
        workspace_id, kernel_class, economic_posture,
        acknowledged_by_actor_class, acknowledged_by_actor_id, metadata
    ) VALUES (
        p_workspace_id, p_kernel_class, p_economic_posture,
        p_actor_class, p_actor_id, p_metadata
    ) RETURNING id INTO v_object_id;

    RETURN v_object_id;
END;
$$;
CREATE OR REPLACE FUNCTION api.open_obligation(
    p_workspace_id    uuid,
    p_object_id       uuid,
    p_obligation_type text,
    p_actor_class     text,
    p_actor_id        text,
    p_metadata        jsonb DEFAULT '{}'::jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_obligation_id uuid;
BEGIN
    INSERT INTO core.obligations(
        workspace_id, object_id, obligation_type,
        opened_by_actor_class, opened_by_actor_id, metadata
    ) VALUES (
        p_workspace_id, p_object_id, p_obligation_type,
        p_actor_class, p_actor_id, p_metadata
    ) RETURNING id INTO v_obligation_id;

    RETURN v_obligation_id;
END;
$$;
CREATE OR REPLACE FUNCTION api.resolve_obligation(
    p_obligation_id   uuid,
    p_terminal_action text,
    p_reason_code     text,
    p_actor_class     text,
    p_actor_id        text,
    p_metadata        jsonb DEFAULT '{}'::jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    UPDATE core.obligations SET
        state                   = 'resolved',
        terminal_action         = p_terminal_action,
        terminal_reason_code    = p_reason_code,
        resolved_at             = now(),
        resolved_by_actor_class = p_actor_class,
        resolved_by_actor_id    = p_actor_id,
        metadata                = COALESCE(metadata,'{}'::jsonb) || p_metadata
    WHERE id = p_obligation_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'obligation % not found', p_obligation_id;
    END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION api.acknowledge_object(uuid,text,text,text,text,jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION api.open_obligation(uuid,uuid,text,text,text,jsonb)    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION api.resolve_obligation(uuid,text,text,text,text,jsonb) TO authenticated, service_role;
-- =====================================================
-- SEED posture matrix
-- =====================================================

INSERT INTO core.object_class_postures (kernel_class, economic_posture) VALUES
  ('lead',       'revenue_candidate'),
  ('invoice',    'direct_revenue'),
  ('invoice',    'revenue_recovery'),
  ('job',        'direct_revenue'),
  ('job',        'cost_exposure'),
  ('campaign',   'revenue_candidate'),
  ('inspection', 'cost_exposure'),
  ('payment',    'direct_revenue'),
  ('payment',    'revenue_recovery')
ON CONFLICT DO NOTHING;
COMMIT;
