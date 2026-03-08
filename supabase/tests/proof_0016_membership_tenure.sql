-- =====================================================================
-- proof_0016_membership_tenure.sql
-- Proof pass for 0016_membership_tenure.sql
--
-- Verifies core.is_member() boundary semantics against real table rows
-- and a mocked auth.uid() via request.jwt.claims.
--
-- Run:   psql $DATABASE_URL -f supabase/tests/proof_0016_membership_tenure.sql
-- Safe:  wraps all fixtures in a transaction that is always rolled back.
-- =====================================================================

BEGIN;

DO $$
DECLARE
  v_tenant_id    uuid := gen_random_uuid();
  v_workspace_id uuid := gen_random_uuid();
  v_auth_uid     uuid := gen_random_uuid();
  v_operator_id  uuid;
  v_result       boolean;
BEGIN

  -- ------------------------------------------------------------------
  -- Fixtures
  -- ------------------------------------------------------------------
  INSERT INTO core.tenants (id, slug, name)
    VALUES (v_tenant_id,
            'proof-' || left(v_tenant_id::text, 8),
            'Proof Tenant');

  INSERT INTO core.workspaces (id, tenant_id, slug, name)
    VALUES (v_workspace_id, v_tenant_id, 'proof-ws', 'Proof Workspace');

  INSERT INTO core.operators (auth_uid, handle)
    VALUES (v_auth_uid, 'proof-op-' || left(v_auth_uid::text, 8))
    RETURNING id INTO v_operator_id;

  -- Mock Supabase auth.uid() → v_auth_uid for this transaction.
  -- auth.uid() reads current_setting('request.jwt.claims')::jsonb->>'sub'
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_auth_uid::text)::text,
    true
  );

  -- Sanity: confirm the mock resolves to our operator.
  ASSERT core.current_operator_id() = v_operator_id,
    'SETUP FAIL: current_operator_id() mock not resolving correctly';

  -- ==================================================================
  -- CASE 1: Active member access
  -- status=active, active_from=past, active_to=null
  -- Expected: TRUE
  -- ==================================================================
  INSERT INTO core.memberships (operator_id, workspace_id, status, active_from, active_to)
    VALUES (v_operator_id, v_workspace_id, 'active', now() - interval '1 hour', NULL);

  SELECT core.is_member(v_workspace_id) INTO v_result;
  ASSERT v_result IS TRUE,
    'FAIL case 1: active member (past active_from, null active_to) should return true';

  DELETE FROM core.memberships
   WHERE operator_id = v_operator_id AND workspace_id = v_workspace_id;

  -- ==================================================================
  -- CASE 2: Inactive member denial
  -- status=suspended, window otherwise valid
  -- Exercises all non-active statuses via suspended.
  -- Expected: FALSE
  -- ==================================================================
  INSERT INTO core.memberships (operator_id, workspace_id, status, active_from, active_to)
    VALUES (v_operator_id, v_workspace_id, 'suspended', now() - interval '1 hour', NULL);

  SELECT core.is_member(v_workspace_id) INTO v_result;
  ASSERT v_result IS FALSE,
    'FAIL case 2: suspended member (valid window) should return false';

  DELETE FROM core.memberships
   WHERE operator_id = v_operator_id AND workspace_id = v_workspace_id;

  -- ==================================================================
  -- CASE 3: Future-dated member denial
  -- status=active, active_from=future — membership not yet open
  -- Expected: FALSE
  -- ==================================================================
  INSERT INTO core.memberships (operator_id, workspace_id, status, active_from, active_to)
    VALUES (v_operator_id, v_workspace_id, 'active', now() + interval '1 day', NULL);

  SELECT core.is_member(v_workspace_id) INTO v_result;
  ASSERT v_result IS FALSE,
    'FAIL case 3: future-dated member (active_from > now()) should return false';

  DELETE FROM core.memberships
   WHERE operator_id = v_operator_id AND workspace_id = v_workspace_id;

  -- ==================================================================
  -- CASE 4: Expired member denial
  -- status=active, active_to in the past — exclusive upper bound
  -- active_from must precede active_to per constraint, so both are past.
  -- Confirms active_to = past is denied (not equal-to-now edge case).
  -- Expected: FALSE
  -- ==================================================================
  INSERT INTO core.memberships (operator_id, workspace_id, status, active_from, active_to)
    VALUES (v_operator_id, v_workspace_id, 'active',
            now() - interval '2 hours',
            now() - interval '1 second');   -- active_to is in the past

  SELECT core.is_member(v_workspace_id) INTO v_result;
  ASSERT v_result IS FALSE,
    'FAIL case 4: expired member (active_to < now()) should return false';

  DELETE FROM core.memberships
   WHERE operator_id = v_operator_id AND workspace_id = v_workspace_id;

  -- ==================================================================
  -- CASE 5: Null active_to open-ended access
  -- Distinct from case 1: explicitly proves null active_to is the
  -- open-ended access path — not a missing value that defaults to denial.
  -- status=active, active_from=30 days ago, active_to=null
  -- Expected: TRUE
  -- ==================================================================
  INSERT INTO core.memberships (operator_id, workspace_id, status, active_from, active_to)
    VALUES (v_operator_id, v_workspace_id, 'active', now() - interval '30 days', NULL);

  SELECT core.is_member(v_workspace_id) INTO v_result;
  ASSERT v_result IS TRUE,
    'FAIL case 5: null active_to should be open-ended access (true)';

  DELETE FROM core.memberships
   WHERE operator_id = v_operator_id AND workspace_id = v_workspace_id;

  -- ==================================================================
  RAISE NOTICE 'proof_0016: all 5 cases PASSED';

END;
$$;

ROLLBACK;
