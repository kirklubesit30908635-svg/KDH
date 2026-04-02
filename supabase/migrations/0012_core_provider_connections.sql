-- =============================================================
-- 0012_core_provider_connections.sql
-- core.provider_connections: workspace-to-provider account
-- binding table. This is the trust anchor for all external
-- provider ingest (Stripe, etc.).
--
-- workspace_id in all downstream ingest flows is derived from
-- this table — never trusted from caller-supplied input.
-- =============================================================

-- ---------------------------------------------------------------
-- core.set_updated_at
-- Generic updated_at maintenance trigger for core tables.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION core.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION core.set_updated_at() FROM PUBLIC;
-- ---------------------------------------------------------------
-- core.provider_connections
-- One row per workspace-to-provider-account binding.
-- A single Stripe account may only bind to one workspace
-- (enforced by UNIQUE on provider + provider_account_id).
-- ---------------------------------------------------------------
CREATE TABLE core.provider_connections (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id         uuid        NOT NULL REFERENCES core.workspaces (id),
  provider             text        NOT NULL
                                   CHECK (provider IN ('stripe')),
  provider_account_id  text        NOT NULL,
  livemode             boolean     NOT NULL,
  is_active            boolean     NOT NULL DEFAULT true,
  config               jsonb       NOT NULL DEFAULT '{}',
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  -- One provider account maps to exactly one workspace.
  UNIQUE (provider, provider_account_id)
);
COMMENT ON TABLE core.provider_connections IS
  'Workspace-to-provider account bindings. The trust anchor for all '
  'external event ingest. workspace_id is always derived from this '
  'table — never accepted from caller-supplied input.';
CREATE INDEX idx_core_provider_connections_workspace
  ON core.provider_connections (workspace_id);
CREATE INDEX idx_core_provider_connections_provider_account
  ON core.provider_connections (provider, provider_account_id)
  WHERE is_active = true;
CREATE TRIGGER provider_connections_set_updated_at
  BEFORE UPDATE ON core.provider_connections
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
-- ---------------------------------------------------------------
-- ACL
-- Authenticated operators may read their own workspace bindings.
-- No direct write path; connections are managed by privileged
-- administrative functions only.
-- ---------------------------------------------------------------
REVOKE ALL ON TABLE core.provider_connections FROM anon, authenticated;
ALTER TABLE core.provider_connections ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE core.provider_connections TO authenticated;
CREATE POLICY provider_connections_select_member
  ON core.provider_connections
  FOR SELECT TO authenticated
  USING (core.is_member(workspace_id));
