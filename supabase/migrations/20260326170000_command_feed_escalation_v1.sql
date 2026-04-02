-- =============================================================
-- 20260326170000_command_feed_escalation_v1.sql
--
-- Purpose:
--   1. create signals.metric_observations (integrity evidence surface)
--   2. extend core.obligations state check and add escalation timestamps
--   3. add api.evaluate_obligation_escalation(p_obligation_id uuid)
--   4. add api.command_feed(p_workspace_id uuid)
--
-- Doctrine:
--   - terminal state is resolved; escalation states are due/overdue/breached
--   - escalation emits ledger events via api.append_event (canonical path)
--   - integrity evidence is persisted per (metric_key, workspace, day window)
--   - command feed is a read+escalate orchestration surface; no receipts here
-- =============================================================

BEGIN;

-- -------------------------------------------------------------------
-- STEP 0: signals.metric_observations
-- Windowed integrity evidence computed from obligation lifecycle
-- transitions. One row per (metric_key, workspace, day window).
-- ON CONFLICT accumulates within the window rather than creating
-- duplicate rows.
-- -------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS signals.metric_observations (
  id                 uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_key         text          NOT NULL,
  workspace_id       uuid          NOT NULL REFERENCES core.workspaces(id),
  window_start       timestamptz   NOT NULL,
  window_end         timestamptz   NOT NULL,
  observed_value     numeric(18,6) NOT NULL,
  normalized_score   numeric(8,4)  NOT NULL CHECK (normalized_score BETWEEN 0 AND 1),
  evidence_payload   jsonb         NOT NULL DEFAULT '{}'::jsonb,
  observation_source text          NOT NULL,
  created_at         timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (metric_key, workspace_id, window_start, window_end)
);

COMMENT ON TABLE signals.metric_observations IS
  'Windowed integrity evidence computed from obligation lifecycle transitions. '
  'One row per (metric_key, workspace_id, window). ON CONFLICT accumulates '
  'observed_value and takes the minimum normalized_score within the window.';

ALTER TABLE signals.metric_observations ENABLE ROW LEVEL SECURITY;

CREATE POLICY metric_observations_select
  ON signals.metric_observations FOR SELECT USING (true);

CREATE POLICY metric_observations_write
  ON signals.metric_observations FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_metric_observations_workspace_metric_window
  ON signals.metric_observations (workspace_id, metric_key, window_start DESC);

-- -------------------------------------------------------------------
-- STEP 1: extend core.obligations state check + escalation timestamps
--
-- The existing check constraint only covers ('open','active','resolved').
-- Escalation introduces 'due', 'overdue', 'breached' as non-terminal
-- pressure states that sit between open and resolved. We drop and
-- recreate the constraint to include them.
-- -------------------------------------------------------------------

ALTER TABLE core.obligations
  DROP CONSTRAINT IF EXISTS obligation_state_check;

ALTER TABLE core.obligations
  ADD CONSTRAINT obligation_state_check
    CHECK (state IN ('open', 'active', 'due', 'overdue', 'breached', 'resolved'));

ALTER TABLE core.obligations
  ADD COLUMN IF NOT EXISTS due_escalated_at   timestamptz,
  ADD COLUMN IF NOT EXISTS overdue_at         timestamptz,
  ADD COLUMN IF NOT EXISTS breached_at        timestamptz,
  ADD COLUMN IF NOT EXISTS last_transition_at timestamptz NOT NULL DEFAULT now();

COMMENT ON COLUMN core.obligations.due_escalated_at IS
  'First timestamp the obligation entered due state.';
COMMENT ON COLUMN core.obligations.overdue_at IS
  'First timestamp the obligation entered overdue state.';
COMMENT ON COLUMN core.obligations.breached_at IS
  'First timestamp the obligation entered breached state.';
COMMENT ON COLUMN core.obligations.last_transition_at IS
  'Most recent state transition timestamp for command-pressure ordering.';

-- due_at already exists on the pre-rebuild obligations table (0020).
-- ADD COLUMN IF NOT EXISTS is safe to run even if the column exists.
ALTER TABLE core.obligations
  ADD COLUMN IF NOT EXISTS due_at timestamptz;

COMMENT ON COLUMN core.obligations.due_at IS
  'Operator deadline for the obligation. Null means no time pressure.';

CREATE INDEX IF NOT EXISTS idx_obligations_workspace_state_due_at
  ON core.obligations (workspace_id, state, due_at);

-- -------------------------------------------------------------------
-- STEP 2: api.evaluate_obligation_escalation
--
-- Computes the correct pressure state from due_at and now().
-- Only writes to the DB when a state boundary has been crossed.
-- Emits a ledger event via api.append_event (canonical path).
-- Persists integrity evidence for overdue/breached crossings.
-- -------------------------------------------------------------------

