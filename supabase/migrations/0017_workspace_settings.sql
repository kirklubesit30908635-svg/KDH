-- =============================================================
-- 0017_workspace_settings.sql
-- Workspace-level configuration table.
--
-- Lifts operator-visible economics out of hardcoded constants
-- and into governed, auditable workspace config.
--
-- Initial keys:
--   labor_rate_cents     — hourly labor rate for leakage calc
--   quote_close_risk_rate — open quote leakage weight (decimal)
--   backorder_risk_rate   — backorder delay leakage weight (decimal)
--
-- Pattern: one row per workspace per key. Typed via jsonb value
-- so numeric, boolean, and string configs share one table.
-- All writes go through the governed mutation path.
-- =============================================================

BEGIN;
CREATE TABLE IF NOT EXISTS core.workspace_settings (
  setting_id    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid        NOT NULL REFERENCES core.workspaces(id) ON DELETE CASCADE,
  key           text        NOT NULL,
  value         jsonb       NOT NULL,
  description   text,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    uuid        REFERENCES core.operators(id),
  UNIQUE (workspace_id, key)
);
COMMENT ON TABLE core.workspace_settings IS
'Workspace-level configuration. One row per workspace per key. '
'All mutation via governed proposals — no direct UI writes.';
COMMENT ON COLUMN core.workspace_settings.key IS
'Config key. Known keys: labor_rate_cents, quote_close_risk_rate, backorder_risk_rate.';
COMMENT ON COLUMN core.workspace_settings.value IS
'Typed jsonb value. Numeric example: 15000. Decimal example: 0.12. Boolean example: true.';
-- ---------------------------------------------------------------
-- Index: primary access pattern is lookup by workspace + key
-- ---------------------------------------------------------------
CREATE INDEX idx_workspace_settings_workspace_key
  ON core.workspace_settings (workspace_id, key);
-- ---------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------
CREATE TRIGGER workspace_settings_set_updated_at
  BEFORE UPDATE ON core.workspace_settings
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
-- ---------------------------------------------------------------
-- RLS: readable by workspace members, writable only via kernel
-- (no direct insert/update policy for authenticated role —
--  all writes go through fn_execute_proposal → applyLocalSideEffect)
-- ---------------------------------------------------------------
ALTER TABLE core.workspace_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_settings_select
  ON core.workspace_settings FOR SELECT
  USING (core.is_member(workspace_id));
-- No INSERT/UPDATE policy for authenticated — governed writes only.

-- ---------------------------------------------------------------
-- API read function: get a typed setting value for caller's workspace
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION api.get_workspace_setting(
  p_workspace_id uuid,
  p_key          text
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT value
    FROM core.workspace_settings
   WHERE workspace_id = p_workspace_id
     AND key         = p_key
     AND core.is_member(p_workspace_id)
   LIMIT 1;
$$;
REVOKE ALL ON FUNCTION api.get_workspace_setting(uuid, text) FROM public;
GRANT  EXECUTE ON FUNCTION api.get_workspace_setting(uuid, text) TO authenticated;
COMMIT;
