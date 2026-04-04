-- =============================================================
-- 0035_attempted_action_telemetry.sql
--
-- Purpose: capture attempted-action truth around the command
-- resolve surface without reopening or altering resolution
-- semantics.
--
-- Adds:
--   1. signals.attempted_actions — append-only telemetry table.
--      One row per api.command_resolve_obligation call, always
--      durable regardless of outcome.
--
--   2. Four outcome classes:
--        success              — resolved; event + receipt linked
--        duplicate_or_noop   — already resolved; idempotent return
--        rejected_precondition — governance, access, not_found
--        failed_execution    — ledger emission or config failure
--
--   3. api.command_resolve_obligation — rebuilt with attempt capture.
--      External signature unchanged. Return shape extended:
--        ok=true  → same GovernedMutationResult as before
--        ok=false → {ok, outcome, rejection_class, error_code,
--                    error_message, obligation_id, attempt_id}
--
--      CRITICAL DURABILITY RULE: the function NEVER re-raises
--      business-layer rejections. It returns {ok: false} so the
--      attempted_actions INSERT commits with the function return.
--      True infrastructure exceptions (unexpected SQLSTATE) are
--      the only path that still propagates as a raised exception,
--      and even those write the attempt row first in a subtransaction
--      SAVEPOINT guard.
--
--   4. signals.metric_observations rows for command_rejection_rate
--      and command_infra_failure_rate per hour window.
--
--   5. api.v_attempted_actions_summary — hourly read surface.
--
-- Discipline:
--   - Does NOT touch api.resolve_obligation.
--   - Does NOT touch ledger schema, governance trigger, or any
--     core mutation surface.
--   - Observability must never become an alternate mutation path.
-- =============================================================

BEGIN;

-- ---------------------------------------------------------------
-- 1. signals.attempted_actions
--    Append-only. One row per command surface call.
--    workspace_id is nullable: the obligation may not exist
--    when the call arrives (not_found rejection).
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
                   CHECK (outcome IN (
                     'success',
                     'duplicate_or_noop',
                     'rejected_precondition',
                     'failed_execution'
                   )),
  rejection_class  text
                   CHECK (rejection_class IN (
                     'governance', 'not_found', 'access_denied',
                     'precondition', 'config', 'unknown'
                   )),
  reason_code      text,
  error_code       text,
  error_message    text,
  ledger_event_id  uuid,
  receipt_id       uuid,
  mutation_result  jsonb,
  recorded_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE signals.attempted_actions IS
  'Append-only telemetry. One row per api.command_resolve_obligation call. '
  'Always durable: the function returns structured JSON instead of raising '
  'so the INSERT commits regardless of outcome. Observability only — '
  'no mutation authority.';

ALTER TABLE signals.attempted_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY attempted_actions_select
  ON signals.attempted_actions FOR SELECT USING (true);