CREATE OR REPLACE FUNCTION api.evaluate_obligation_escalation(
  p_obligation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_obligation     core.obligations%ROWTYPE;
  v_now            timestamptz   := now();
  v_previous_state text;
  v_next_state     text;
  v_chain_key      text;
  v_event          record;
  v_window_start   timestamptz;
  v_window_end     timestamptz;
  v_seconds_late   numeric(18,6);
  v_latency_score  numeric(8,4);
  v_source_event   text;
BEGIN
  SELECT *
    INTO v_obligation
    FROM core.obligations
   WHERE id = p_obligation_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok',            false,
      'error',         'obligation_not_found',
      'obligation_id', p_obligation_id
    );
  END IF;

  PERFORM core.assert_member(v_obligation.workspace_id);

  -- Terminal obligations need no evaluation.
  IF v_obligation.state = 'resolved' THEN
    RETURN jsonb_build_object(
      'ok',            true,
      'changed',       false,
      'state',         'resolved',
      'obligation_id', p_obligation_id
    );
  END IF;

  -- No due_at means no time-pressure semantics.
  IF v_obligation.due_at IS NULL THEN
    RETURN jsonb_build_object(
      'ok',            true,
      'changed',       false,
      'state',         v_obligation.state,
      'obligation_id', p_obligation_id,
      'hint',          'due_at is null'
    );
  END IF;

  v_previous_state := v_obligation.state;

  -- Thresholds: due at T-6h, overdue at T+0, breached at T+24h.
  IF v_now >= (v_obligation.due_at + interval '24 hours') THEN
    v_next_state := 'breached';
  ELSIF v_now >= v_obligation.due_at THEN
    v_next_state := 'overdue';
  ELSIF v_now >= (v_obligation.due_at - interval '6 hours') THEN
    v_next_state := 'due';
  ELSE
    v_next_state := 'open';
  END IF;

  -- No boundary crossed — nothing to write.
  IF v_next_state = v_previous_state THEN
    RETURN jsonb_build_object(
      'ok',            true,
      'changed',       false,
      'state',         v_previous_state,
      'obligation_id', p_obligation_id
    );
  END IF;

  -- Persist the boundary crossing.
  UPDATE core.obligations
     SET state             = v_next_state,
         due_escalated_at  = CASE
                               WHEN v_next_state = 'due' AND due_escalated_at IS NULL
                               THEN v_now
                               ELSE due_escalated_at
                             END,
         overdue_at        = CASE
                               WHEN v_next_state = 'overdue' AND overdue_at IS NULL
                               THEN v_now
                               ELSE overdue_at
                             END,
         breached_at       = CASE
                               WHEN v_next_state = 'breached' AND breached_at IS NULL
                               THEN v_now
                               ELSE breached_at
                             END,
         last_transition_at = v_now,
         metadata          = COALESCE(metadata, '{}'::jsonb)
                             || jsonb_build_object(
                                  'previous_state', v_previous_state,
                                  'evaluated_at',   v_now
                                )
   WHERE id = p_obligation_id;

  -- Emit one ledger event per boundary crossing via canonical path.
  v_chain_key := 'obligation:' || p_obligation_id::text;

  SELECT *
    INTO v_event
    FROM api.append_event(
      v_obligation.workspace_id,
      v_chain_key,
      'obligation.escalated',
      jsonb_build_object(
        'obligation_id',  v_obligation.id,
        'object_id',      v_obligation.object_id,
        'previous_state', v_previous_state,
        'new_state',      v_next_state,
        'due_at',         v_obligation.due_at,
        'evaluated_at',   v_now,
        'actor',          'system:command-feed'
      ),
      NULL  -- no idempotency key; each crossing is a distinct event
    );

  -- Persist integrity evidence for overdue and breached crossings only.
  IF v_next_state IN ('overdue', 'breached') THEN
    v_window_start := date_trunc('day', v_now);
    v_window_end   := v_window_start + interval '1 day';
    v_source_event := COALESCE(v_obligation.metadata->>'source', 'stripe');
    v_seconds_late := GREATEST(
      EXTRACT(epoch FROM (v_now - v_obligation.due_at))::numeric,
      0
    );

    IF v_next_state = 'overdue' THEN
      -- normalized_score: 1.0 = right at deadline, degrades to 0.0 at T+24h.
      v_latency_score := GREATEST(0, LEAST(1, 1 - (v_seconds_late / 86400.0)));

      INSERT INTO signals.metric_observations (
        metric_key, workspace_id, window_start, window_end,
        observed_value, normalized_score, evidence_payload, observation_source
      ) VALUES (
        'obligation_latency',
        v_obligation.workspace_id,
        v_window_start,
        v_window_end,
        v_seconds_late,
        v_latency_score,
        jsonb_build_object(
          'obligation_id',  v_obligation.id,
          'object_id',      v_obligation.object_id,
          'workspace_id',   v_obligation.workspace_id,
          'source_event',   v_source_event,
          'previous_state', v_previous_state,
          'new_state',      v_next_state,
          'due_at',         v_obligation.due_at,
          'evaluated_at',   v_now,
          'event_id',       v_event.event_id
        ),
        'system:command-feed'
      )
      ON CONFLICT (metric_key, workspace_id, window_start, window_end)
      DO UPDATE SET
        observed_value   = GREATEST(
                             signals.metric_observations.observed_value,
                             EXCLUDED.observed_value
                           ),
        normalized_score = LEAST(
                             signals.metric_observations.normalized_score,
                             EXCLUDED.normalized_score
                           ),
        evidence_payload = signals.metric_observations.evidence_payload
                           || EXCLUDED.evidence_payload,
        created_at       = now();
    END IF;

    IF v_next_state = 'breached' THEN
      -- breach_rate: observed_value accumulates breach count this window;
      -- normalized_score = 0 signals governance failure for the window.
      INSERT INTO signals.metric_observations (
        metric_key, workspace_id, window_start, window_end,
        observed_value, normalized_score, evidence_payload, observation_source
      ) VALUES (
        'breach_rate',
        v_obligation.workspace_id,
        v_window_start,
        v_window_end,
        1,
        0,
        jsonb_build_object(
          'obligation_id',  v_obligation.id,
          'object_id',      v_obligation.object_id,
          'workspace_id',   v_obligation.workspace_id,
          'source_event',   v_source_event,
          'previous_state', v_previous_state,
          'new_state',      v_next_state,
          'due_at',         v_obligation.due_at,
          'evaluated_at',   v_now,
          'event_id',       v_event.event_id
        ),
        'system:command-feed'
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
  END IF;

  RETURN jsonb_build_object(
    'ok',            true,
    'changed',       true,
    'obligation_id', v_obligation.id,
    'previous_state', v_previous_state,
    'new_state',     v_next_state,
    'event_id',      v_event.event_id
  );
END;
$$;

COMMENT ON FUNCTION api.evaluate_obligation_escalation(uuid) IS
  'Evaluates command-pressure state from due_at vs now(). Only writes on '
  'boundary crossings. Emits one escalation event via api.append_event and '
  'persists integrity evidence for overdue/breached transitions.';

-- -------------------------------------------------------------------
-- STEP 3: api.command_feed
--
-- Workspace-scoped command pressure feed. Evaluates escalation on
-- read for all non-terminal obligations, then returns the freshly
-- updated set sorted by severity then urgency.
--
-- The two-pass pattern (evaluate-then-read) ensures the caller always
-- sees current pressure state without needing a background cron job.
-- -------------------------------------------------------------------

CREATE OR REPLACE FUNCTION api.command_feed(
  p_workspace_id uuid
)
RETURNS TABLE (
  obligation_id      uuid,
  title              text,
  required_action    text,
  source_event       text,
  state              text,
  severity_rank      integer,
  due_at             timestamptz,
  seconds_remaining  bigint,
  last_transition_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_row record;
BEGIN
  PERFORM core.assert_member(p_workspace_id);

  -- Pass 1: evaluate escalation for every non-terminal obligation.
  FOR v_row IN
    SELECT id
      FROM core.obligations
     WHERE workspace_id = p_workspace_id
       AND state IN ('open', 'active', 'due', 'overdue', 'breached')
  LOOP
    PERFORM api.evaluate_obligation_escalation(v_row.id);
  END LOOP;

  -- Pass 2: return fresh, post-evaluation pressure projection.
  RETURN QUERY
  SELECT
    o.id AS obligation_id,
    COALESCE(
      o.metadata->>'title',
      initcap(replace(COALESCE(o.obligation_type, 'obligation'), '_', ' '))
    ) AS title,
    COALESCE(
      o.metadata->>'required_action',
      'Resolve obligation'
    ) AS required_action,
    COALESCE(
      o.metadata->>'source',
      'stripe'
    ) AS source_event,
    o.state,
    CASE o.state
      WHEN 'breached' THEN 4
      WHEN 'overdue'  THEN 3
      WHEN 'due'      THEN 2
      WHEN 'open'     THEN 1
      WHEN 'active'   THEN 1
      ELSE 0
    END AS severity_rank,
    o.due_at,
    CASE
      WHEN o.due_at IS NULL THEN NULL
      ELSE EXTRACT(epoch FROM (o.due_at - now()))::bigint
    END AS seconds_remaining,
    o.last_transition_at
  FROM core.obligations o
  WHERE o.workspace_id = p_workspace_id
    AND o.state IN ('open', 'active', 'due', 'overdue', 'breached')
  ORDER BY
    CASE o.state
      WHEN 'breached' THEN 4
      WHEN 'overdue'  THEN 3
      WHEN 'due'      THEN 2
      WHEN 'open'     THEN 1
      WHEN 'active'   THEN 1
      ELSE 0
    END DESC,
    o.due_at NULLS LAST,
    o.opened_at ASC;
END;
$$;

COMMENT ON FUNCTION api.command_feed(uuid) IS
  'Workspace-scoped command pressure feed. Runs escalation evaluation on '
  'read (two-pass), then returns non-terminal obligations sorted by '
  'severity then urgency for UI rendering. Call from authenticated context.';

-- -------------------------------------------------------------------
-- STEP 4: grants
-- -------------------------------------------------------------------

GRANT EXECUTE ON FUNCTION api.evaluate_obligation_escalation(uuid)
  TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION api.command_feed(uuid)
  TO authenticated, service_role;

COMMIT;
