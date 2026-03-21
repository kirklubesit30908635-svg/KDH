-- =============================================================
-- 20260314170000_fix_rpc_member_guards.sql
--
-- Adds core.assert_member() workspace guard to the three RPCs
-- that were missing it in the rebuild migration
-- (20260314161901_rebuild_core_for_founder_console.sql):
--
--   api.acknowledge_object  — p_workspace_id guard
--   api.open_obligation     — p_workspace_id guard
--   api.resolve_obligation  — workspace lookup guard
--
-- Also fixes api.resolve_obligation:
--   - Looks up workspace_id from the obligation row
--   - Adds AND state != 'resolved' to the UPDATE to prevent
--     silent double-resolution
--
-- Pattern matches api.append_event / api.emit_receipt (0006_api.sql):
--   PERFORM core.assert_member(p_workspace_id);
-- =============================================================

-- ---------------------------------------------------------------
-- api.acknowledge_object
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION api.acknowledge_object(
    p_workspace_id     uuid,
    p_kernel_class     text,
    p_economic_posture text,
    p_actor_class      text,
    p_actor_id         text,
    p_metadata         jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    v_object_id uuid;
BEGIN
    PERFORM core.assert_member(p_workspace_id);

    IF NOT EXISTS (
        SELECT 1 FROM core.object_class_postures
        WHERE kernel_class     = p_kernel_class
          AND economic_posture = p_economic_posture
    ) THEN
        RAISE EXCEPTION 'invalid kernel_class/economic_posture: %/%',
            p_kernel_class, p_economic_posture;
    END IF;

    INSERT INTO core.objects(
        workspace_id,
        kernel_class,
        economic_posture,
        acknowledged_by_actor_class,
        acknowledged_by_actor_id,
        metadata
    ) VALUES (
        p_workspace_id,
        p_kernel_class,
        p_economic_posture,
        p_actor_class,
        p_actor_id,
        p_metadata
    )
    RETURNING id INTO v_object_id;

    RETURN v_object_id;
END;
$$;
-- ---------------------------------------------------------------
-- api.open_obligation
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION api.open_obligation(
    p_workspace_id    uuid,
    p_object_id       uuid,
    p_obligation_type text,
    p_actor_class     text,
    p_actor_id        text,
    p_metadata        jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    v_obligation_id uuid;
BEGIN
    PERFORM core.assert_member(p_workspace_id);

    IF NOT EXISTS (
        SELECT 1 FROM core.objects
        WHERE id = p_object_id
          AND workspace_id = p_workspace_id
    ) THEN
        RAISE EXCEPTION 'object % not found in workspace %',
            p_object_id, p_workspace_id;
    END IF;

    INSERT INTO core.obligations(
        workspace_id,
        object_id,
        obligation_type,
        opened_by_actor_class,
        opened_by_actor_id,
        metadata
    ) VALUES (
        p_workspace_id,
        p_object_id,
        p_obligation_type,
        p_actor_class,
        p_actor_id,
        p_metadata
    )
    RETURNING id INTO v_obligation_id;

    RETURN v_obligation_id;
END;
$$;
-- ---------------------------------------------------------------
-- api.resolve_obligation
--
-- resolve_obligation takes an obligation ID, not a workspace ID,
-- so we look up the workspace from the obligation row and call
-- assert_member on that. This prevents cross-workspace resolution.
--
-- Also adds AND state != 'resolved' to the UPDATE so a second
-- call does not silently overwrite terminal data on an already-
-- resolved obligation.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION api.resolve_obligation(
    p_obligation_id   uuid,
    p_terminal_action text,
    p_reason_code     text,
    p_actor_class     text,
    p_actor_id        text,
    p_metadata        jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    v_workspace_id uuid;
BEGIN
    SELECT workspace_id INTO v_workspace_id
      FROM core.obligations
     WHERE id = p_obligation_id;

    IF v_workspace_id IS NULL THEN
        RAISE EXCEPTION 'obligation % not found', p_obligation_id;
    END IF;

    PERFORM core.assert_member(v_workspace_id);

    UPDATE core.obligations SET
        state                   = 'resolved',
        terminal_action         = p_terminal_action,
        terminal_reason_code    = p_reason_code,
        resolved_at             = now(),
        resolved_by_actor_class = p_actor_class,
        resolved_by_actor_id    = p_actor_id,
        metadata                = COALESCE(metadata, '{}'::jsonb) || p_metadata
    WHERE id    = p_obligation_id
      AND state != 'resolved';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'obligation % is already resolved', p_obligation_id;
    END IF;
END;
$$;
-- Grants unchanged — same callers.
GRANT EXECUTE ON FUNCTION api.acknowledge_object(uuid, text, text, text, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION api.open_obligation(uuid, uuid, text, text, text, jsonb)    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION api.resolve_obligation(uuid, text, text, text, text, jsonb) TO authenticated, service_role;
