-- =============================================================
-- 20260404150000_rename_memberships_to_workspace_members.sql
--
-- Establishes core.workspace_members as the sole canonical
-- membership authority. Removes core.memberships from the live
-- authority path.
--
-- Changes:
--   1. Rename core.memberships → core.workspace_members
--   2. Rename index and trigger to match new table name
--   3. Rename RLS policy to match new table name
--   4. Replace core.is_member() to query workspace_members
--   5. Replace api.project_operator_subscription_event to remove
--      the core.memberships reference in both event handlers
--
-- Safe to apply to production:
--   - ALTER TABLE RENAME preserves all data, constraints, indexes,
--     triggers, and RLS policies; the rename is instantaneous.
--   - All function replacements are CREATE OR REPLACE.
--   - No data movement or schema structure change.
-- =============================================================

BEGIN;

-- ---------------------------------------------------------------
-- Guard: this migration is only meaningful on a live DB that was
-- created before 0003 was rewritten to use workspace_members
-- directly. On a fresh reset the table is already workspace_members
-- and none of these renames are needed. All steps are conditional.
-- ---------------------------------------------------------------

-- ---------------------------------------------------------------
-- 1. Rename the table (no-op if core.memberships does not exist)
-- ---------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'core' AND table_name = 'memberships'
  ) THEN
    ALTER TABLE core.memberships RENAME TO workspace_members;
  END IF;
END;
$$;

-- ---------------------------------------------------------------
-- 2. Rename constraints and indexes to match
-- ---------------------------------------------------------------
ALTER INDEX IF EXISTS memberships_active_window_check
  RENAME TO workspace_members_active_window_check;

-- The unique constraint (operator_id, workspace_id) was created
-- implicitly; its backing index name follows the table name.
-- Rename it explicitly for clarity.
ALTER INDEX IF EXISTS memberships_operator_id_workspace_id_key
  RENAME TO workspace_members_operator_id_workspace_id_key;

ALTER INDEX IF EXISTS idx_memberships_workspace_operator_active
  RENAME TO idx_workspace_members_workspace_operator_active;

-- ---------------------------------------------------------------
-- 3. Rename the updated_at trigger (only if old name still exists)
-- ---------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE trigger_schema = 'core'
      AND event_object_table = 'workspace_members'
      AND trigger_name = 'memberships_set_updated_at'
  ) THEN
    ALTER TRIGGER memberships_set_updated_at
      ON core.workspace_members
      RENAME TO workspace_members_set_updated_at;
  END IF;
END;
$$;

-- ---------------------------------------------------------------
-- 4. Rename the RLS policy (only if old name still exists)
-- ---------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'core'
      AND tablename  = 'workspace_members'
      AND policyname = 'memberships_select_own'
  ) THEN
    ALTER POLICY memberships_select_own ON core.workspace_members
      RENAME TO workspace_members_select_own;
  END IF;
END;
$$;

-- ---------------------------------------------------------------
-- 5. Replace core.is_member() to reference workspace_members
--    (the table rename would update the definition automatically
--    for plpgsql but the SQL function retains the old text;
--    replace explicitly to keep prosrc clean and lint-safe).
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION core.is_member(p_workspace_id uuid)
RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1
      FROM core.workspace_members
     WHERE operator_id  = core.current_operator_id()
       AND workspace_id = p_workspace_id
       AND status       = 'active'
       AND active_from  <= now()
       AND (active_to IS NULL OR active_to > now())
  );
$$;

-- ---------------------------------------------------------------
-- 6. Fix api.project_operator_subscription_event — remove the
--    core.memberships reference in both Stripe event handlers.
--    Copied from 20260316043000 with memberships → workspace_members.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION api.project_operator_subscription_event(
  p_event_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_event_type      text;
  v_workspace_id    uuid;
  v_payload         jsonb;
  v_object          jsonb;
  v_auth_uid_text   text;
  v_customer_id     text;
  v_subscription_id text;
  v_rows_updated    integer := 0;
BEGIN
  SELECT et.name, e.workspace_id, e.payload
    INTO v_event_type, v_workspace_id, v_payload
    FROM ledger.events e
    JOIN registry.event_types et
      ON et.id = e.event_type_id
   WHERE e.id = p_event_id;

  IF v_event_type IS NULL THEN
    RAISE EXCEPTION 'ledger event not found: %', p_event_id
      USING ERRCODE = 'no_data_found';
  END IF;

  v_object := COALESCE(v_payload -> 'data' -> 'object', '{}'::jsonb);

  IF v_event_type = 'stripe.checkout.session.completed' THEN
    v_auth_uid_text   := nullif(v_object #>> '{metadata,operator_auth_uid}', '');
    v_customer_id     := nullif(v_object ->> 'customer', '');
    v_subscription_id := nullif(v_object ->> 'subscription', '');

    IF v_auth_uid_text IS NULL OR v_customer_id IS NULL OR v_subscription_id IS NULL THEN
      RETURN jsonb_build_object(
        'event_id',   p_event_id,
        'event_type', v_event_type,
        'projection', 'skipped'
      );
    END IF;

    UPDATE core.operators o
       SET stripe_customer_id     = v_customer_id,
           stripe_subscription_id = v_subscription_id,
           subscription_status    = 'active'
     WHERE o.auth_uid::text = v_auth_uid_text
       AND EXISTS (
         SELECT 1
           FROM core.workspace_members m
          WHERE m.operator_id  = o.id
            AND m.workspace_id = v_workspace_id
       );

    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

    RETURN jsonb_build_object(
      'event_id',     p_event_id,
      'event_type',   v_event_type,
      'projection',   CASE WHEN v_rows_updated > 0 THEN 'updated' ELSE 'skipped' END,
      'rows_updated', v_rows_updated
    );
  END IF;

  IF v_event_type = 'stripe.customer.subscription.deleted' THEN
    v_customer_id := nullif(v_object ->> 'customer', '');

    IF v_customer_id IS NULL THEN
      RETURN jsonb_build_object(
        'event_id',   p_event_id,
        'event_type', v_event_type,
        'projection', 'skipped'
      );
    END IF;

    UPDATE core.operators o
       SET subscription_status = 'inactive'
     WHERE o.stripe_customer_id = v_customer_id
       AND EXISTS (
         SELECT 1
           FROM core.workspace_members m
          WHERE m.operator_id  = o.id
            AND m.workspace_id = v_workspace_id
       );

    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

    RETURN jsonb_build_object(
      'event_id',     p_event_id,
      'event_type',   v_event_type,
      'projection',   CASE WHEN v_rows_updated > 0 THEN 'updated' ELSE 'skipped' END,
      'rows_updated', v_rows_updated
    );
  END IF;

  RETURN jsonb_build_object(
    'event_id',   p_event_id,
    'event_type', v_event_type,
    'projection', 'skipped'
  );
END;
$$;

REVOKE ALL ON FUNCTION api.project_operator_subscription_event(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION api.project_operator_subscription_event(uuid) TO service_role;

COMMIT;
