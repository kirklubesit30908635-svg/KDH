-- =============================================================
-- 0035_attempted_action_telemetry.sql
--
-- Purpose: capture attempted-action truth around the command
-- resolve surface without reopening or altering resolution
-- semantics.
--
-- Adds:
--   1. signals.attempted_actions — append-only telemetry table.
--      Captures every call to api.command_resolve_obligation with
--      structured outcome classification before any ambiguity hides
--      what was tried vs what happened.
--
--   2. Outcome classification — four exclusive categories:
--        success       — resolve completed, event + receipt linked
--        duplicate     — obligation already resolved; idempotent
--        rejected      — governance, precondition, or access check
--                        blocked the attempt
--        infra_failure — ledger emission or config failure; intent
--                        was valid but infrastructure did not deliver
--
--   3. api.command_resolve_obligation — rebuilt to wrap the core
--      resolver with attempted-action instrumentation. Same external
--      signature and return shape as 0033. No new mutation authority.
--      Callers see no change; signals see every path.
--
--   4. signals.metric_observations rows for command_rejection_rate
--      and command_infra_failure_rate so signals detectors have
--      windowed evidence without bespoke wiring.
--
-- Discipline:
--   - Does NOT touch api.resolve_obligation (the restored kernel
--     resolver from 20260404130000).
--   - Does NOT touch ledger schema, governance trigger, or any
--     core mutation surface.
--   - observability must never become an alternate mutation path.
-- =============================================================

BEGIN;

