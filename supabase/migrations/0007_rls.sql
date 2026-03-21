-- =============================================================
-- 0007_rls.sql
-- Full kernel ACL: RLS enables, policies, REVOKE ALL on kernel
-- tables, GRANT SELECT on read paths, REVOKE/GRANT EXECUTE on
-- functions, and schema USAGE grants.
-- =============================================================

-- ---------------------------------------------------------------
-- Schema USAGE grants
-- authenticated must have USAGE on every schema that contains
-- objects they are permitted to reach (via table grants or
-- EXECUTE grants on api functions).
-- ---------------------------------------------------------------
GRANT USAGE ON SCHEMA core     TO authenticated;
GRANT USAGE ON SCHEMA registry TO authenticated;
GRANT USAGE ON SCHEMA ledger   TO authenticated;
-- api USAGE already granted in 0006_api.sql; repeated here is
-- harmless (GRANT is idempotent) and makes this file authoritative.
GRANT USAGE ON SCHEMA api      TO authenticated;
-- ---------------------------------------------------------------
-- 7a. RLS on mutable pointer tables
-- chain_heads and receipt_heads are legitimately updated by kernel
-- BEFORE INSERT triggers. A _deny_mutation trigger would block
-- those internal writes and is intentionally omitted.
-- Client isolation: REVOKE ALL + default-deny RLS.
-- postgres superuser bypasses RLS (required for trigger writes).
-- ---------------------------------------------------------------
ALTER TABLE ledger.chain_heads   ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger.receipt_heads ENABLE ROW LEVEL SECURITY;
-- ---------------------------------------------------------------
-- 7b. RLS on append-only ledger tables
-- ---------------------------------------------------------------
ALTER TABLE ledger.events   ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger.receipts ENABLE ROW LEVEL SECURITY;
-- Authenticated operators may SELECT events in workspaces they
-- belong to. No INSERT/UPDATE/DELETE policy: all writes must go
-- through api.append_event.
CREATE POLICY events_select_member ON ledger.events
  FOR SELECT TO authenticated
  USING (core.is_member(workspace_id));
-- Authenticated operators may SELECT receipts in their workspace.
-- No INSERT/UPDATE/DELETE policy: all writes must go through
-- api.emit_receipt.
CREATE POLICY receipts_select_member ON ledger.receipts
  FOR SELECT TO authenticated
  USING (core.is_member(workspace_id));
-- ---------------------------------------------------------------
-- 7c. REVOKE ALL direct table access from client roles
-- ---------------------------------------------------------------
REVOKE ALL ON TABLE core.tenants           FROM anon, authenticated;
REVOKE ALL ON TABLE core.workspaces        FROM anon, authenticated;
REVOKE ALL ON TABLE core.departments       FROM anon, authenticated;
REVOKE ALL ON TABLE core.operators         FROM anon, authenticated;
REVOKE ALL ON TABLE core.memberships       FROM anon, authenticated;
REVOKE ALL ON TABLE registry.event_types   FROM anon, authenticated;
REVOKE ALL ON TABLE registry.receipt_types FROM anon, authenticated;
REVOKE ALL ON TABLE ledger.chain_heads     FROM anon, authenticated;
REVOKE ALL ON TABLE ledger.events          FROM anon, authenticated;
REVOKE ALL ON TABLE ledger.receipt_heads   FROM anon, authenticated;
REVOKE ALL ON TABLE ledger.receipts        FROM anon, authenticated;
-- Reference catalogues are read-safe; expose to authenticated only.
GRANT SELECT ON TABLE registry.event_types   TO authenticated;
GRANT SELECT ON TABLE registry.receipt_types TO authenticated;
-- RLS read policies require table-level SELECT privilege to be
-- evaluated. Without these grants Postgres denies at the ACL layer
-- before RLS runs, making events_select_member and
-- receipts_select_member dead code. No write path is opened:
-- INSERT/UPDATE/DELETE remain revoked.
GRANT SELECT ON TABLE ledger.events   TO authenticated;
GRANT SELECT ON TABLE ledger.receipts TO authenticated;
-- ---------------------------------------------------------------
-- 7d. RLS on core identity tables
-- ---------------------------------------------------------------
-- tenants, workspaces, departments: REVOKE ALL in place; no
-- authenticated read path in the current kernel. RLS confirms
-- default-deny without requiring any policy.
ALTER TABLE core.tenants     ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.workspaces  ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.departments ENABLE ROW LEVEL SECURITY;
-- operators and memberships: PostgreSQL evaluates ACL (table-level
-- privileges) BEFORE RLS policy USING clauses. core.is_member()
-- and core.current_operator_id() run as the session user
-- (authenticated) inside RLS USING expressions on ledger.events
-- and ledger.receipts. Without GRANT SELECT on these tables, the
-- ACL check fails before RLS is reached — causing
-- current_operator_id() to error and is_member() to be
-- unreachable. GRANT SELECT opens the ACL gate; the RLS policies
-- below restrict which rows are actually visible.
ALTER TABLE core.operators ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE core.operators TO authenticated;
CREATE POLICY operators_select_self ON core.operators
  FOR SELECT TO authenticated
  USING (auth_uid = auth.uid());
ALTER TABLE core.memberships ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE core.memberships TO authenticated;
CREATE POLICY memberships_select_own ON core.memberships
  FOR SELECT TO authenticated
  USING (operator_id = core.current_operator_id());
-- ---------------------------------------------------------------
-- 7e. RLS on registry catalogues
-- event_types and receipt_types carry GRANT SELECT TO authenticated
-- above. Enabling RLS without a permissive SELECT policy makes that
-- grant unreachable (ACL-before-RLS). USING (true) is correct for
-- static catalogues.
-- ---------------------------------------------------------------
ALTER TABLE registry.event_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY event_types_select_all ON registry.event_types
  FOR SELECT TO authenticated
  USING (true);
ALTER TABLE registry.receipt_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY receipt_types_select_all ON registry.receipt_types
  FOR SELECT TO authenticated
  USING (true);
-- ---------------------------------------------------------------
-- 7f. Revoke PUBLIC EXECUTE from all internal functions
-- PostgreSQL grants EXECUTE to PUBLIC on every new function by
-- default. Internal functions must not be directly callable by
-- anon or authenticated.
-- ---------------------------------------------------------------

-- Trigger functions: the database engine fires triggers regardless
-- of EXECUTE privilege. REVOKE is safe; no re-grant needed.
REVOKE EXECUTE ON FUNCTION ledger._deny_mutation()          FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION ledger._events_before_insert()   FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION ledger._receipts_before_insert() FROM PUBLIC;
-- sha256_hex is called only from within trigger functions which
-- run as postgres (superuser). Superusers bypass EXECUTE ACL.
REVOKE EXECUTE ON FUNCTION ledger.sha256_hex(text)          FROM PUBLIC;
-- assert_member is called only from api.* SECURITY DEFINER
-- functions (postgres context). No authenticated direct call path.
REVOKE EXECUTE ON FUNCTION core.assert_member(uuid)         FROM PUBLIC;
-- current_operator_id and is_member are evaluated inside RLS
-- USING clauses on ledger.events and ledger.receipts. RLS policy
-- expressions run as the session user (authenticated), so
-- authenticated must retain EXECUTE on both.
REVOKE EXECUTE ON FUNCTION core.current_operator_id() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION core.current_operator_id() TO authenticated;
REVOKE EXECUTE ON FUNCTION core.is_member(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION core.is_member(uuid) TO authenticated;
