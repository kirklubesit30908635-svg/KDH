-- =============================================================
-- 0003_identity.sql
-- core schema: tenants, workspaces, departments, operators,
-- workspace_members, and the identity/membership helper functions.
-- =============================================================

-- ---------------------------------------------------------------
-- Tenant / Workspace / Department
-- ---------------------------------------------------------------

CREATE TABLE core.tenants (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       text        NOT NULL UNIQUE,
  name       text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE core.workspaces (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid        NOT NULL REFERENCES core.tenants (id),
  slug       text        NOT NULL,
  name       text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);
CREATE TABLE core.departments (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid        NOT NULL REFERENCES core.workspaces (id),
  slug         text        NOT NULL,
  name         text        NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, slug)
);
-- ---------------------------------------------------------------
-- Operators and Workspace Members
-- ---------------------------------------------------------------

CREATE TABLE core.operators (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Soft reference to auth.users; no FK to keep kernel schema-independent.
  auth_uid   uuid        UNIQUE,
  handle     text        NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE core.workspace_members (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id  uuid        NOT NULL REFERENCES core.operators (id),
  workspace_id uuid        NOT NULL REFERENCES core.workspaces (id),
  role         text        NOT NULL DEFAULT 'member'
                           CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operator_id, workspace_id)
);
-- ---------------------------------------------------------------
-- core.current_operator_id
-- Resolves the core.operators row for the current Supabase auth
-- session. Not SECURITY DEFINER — runs as the session user, so
-- RLS on core.operators must grant self-reads (see 0007_rls.sql).
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION core.current_operator_id()
RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT id FROM core.operators WHERE auth_uid = auth.uid();
$$;
-- ---------------------------------------------------------------
-- core.is_member
-- Returns TRUE when the session operator holds any membership in
-- the target workspace. Called from RLS USING clauses; must be
-- EXECUTE-accessible to authenticated (see 0007_rls.sql).
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION core.is_member(p_workspace_id uuid)
RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1
      FROM core.workspace_members
     WHERE operator_id  = core.current_operator_id()
       AND workspace_id = p_workspace_id
  );
$$;
-- ---------------------------------------------------------------
-- core.assert_member
-- Raises an exception when the session operator is not a member.
-- Called only from SECURITY DEFINER api.* functions (postgres
-- superuser context); no direct authenticated call path.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION core.assert_member(p_workspace_id uuid)
RETURNS void
LANGUAGE plpgsql STABLE AS $$
BEGIN
  IF NOT core.is_member(p_workspace_id) THEN
    RAISE EXCEPTION 'operator % is not a member of workspace %',
      core.current_operator_id(), p_workspace_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
END;
$$;