-- ---------------------------------------------------------------
-- 1. signals.attempted_actions
--    Append-only telemetry. One row per command surface call.
--    workspace_id is nullable because the obligation may not exist
--    when the call arrives (not_found rejection path).
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS signals.attempted_actions (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     uuid        REFERENCES core.workspaces(id),
  obligation_id    uuid,
  command_surface  text        NOT NULL,
  actor_id         text        NOT NULL,
  actor_class      text        NOT NULL DEFAULT 'operator',
  operator_intent  jsonb       NOT NULL DEFAULT '{}',
  outcome          text        NOT NULL
                   CHECK (outcome IN ('success', 'duplicate', 'rejected', 'infra_failure')),
  rejection_class  text
                   CHECK (rejection_class IN (
                     'governance', 'not_found', 'access_denied',
                     'precondition', 'config', 'unknown'
                   )),
  error_code       text,
  error_message    text,
  ledger_event_id  uuid,
  receipt_id       uuid,
  mutation_result  jsonb,
  attempted_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE signals.attempted_actions IS
  'Append-only telemetry. One row per api.command_resolve_obligation call. '
  'Records operator intent and outcome classification regardless of whether '
  'the resolution succeeded, was rejected, or hit infrastructure failure.';

ALTER TABLE signals.attempted_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY attempted_actions_select
  ON signals.attempted_actions FOR SELECT USING (true);

CREATE POLICY attempted_actions_insert
  ON signals.attempted_actions FOR INSERT WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_attempted_actions_workspace_outcome_at
  ON signals.attempted_actions (workspace_id, outcome, attempted_at DESC);

CREATE INDEX IF NOT EXISTS idx_attempted_actions_obligation
  ON signals.attempted_actions (obligation_id, attempted_at DESC);

-- ---------------------------------------------------------------
-- 2. api.command_resolve_obligation — instrumented wrapper
--
--    External contract (signature + return shape) is identical to
--    the 0033 version. Internally:
--      - records operator intent before the attempt
--      - catches and classifies all exception paths
--      - writes one attempted_actions row per call
--      - writes windowed metric_observations for rejection and
--        infra_failure outcomes so signals detectors have evidence
--      - re-raises exceptions so callers see failures unchanged
-- ---------------------------------------------------------------

CREATE OR REPLACE FUNCTION api.command_resolve_obligation(
  p_obligation_id   uuid,
  p_actor_id        text,
  p_terminal_action text  DEFAULT 'closed',
  p_reason_code     text  DEFAULT 'action_completed',
  p_metadata        jsonb DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_workspace_id    uuid;
  v_current_state   text;
  v_resolved_at     timestamptz;
  v_idempotency_evt text;
  v_idempotency_rct text;
  v_event_id        uuid;
  v_receipt_id      uuid;
  v_event_seq       bigint;
  v_event_hash      text;
  v_receipt_seq     bigint;
  v_receipt_hash    text;
  v_result          jsonb;
  -- telemetry
  v_outcome         text;
  v_rejection_class text;
  v_error_code      text;
  v_error_message   text;
  v_attempt_id      uuid;
  v_window_start    timestamptz;
  v_window_end      timestamptz;
BEGIN
  -- -----------------------------------------------------------
  -- PHASE 1: workspace + existence guard (same as 0033)
  -- -----------------------------------------------------------
  SELECT workspace_id, state
    INTO v_workspace_id, v_current_state
    FROM core.obligations
   WHERE id = p_obligation_id;

  IF NOT FOUND THEN
    -- Rejected: obligation does not exist.
    INSERT INTO signals.attempted_actions (
      workspace_id, obligation_id, command_surface,
      actor_id, actor_class, operator_intent,
      outcome, rejection_class, error_code, error_message
    ) VALUES (
      NULL, p_obligation_id, 'command_resolve_obligation',
      p_actor_id, 'operator',
      jsonb_build_object(
        'terminal_action', p_terminal_action,
        'reason_code',     p_reason_code,
        'metadata',        p_metadata
      ),
      'rejected', 'not_found', 'P0002',
      'obligation ' || p_obligation_id::text || ' not found'
    );
    RAISE EXCEPTION 'obligation % not found', p_obligation_id;
  END IF;

  -- Access guard — raises exception if not a member.
  BEGIN
    PERFORM core.assert_member(v_workspace_id);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO signals.attempted_actions (
      workspace_id, obligation_id, command_surface,
      actor_id, actor_class, operator_intent,
      outcome, rejection_class, error_code, error_message
    ) VALUES (
      v_workspace_id, p_obligation_id, 'command_resolve_obligation',
      p_actor_id, 'operator',
      jsonb_build_object(
        'terminal_action', p_terminal_action,
        'reason_code',     p_reason_code,
        'metadata',        p_metadata
      ),
      'rejected', 'access_denied', SQLSTATE, SQLERRM
    );
    RAISE;
  END;

  -- -----------------------------------------------------------
  -- PHASE 2: duplicate detection — already resolved
  -- -----------------------------------------------------------
  IF v_current_state = 'resolved' THEN
    -- Read back existing proof by idempotency keys.
    v_idempotency_evt := 'obligation.resolved:' || p_obligation_id::text;
    v_idempotency_rct := 'obligation.proof:'    || p_obligation_id::text;

    SELECT resolved_at INTO v_resolved_at
      FROM core.obligations WHERE id = p_obligation_id;

    SELECT e.id, e.seq, e.hash
      INTO v_event_id, v_event_seq, v_event_hash
      FROM ledger.events e
     WHERE e.idempotency_key = v_idempotency_evt
       AND e.workspace_id    = v_workspace_id;

    SELECT r.id, r.seq, r.hash
      INTO v_receipt_id, v_receipt_seq, v_receipt_hash
      FROM ledger.receipts r
     WHERE r.idempotency_key = v_idempotency_rct
       AND r.workspace_id    = v_workspace_id;

    v_result := jsonb_build_object(
      'ok',              true,
      'duplicate',       true,
      'obligation_id',   p_obligation_id,
      'ledger_event_id', v_event_id,
      'receipt_id',      v_receipt_id,
      'event_seq',       v_event_seq,
      'event_hash',      v_event_hash,
      'receipt_seq',     v_receipt_seq,
      'receipt_hash',    v_receipt_hash,
      'resolved_at',     v_resolved_at,
      'terminal_action', p_terminal_action,
      'reason_code',     p_reason_code
    );

    INSERT INTO signals.attempted_actions (
      workspace_id, obligation_id, command_surface,
      actor_id, actor_class, operator_intent,
      outcome, rejection_class,
      ledger_event_id, receipt_id, mutation_result
    ) VALUES (
      v_workspace_id, p_obligation_id, 'command_resolve_obligation',
      p_actor_id, 'operator',
      jsonb_build_object(
        'terminal_action', p_terminal_action,
        'reason_code',     p_reason_code,
        'metadata',        p_metadata
      ),
      'duplicate', NULL,
      v_event_id, v_receipt_id, v_result
    );

    RETURN v_result;
  END IF;

  -- -----------------------------------------------------------
  -- PHASE 3: attempt resolution — catch and classify all paths
  -- -----------------------------------------------------------
  BEGIN
    -- Delegate to the restored kernel resolver (20260404130000).
    -- This emits event + receipt + links proof before the obligation
    -- UPDATE, satisfying the governance trigger.
    PERFORM api.resolve_obligation(
      p_obligation_id   := p_obligation_id,
      p_terminal_action := p_terminal_action,
      p_reason_code     := p_reason_code,
      p_actor_class     := 'operator',
      p_actor_id        := p_actor_id,
      p_metadata        := p_metadata
    );

    -- Read back committed records by deterministic idempotency keys.
    v_idempotency_evt := 'obligation.resolved:' || p_obligation_id::text;
    v_idempotency_rct := 'obligation.proof:'    || p_obligation_id::text;

    SELECT resolved_at INTO v_resolved_at
      FROM core.obligations WHERE id = p_obligation_id;

    SELECT e.id, e.seq, e.hash
      INTO v_event_id, v_event_seq, v_event_hash
      FROM ledger.events e
     WHERE e.idempotency_key = v_idempotency_evt
       AND e.workspace_id    = v_workspace_id;

    SELECT r.id, r.seq, r.hash
      INTO v_receipt_id, v_receipt_seq, v_receipt_hash
      FROM ledger.receipts r
     WHERE r.idempotency_key = v_idempotency_rct
       AND r.workspace_id    = v_workspace_id;

    v_result := jsonb_build_object(
      'ok',              true,
      'obligation_id',   p_obligation_id,
      'ledger_event_id', v_event_id,
      'receipt_id',      v_receipt_id,
      'event_seq',       v_event_seq,
      'event_hash',      v_event_hash,
      'receipt_seq',     v_receipt_seq,
      'receipt_hash',    v_receipt_hash,
      'resolved_at',     v_resolved_at,
      'terminal_action', p_terminal_action,
      'reason_code',     p_reason_code
    );

    -- Record success.
    INSERT INTO signals.attempted_actions (
      workspace_id, obligation_id, command_surface,
      actor_id, actor_class, operator_intent,
      outcome, rejection_class,
      ledger_event_id, receipt_id, mutation_result
    ) VALUES (
      v_workspace_id, p_obligation_id, 'command_resolve_obligation',
      p_actor_id, 'operator',
      jsonb_build_object(
        'terminal_action', p_terminal_action,
        'reason_code',     p_reason_code,
        'metadata',        p_metadata
      ),
      'success', NULL,
      v_event_id, v_receipt_id, v_result
    );

    RETURN v_result;

  EXCEPTION WHEN OTHERS THEN
    v_error_code    := SQLSTATE;
    v_error_message := SQLERRM;

    -- -------------------------------------------------------
    -- Classify outcome from the exception.
    --
    -- Governance rejection (enforce_resolved_obligation_receipt
    -- or any user-raised precondition failure):
    --   SQLSTATE P0001 + message keywords
    --
    -- Infrastructure / config failures:
    --   Registry missing, ledger write failure, etc.
    -- -------------------------------------------------------
    IF v_error_code = 'P0001' THEN
      IF v_error_message LIKE '%must have receipt_id%'
         OR v_error_message LIKE '%governance%'
         OR v_error_message LIKE '%precondition%' THEN
        v_outcome        := 'rejected';
        v_rejection_class := 'governance';

      ELSIF v_error_message LIKE '%not found%' THEN
        v_outcome        := 'rejected';
        v_rejection_class := 'not_found';

      ELSIF v_error_message LIKE '%invalid kernel_class%'
            OR v_error_message LIKE '%invalid_parameter%'
            OR v_error_message LIKE '%unknown%' THEN
        v_outcome        := 'infra_failure';
        v_rejection_class := 'config';

      ELSIF v_error_message LIKE '%Failed to emit%'
            OR v_error_message LIKE '%registry entries%'
            OR v_error_message LIKE '%missing%' THEN
        v_outcome        := 'infra_failure';
        v_rejection_class := 'config';

      ELSE
        -- Generic user-raise: treat as rejected with unknown class.
        v_outcome        := 'rejected';
        v_rejection_class := 'unknown';
      END IF;

    ELSIF v_error_code = '22023' THEN
      -- invalid_parameter_value — typically registry or config gap.
      v_outcome        := 'infra_failure';
      v_rejection_class := 'config';

    ELSIF v_error_code IN ('42501', '28000', '28P01') THEN
      -- insufficient_privilege / access failure.
      v_outcome        := 'rejected';
      v_rejection_class := 'access_denied';

    ELSE
      v_outcome        := 'infra_failure';
      v_rejection_class := 'unknown';
    END IF;

    -- Record the attempt.
    INSERT INTO signals.attempted_actions (
      workspace_id, obligation_id, command_surface,
      actor_id, actor_class, operator_intent,
      outcome, rejection_class, error_code, error_message
    ) VALUES (
      v_workspace_id, p_obligation_id, 'command_resolve_obligation',
      p_actor_id, 'operator',
      jsonb_build_object(
        'terminal_action', p_terminal_action,
        'reason_code',     p_reason_code,
        'metadata',        p_metadata
      ),
      v_outcome, v_rejection_class, v_error_code, v_error_message
    );

    -- Feed signals metric observations for non-success outcomes.
    -- This gives signals detectors windowed evidence without bespoke
    -- wiring. Success path does not write here — the ledger receipt
    -- is the canonical success proof.
    IF v_outcome IN ('rejected', 'infra_failure') THEN
      v_window_start := date_trunc('hour', now());
      v_window_end   := v_window_start + interval '1 hour';

      INSERT INTO signals.metric_observations (
        metric_key, workspace_id, window_start, window_end,
        observed_value, normalized_score, evidence_payload,
        observation_source
      ) VALUES (
        CASE v_outcome
          WHEN 'rejected'      THEN 'command_rejection_rate'
          WHEN 'infra_failure' THEN 'command_infra_failure_rate'
        END,
        v_workspace_id,
        v_window_start,
        v_window_end,
        1,
        0,
        jsonb_build_object(
          'obligation_id',    p_obligation_id,
          'actor_id',         p_actor_id,
          'outcome',          v_outcome,
          'rejection_class',  v_rejection_class,
          'error_code',       v_error_code,
          'error_message',    v_error_message,
          'terminal_action',  p_terminal_action,
          'reason_code',      p_reason_code
        ),
        'api:command_resolve_obligation'
      )
      ON CONFLICT (metric_key, workspace_id, window_start, window_end)
      DO UPDATE SET
        observed_value   = signals.metric_observations.observed_value + 1,
        normalized_score = LEAST(
                             signals.metric_observations.normalized_score,
                             EXCLUDED.normalized_score
                           ),
        evidence_payload = signals.metric_observations.evidence_payload
                           || EXCLUDED.evidence_payload,
        created_at       = now();
    END IF;

    -- Re-raise so callers see the failure unchanged.
    RAISE;
  END;
END;
$$;

REVOKE ALL ON FUNCTION api.command_resolve_obligation(uuid, text, text, text, jsonb)
  FROM PUBLIC;

GRANT EXECUTE ON FUNCTION api.command_resolve_obligation(uuid, text, text, text, jsonb)
  TO authenticated, service_role;

-- ---------------------------------------------------------------
-- 3. Read surface for attempted-action truth
--    api.v_attempted_actions_summary — workspace-scoped view
--    returning outcome counts per obligation and hour window.
--    Read-only. No mutation authority.
-- ---------------------------------------------------------------

CREATE OR REPLACE VIEW api.v_attempted_actions_summary AS
SELECT
  workspace_id,
  obligation_id,
  command_surface,
  outcome,
  rejection_class,
  date_trunc('hour', attempted_at) AS hour_window,
  count(*)                          AS attempt_count,
  min(attempted_at)                 AS first_attempt_at,
  max(attempted_at)                 AS last_attempt_at
FROM signals.attempted_actions
GROUP BY
  workspace_id, obligation_id, command_surface,
  outcome, rejection_class,
  date_trunc('hour', attempted_at);

GRANT SELECT ON api.v_attempted_actions_summary TO authenticated, service_role;

-- ---------------------------------------------------------------
-- 4. Registry: event type for attempted-action signals
-- ---------------------------------------------------------------

INSERT INTO registry.event_types (family, name, description)
VALUES (
  'obligation',
  'obligation.resolution_attempted',
  'Attempt to resolve an obligation — outcome classified at command surface'
)
ON CONFLICT (name) DO NOTHING;

COMMIT;