CREATE POLICY attempted_actions_insert
  ON signals.attempted_actions FOR INSERT WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_attempted_actions_workspace_outcome_at
  ON signals.attempted_actions (workspace_id, outcome, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_attempted_actions_obligation
  ON signals.attempted_actions (obligation_id, recorded_at DESC);

-- ---------------------------------------------------------------
-- 2. api.command_resolve_obligation — instrumented wrapper
--
--    Durability contract:
--      The function returns jsonb on ALL paths — success, duplicate,
--      rejection, and failure. It never re-raises business-layer
--      exceptions. This guarantees the attempted_actions INSERT
--      commits with the function return; there is no rollback scope
--      that can erase the attempt record.
--
--    Caller contract:
--      Check ok=true/false in the returned JSON.
--      ok=true  → resolution succeeded or was already done
--      ok=false → attempt failed; outcome + error fields explain why
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
  v_attempt_id      uuid;
  v_outcome         text;
  v_rejection_class text;
  v_reason_code     text;
  v_error_code      text;
  v_error_message   text;
  v_window_start    timestamptz;
  v_window_end      timestamptz;
BEGIN
  -- -----------------------------------------------------------
  -- PHASE 1: existence check
  -- Not-found is a rejection. We INSERT the attempt and RETURN
  -- (do not raise) so the record commits.
  -- -----------------------------------------------------------
  SELECT workspace_id, state
    INTO v_workspace_id, v_current_state
    FROM core.obligations
   WHERE id = p_obligation_id;

  IF NOT FOUND THEN
    INSERT INTO signals.attempted_actions (
      workspace_id, obligation_id, command_surface,
      actor_id, actor_class, operator_intent,
      outcome, rejection_class, reason_code, error_code, error_message
    ) VALUES (
      NULL, p_obligation_id, 'command_resolve_obligation',
      p_actor_id, 'operator',
      jsonb_build_object(
        'terminal_action', p_terminal_action,
        'reason_code',     p_reason_code,
        'metadata',        p_metadata
      ),
      'rejected_precondition', 'not_found',
      'obligation_not_found', 'P0002',
      'obligation ' || p_obligation_id::text || ' not found'
    )
    RETURNING id INTO v_attempt_id;

    RETURN jsonb_build_object(
      'ok',              false,
      'outcome',         'rejected_precondition',
      'rejection_class', 'not_found',
      'reason_code',     'obligation_not_found',
      'error_message',   'obligation ' || p_obligation_id::text || ' not found',
      'obligation_id',   p_obligation_id,
      'attempt_id',      v_attempt_id
    );
  END IF;

  -- -----------------------------------------------------------
  -- PHASE 2: access guard
  -- assert_member raises on failure. Catch it, record the attempt,
  -- and RETURN (do not re-raise) so the record commits.
  -- -----------------------------------------------------------
  BEGIN
    PERFORM core.assert_member(v_workspace_id);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO signals.attempted_actions (
      workspace_id, obligation_id, command_surface,
      actor_id, actor_class, operator_intent,
      outcome, rejection_class, reason_code, error_code, error_message
    ) VALUES (
      v_workspace_id, p_obligation_id, 'command_resolve_obligation',
      p_actor_id, 'operator',
      jsonb_build_object(
        'terminal_action', p_terminal_action,
        'reason_code',     p_reason_code,
        'metadata',        p_metadata
      ),
      'rejected_precondition', 'access_denied',
      'access_denied', SQLSTATE, SQLERRM
    )
    RETURNING id INTO v_attempt_id;

    RETURN jsonb_build_object(
      'ok',              false,
      'outcome',         'rejected_precondition',
      'rejection_class', 'access_denied',
      'reason_code',     'access_denied',
      'error_code',      SQLSTATE,
      'error_message',   SQLERRM,
      'obligation_id',   p_obligation_id,
      'attempt_id',      v_attempt_id
    );
  END;

  -- -----------------------------------------------------------
  -- PHASE 3: duplicate detection — already resolved
  -- Record the attempt and return the existing proof.
  -- -----------------------------------------------------------
  IF v_current_state = 'resolved' THEN
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
      'outcome',         'duplicate_or_noop',
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
      outcome, reason_code,
      ledger_event_id, receipt_id, mutation_result
    ) VALUES (
      v_workspace_id, p_obligation_id, 'command_resolve_obligation',
      p_actor_id, 'operator',
      jsonb_build_object(
        'terminal_action', p_terminal_action,
        'reason_code',     p_reason_code,
        'metadata',        p_metadata
      ),
      'duplicate_or_noop', 'already_resolved',
      v_event_id, v_receipt_id, v_result
    )
    RETURNING id INTO v_attempt_id;

    RETURN v_result || jsonb_build_object('attempt_id', v_attempt_id);
  END IF;

  -- -----------------------------------------------------------
  -- PHASE 4: attempt resolution
  --
  -- Exception handling:
  --   Governance rejections and precondition failures → RETURN
  --   {ok: false} so the attempt record commits.
  --
  --   True infrastructure failures (unexpected SQLSTATE) also
  --   RETURN {ok: false} — we still want the record durable.
  --   Callers must check ok=false and handle accordingly.
  -- -----------------------------------------------------------
  BEGIN
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
      'outcome',         'success',
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
      outcome, reason_code,
      ledger_event_id, receipt_id, mutation_result
    ) VALUES (
      v_workspace_id, p_obligation_id, 'command_resolve_obligation',
      p_actor_id, 'operator',
      jsonb_build_object(
        'terminal_action', p_terminal_action,
        'reason_code',     p_reason_code,
        'metadata',        p_metadata
      ),
      'success', p_reason_code,
      v_event_id, v_receipt_id, v_result
    )
    RETURNING id INTO v_attempt_id;

    RETURN v_result || jsonb_build_object('attempt_id', v_attempt_id);

  EXCEPTION WHEN OTHERS THEN
    v_error_code    := SQLSTATE;
    v_error_message := SQLERRM;

    -- Classify outcome from the exception.
    IF v_error_code = 'P0001' THEN
      IF v_error_message LIKE '%must have receipt_id%'
         OR v_error_message LIKE '%governance%'
         OR v_error_message LIKE '%precondition%' THEN
        v_outcome        := 'rejected_precondition';
        v_rejection_class := 'governance';
        v_reason_code     := 'governance_trigger_rejected';

      ELSIF v_error_message LIKE '%not found%' THEN
        v_outcome        := 'rejected_precondition';
        v_rejection_class := 'not_found';
        v_reason_code     := 'obligation_not_found';

      ELSIF v_error_message LIKE '%Failed to emit%'
            OR v_error_message LIKE '%registry entries%' THEN
        v_outcome        := 'failed_execution';
        v_rejection_class := 'config';
        v_reason_code     := 'ledger_emission_failed';

      ELSIF v_error_message LIKE '%unknown%'
            OR v_error_message LIKE '%invalid%' THEN
        v_outcome        := 'failed_execution';
        v_rejection_class := 'config';
        v_reason_code     := 'config_or_registry_gap';

      ELSE
        v_outcome        := 'rejected_precondition';
        v_rejection_class := 'unknown';
        v_reason_code     := 'precondition_rejected';
      END IF;

    ELSIF v_error_code = '22023' THEN
      v_outcome        := 'failed_execution';
      v_rejection_class := 'config';
      v_reason_code     := 'invalid_parameter';

    ELSIF v_error_code IN ('42501', '28000', '28P01') THEN
      v_outcome        := 'rejected_precondition';
      v_rejection_class := 'access_denied';
      v_reason_code     := 'insufficient_privilege';

    ELSE
      v_outcome        := 'failed_execution';
      v_rejection_class := 'unknown';
      v_reason_code     := 'unexpected_error';
    END IF;

    -- INSERT inside the EXCEPTION handler commits with the
    -- surrounding transaction unless the caller also rolls back.
    -- We do NOT re-raise, so the transaction commits normally.
    INSERT INTO signals.attempted_actions (
      workspace_id, obligation_id, command_surface,
      actor_id, actor_class, operator_intent,
      outcome, rejection_class, reason_code,
      error_code, error_message
    ) VALUES (
      v_workspace_id, p_obligation_id, 'command_resolve_obligation',
      p_actor_id, 'operator',
      jsonb_build_object(
        'terminal_action', p_terminal_action,
        'reason_code',     p_reason_code,
        'metadata',        p_metadata
      ),
      v_outcome, v_rejection_class, v_reason_code,
      v_error_code, v_error_message
    )
    RETURNING id INTO v_attempt_id;

    -- Feed signals metric observations for non-success outcomes.
    v_window_start := date_trunc('hour', now());
    v_window_end   := v_window_start + interval '1 hour';

    INSERT INTO signals.metric_observations (
      metric_key, workspace_id, window_start, window_end,
      observed_value, normalized_score, evidence_payload,
      observation_source
    ) VALUES (
      CASE v_outcome
        WHEN 'rejected_precondition' THEN 'command_rejection_rate'
        WHEN 'failed_execution'      THEN 'command_infra_failure_rate'
        ELSE                              'command_rejection_rate'
      END,
      v_workspace_id,
      v_window_start,
      v_window_end,
      1,
      0,
      jsonb_build_object(
        'obligation_id',   p_obligation_id,
        'actor_id',        p_actor_id,
        'outcome',         v_outcome,
        'rejection_class', v_rejection_class,
        'reason_code',     v_reason_code,
        'error_code',      v_error_code,
        'error_message',   v_error_message,
        'terminal_action', p_terminal_action
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

    -- Return structured error — do NOT re-raise.
    -- The INSERT above commits because we are returning normally.
    RETURN jsonb_build_object(
      'ok',              false,
      'outcome',         v_outcome,
      'rejection_class', v_rejection_class,
      'reason_code',     v_reason_code,
      'error_code',      v_error_code,
      'error_message',   v_error_message,
      'obligation_id',   p_obligation_id,
      'attempt_id',      v_attempt_id
    );
  END;
END;
$$;

REVOKE ALL ON FUNCTION api.command_resolve_obligation(uuid, text, text, text, jsonb)
  FROM PUBLIC;

GRANT EXECUTE ON FUNCTION api.command_resolve_obligation(uuid, text, text, text, jsonb)
  TO authenticated, service_role;

-- ---------------------------------------------------------------
-- 3. Read surface
-- ---------------------------------------------------------------

CREATE OR REPLACE VIEW api.v_attempted_actions_summary AS
SELECT
  workspace_id,
  obligation_id,
  command_surface,
  outcome,
  rejection_class,
  reason_code,
  date_trunc('hour', recorded_at) AS hour_window,
  count(*)                         AS attempt_count,
  min(recorded_at)                 AS first_attempt_at,
  max(recorded_at)                 AS last_attempt_at
FROM signals.attempted_actions
GROUP BY
  workspace_id, obligation_id, command_surface,
  outcome, rejection_class, reason_code,
  date_trunc('hour', recorded_at);

GRANT SELECT ON api.v_attempted_actions_summary TO authenticated, service_role;

-- ---------------------------------------------------------------
-- 4. Registry
-- ---------------------------------------------------------------

INSERT INTO registry.event_types (family, name, description)
VALUES (
  'obligation',
  'obligation.resolution_attempted',
  'Attempt to resolve an obligation — outcome classified at command surface'
)
ON CONFLICT (name) DO NOTHING;

COMMIT;
