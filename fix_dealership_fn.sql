-- ================================================================
-- fix_dealership_fn.sql
-- Creates dealership.proposals, dealership.approvals,
-- dealership.executions, dealership.rpc_execute_proposal,
-- and rewrites the three broken fn_* functions.
-- ================================================================

BEGIN;

-- ----------------------------------------------------------------
-- 1. dealership.proposals
-- ----------------------------------------------------------------
CREATE TABLE dealership.proposals (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid        NOT NULL,
  action_type   text        NOT NULL
                            CHECK (action_type IN (
                              'bill_job', 'send_quote', 'close_job',
                              'update_job_state', 'update_parts_state',
                              'confirm_washbay', 'close_washbay',
                              'close_hr_ticket', 'log_contact',
                              'mark_ro_ready', 'mark_invoice_sent'
                            )),
  payload       jsonb       NOT NULL,
  proposal_hash text        NOT NULL,
  status        text        NOT NULL DEFAULT 'PENDING'
                            CHECK (status IN ('PENDING', 'APPROVED', 'EXECUTED', 'CANCELLED'))
);

-- ----------------------------------------------------------------
-- 2. dealership.approvals
-- ----------------------------------------------------------------
CREATE TABLE dealership.approvals (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid        NOT NULL,
  proposal_id   uuid        NOT NULL REFERENCES dealership.proposals (id) ON DELETE RESTRICT,
  proposal_hash text        NOT NULL,
  decision      text        NOT NULL CHECK (decision IN ('APPROVE', 'DENY')),
  expires_at    timestamptz NOT NULL,
  consumed_at   timestamptz
);

-- ----------------------------------------------------------------
-- 3. dealership.executions
-- (Cannot use ak_kernel.executions — its FKs bind to
--  ak_kernel.requests and ak_kernel.decisions.)
-- ----------------------------------------------------------------
CREATE TABLE dealership.executions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  proposal_id   uuid        NOT NULL REFERENCES dealership.proposals (id) ON DELETE RESTRICT,
  approval_id   uuid        NOT NULL UNIQUE
                            REFERENCES dealership.approvals (id) ON DELETE RESTRICT,
  receipt_id    uuid        NOT NULL REFERENCES ak_kernel.receipts (id) ON DELETE RESTRICT,
  status        text        NOT NULL CHECK (status IN ('SUCCESS', 'FAILED')),
  result        jsonb       NOT NULL DEFAULT '{}'
);

-- ----------------------------------------------------------------
-- 4. RLS — deny direct client writes; allow authenticated reads
-- ----------------------------------------------------------------
ALTER TABLE dealership.proposals  ENABLE ROW LEVEL SECURITY;
ALTER TABLE dealership.approvals  ENABLE ROW LEVEL SECURITY;
ALTER TABLE dealership.executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY proposals_select  ON dealership.proposals  FOR SELECT TO authenticated USING (true);
CREATE POLICY approvals_select  ON dealership.approvals  FOR SELECT TO authenticated USING (true);
CREATE POLICY executions_select ON dealership.executions FOR SELECT TO authenticated USING (true);

CREATE POLICY proposals_deny_insert  ON dealership.proposals  FOR INSERT TO anon, authenticated WITH CHECK (false);
CREATE POLICY proposals_deny_update  ON dealership.proposals  FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY proposals_deny_delete  ON dealership.proposals  FOR DELETE TO anon, authenticated USING (false);

CREATE POLICY approvals_deny_insert  ON dealership.approvals  FOR INSERT TO anon, authenticated WITH CHECK (false);
CREATE POLICY approvals_deny_update  ON dealership.approvals  FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY approvals_deny_delete  ON dealership.approvals  FOR DELETE TO anon, authenticated USING (false);

CREATE POLICY executions_deny_insert ON dealership.executions FOR INSERT TO anon, authenticated WITH CHECK (false);
CREATE POLICY executions_deny_update ON dealership.executions FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY executions_deny_delete ON dealership.executions FOR DELETE TO anon, authenticated USING (false);

