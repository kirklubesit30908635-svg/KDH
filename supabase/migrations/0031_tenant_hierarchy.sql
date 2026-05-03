-- ── Tenant hierarchy ──────────────────────────────────────────────────────────
ALTER TABLE core.tenants
  ADD COLUMN IF NOT EXISTS parent_tenant_id uuid REFERENCES core.tenants(id);
CREATE INDEX IF NOT EXISTS idx_tenants_parent_id
  ON core.tenants (parent_tenant_id)
  WHERE parent_tenant_id IS NOT NULL;
-- ── KDH corporate hierarchy ───────────────────────────────────────────────────

-- Root: Kirk Digital Holdings LLC
INSERT INTO core.tenants (id, slug, name)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'kdh',
  'Kirk Digital Holdings LLC'
)
ON CONFLICT (slug) DO NOTHING;
-- Child: AutoKirk IP Holdings LLC
INSERT INTO core.tenants (id, slug, name, parent_tenant_id)
VALUES (
  'a0000000-0000-0000-0000-000000000002',
  'ak-ip',
  'AutoKirk IP Holdings LLC',
  'a0000000-0000-0000-0000-000000000001'
)
ON CONFLICT (slug) DO NOTHING;
-- Grandchild: AutoKirk Systems
INSERT INTO core.tenants (id, slug, name, parent_tenant_id)
VALUES (
  'a0000000-0000-0000-0000-000000000003',
  'ak-systems',
  'AutoKirk Systems',
  'a0000000-0000-0000-0000-000000000002'
)
ON CONFLICT (slug) DO NOTHING;
-- ── Workspaces ────────────────────────────────────────────────────────────────

INSERT INTO core.workspaces (id, tenant_id, slug, name)
VALUES (
  'b0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'kdh-ops',
  'KDH Operations'
)
ON CONFLICT (tenant_id, slug) DO NOTHING;
INSERT INTO core.workspaces (id, tenant_id, slug, name)
VALUES (
  'b0000000-0000-0000-0000-000000000002',
  'a0000000-0000-0000-0000-000000000003',
  'ak-ops',
  'AK Systems Operations'
)
ON CONFLICT (tenant_id, slug) DO NOTHING;
-- ── Memberships — founder as owner on both workspaces ─────────────────────────
-- Resolves operator by email via auth.users join.
-- No-op if operator not yet provisioned (first login creates the row).

INSERT INTO core.workspace_members (operator_id, workspace_id, role, status)
SELECT
  op.id,
  ws.id,
  'owner',
  'active'
FROM core.operators op
JOIN auth.users au ON au.id = op.auth_uid
CROSS JOIN (
  SELECT id FROM core.workspaces WHERE slug IN ('kdh-ops', 'ak-ops')
) ws
WHERE au.email = 'kirklubesit30908635@gmail.com'
ON CONFLICT (operator_id, workspace_id) DO NOTHING;  -- core.workspace_members unique constraint