-- ----------------------------------------------------------------
-- 5. dealership.rpc_execute_proposal
-- Kernel-level execute scoped to dealership tables.
-- Mirrors ak_kernel.rpc_execute_proposal but uses:
--   dealership.proposals  (not ak_kernel.requests)
--   dealership.approvals  (not ak_kernel.decisions)
--   dealership.executions (not ak_kernel.executions)
--   public.elimination_registry (ak_governance.elimination_registry does not exist)
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION dealership.rpc_execute_proposal(
  p_proposal_id uuid,
  p_approval_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'dealership', 'ak_kernel', 'public', 'extensions'
AS $$
DECLARE
  v_receipt_id uuid;
  v_now        timestamptz := now();
  v_approval   dealership.approvals%ROWTYPE;
  v_proposal   dealership.proposals%ROWTYPE;
  v_halted     boolean;
BEGIN
  -- 1. Halt check
  SELECT halted INTO v_halted FROM ak_kernel.v_halt_truth;
  IF v_halted THEN
    RAISE EXCEPTION 'SYSTEM_HALTED';
  END IF;

  -- 2. Load and lock proposal
  SELECT * INTO v_proposal
    FROM dealership.proposals
   WHERE id = p_proposal_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROPOSAL_NOT_FOUND';
  END IF;

  IF v_proposal.status = 'EXECUTED' THEN
    RAISE EXCEPTION 'PROPOSAL_ALREADY_EXECUTED';
  END IF;

  -- 3. Elimination registry check
  IF EXISTS (
    SELECT 1
      FROM public.elimination_registry er
     WHERE er.domain    = 'dealership'
       AND er.action    = v_proposal.action_type
       AND er.is_active = true
  ) THEN
    RAISE EXCEPTION 'ELIMINATED_ACTION: %', v_proposal.action_type;
  END IF;

  -- 4. Load, validate, and atomically consume approval
  SELECT * INTO v_approval
    FROM dealership.approvals
   WHERE id          = p_approval_id
     AND proposal_id = p_proposal_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'APPROVAL_NOT_FOUND';
  END IF;

  IF v_approval.decision <> 'APPROVE' THEN
    RAISE EXCEPTION 'APPROVAL_NOT_APPROVE';
  END IF;

  IF v_approval.expires_at <= v_now THEN
    RAISE EXCEPTION 'APPROVAL_EXPIRED';
  END IF;

  IF v_approval.consumed_at IS NOT NULL THEN
    RAISE EXCEPTION 'APPROVAL_ALREADY_CONSUMED';
  END IF;

  IF v_approval.proposal_hash <> v_proposal.proposal_hash THEN
    RAISE EXCEPTION 'PROPOSAL_HASH_MISMATCH';
  END IF;

  UPDATE dealership.approvals
     SET consumed_at = v_now
   WHERE id = p_approval_id;

  -- 5. Issue immutable receipt into ak_kernel.receipts
  INSERT INTO ak_kernel.receipts (kind, receipt_hash, payload)
  VALUES (
    'EXECUTION_RECEIPT',
    encode(
      digest(
        v_proposal.proposal_hash || ':' || p_approval_id::text || ':' || v_now::text,
        'sha256'
      ),
      'hex'
    ),
    jsonb_build_object(
      'proposal_id', p_proposal_id,
      'approval_id', p_approval_id,
      'action_type', v_proposal.action_type,
      'executed_at', v_now,
      'payload',     v_proposal.payload
    )
  )
  RETURNING id INTO v_receipt_id;

  -- 6. Record execution
  INSERT INTO dealership.executions (proposal_id, approval_id, receipt_id, status, result)
  VALUES (p_proposal_id, p_approval_id, v_receipt_id, 'SUCCESS', '{}');

  RETURN v_receipt_id;
END;
$$;

-- ----------------------------------------------------------------
-- 6. fn_submit_proposal — fixed
--    was: INSERT INTO ak_kernel.proposals
--    was: ak_governance.elimination_registry (schema does not exist)
--    now: dealership.proposals + public.elimination_registry
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION dealership.fn_submit_proposal(
  p_action_type text,
  p_payload     jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'dealership', 'public', 'extensions'
AS $$
DECLARE
  v_uid           uuid := auth.uid();
  v_proposal_id   uuid;
  v_proposal_hash text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  IF NOT dealership.fn_is_operator(v_uid) THEN
    RAISE EXCEPTION 'OPERATOR_REQUIRED';
  END IF;

  IF p_action_type NOT IN (
    'bill_job', 'send_quote', 'close_job',
    'update_job_state', 'update_parts_state',
    'confirm_washbay', 'close_washbay',
    'close_hr_ticket', 'log_contact',
    'mark_ro_ready', 'mark_invoice_sent'
  ) THEN
    RAISE EXCEPTION 'INVALID_ACTION_TYPE: %', p_action_type;
  END IF;

  -- Elimination check — public.elimination_registry
  IF EXISTS (
    SELECT 1
      FROM public.elimination_registry er
     WHERE er.domain    = 'dealership'
       AND er.action    = p_action_type
       AND er.is_active = true
  ) THEN
    RAISE EXCEPTION 'ELIMINATED_ACTION: %', p_action_type;
  END IF;

  v_proposal_hash := encode(
    digest(
      p_action_type || ':' ||
      (SELECT string_agg(key || '=' || value, ',' ORDER BY key)
         FROM jsonb_each_text(p_payload)),
      'sha256'
    ),
    'hex'
  );

  INSERT INTO dealership.proposals (created_by, action_type, payload, proposal_hash, status)
  VALUES (v_uid, p_action_type, p_payload, v_proposal_hash, 'PENDING')
  RETURNING id INTO v_proposal_id;

  RETURN jsonb_build_object(
    'ok',          true,
    'action',      'submit_proposal',
    'proposal_id', v_proposal_id,
    'action_type', p_action_type,
    'hash',        v_proposal_hash,
    'by',          v_uid,
    'at',          now()
  );
END;
$$;

-- ----------------------------------------------------------------
-- 7. fn_issue_approval — fixed
--    was: ak_kernel.proposals + ak_kernel.approvals
--    now: dealership.proposals + dealership.approvals
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION dealership.fn_issue_approval(
  p_proposal_id  uuid,
  p_expires_hours integer DEFAULT 2
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'dealership', 'public'
AS $$
DECLARE
  v_uid         uuid := auth.uid();
  v_approval_id uuid;
  v_proposal    dealership.proposals%ROWTYPE;
  v_expires_at  timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  IF NOT dealership.fn_is_operator(v_uid) THEN
    RAISE EXCEPTION 'OPERATOR_REQUIRED';
  END IF;

  SELECT * INTO v_proposal
    FROM dealership.proposals
   WHERE id = p_proposal_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROPOSAL_NOT_FOUND';
  END IF;

  IF v_proposal.status = 'EXECUTED' THEN
    RAISE EXCEPTION 'PROPOSAL_ALREADY_EXECUTED';
  END IF;

  IF v_proposal.status = 'CANCELLED' THEN
    RAISE EXCEPTION 'PROPOSAL_CANCELLED';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM dealership.approvals
     WHERE proposal_id = p_proposal_id
       AND consumed_at IS NULL
       AND expires_at  > now()
       AND decision    = 'APPROVE'
  ) THEN
    RAISE EXCEPTION 'ACTIVE_APPROVAL_EXISTS';
  END IF;

  v_expires_at := now() + (p_expires_hours || ' hours')::interval;

  INSERT INTO dealership.approvals (
    created_by, proposal_id, proposal_hash, decision, expires_at
  ) VALUES (
    v_uid, p_proposal_id, v_proposal.proposal_hash, 'APPROVE', v_expires_at
  )
  RETURNING id INTO v_approval_id;

  RETURN jsonb_build_object(
    'ok',          true,
    'action',      'issue_approval',
    'approval_id', v_approval_id,
    'proposal_id', p_proposal_id,
    'expires_at',  v_expires_at,
    'by',          v_uid,
    'at',          now()
  );
END;
$$;

-- ----------------------------------------------------------------
-- 8. fn_execute_proposal — fixed
--    was: ak_kernel.proposals + ak_kernel.rpc_execute_proposal
--    now: dealership.proposals + dealership.rpc_execute_proposal
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION dealership.fn_execute_proposal(
  p_proposal_id uuid,
  p_approval_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'dealership', 'ak_kernel', 'public'
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_receipt_id uuid;
  v_proposal   dealership.proposals%ROWTYPE;
  v_result     jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  IF NOT dealership.fn_is_operator(v_uid) THEN
    RAISE EXCEPTION 'OPERATOR_REQUIRED';
  END IF;

  SELECT * INTO v_proposal
    FROM dealership.proposals
   WHERE id = p_proposal_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROPOSAL_NOT_FOUND';
  END IF;

  -- Kernel-level execute: halt + elimination + hash match +
  -- approval consumption + receipt issuance + execution record
  v_receipt_id := dealership.rpc_execute_proposal(
    p_proposal_id := p_proposal_id,
    p_approval_id := p_approval_id
  );

  UPDATE dealership.proposals
     SET status = 'EXECUTED'
   WHERE id = p_proposal_id;

  v_result := dealership.fn_apply_side_effect(
    p_action_type := v_proposal.action_type,
    p_payload     := v_proposal.payload,
    p_actor_id    := v_uid
  );

  RETURN jsonb_build_object(
    'ok',          true,
    'action',      'execute_proposal',
    'receipt_id',  v_receipt_id,
    'proposal_id', p_proposal_id,
    'action_type', v_proposal.action_type,
    'result',      v_result,
    'by',          v_uid,
    'at',          now()
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'ok',          false,
      'action',      'execute_proposal',
      'error',       SQLERRM,
      'proposal_id', p_proposal_id,
      'by',          v_uid,
      'at',          now()
    );
END;
$$;

COMMIT;
