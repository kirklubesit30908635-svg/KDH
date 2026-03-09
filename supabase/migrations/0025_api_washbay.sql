-- =============================================================
-- 0025_api_washbay.sql
-- Washbay / Service domain API: the first enforceable economic loop.
--
-- Replaces: 0020_api_washbay.sql (archived .bak)
--   That file was positioned at 0020_, which sorted BEFORE
--   0020_obligations_and_receipts.sql, causing core.jobs to be
--   referenced before its dependencies existed. Renumbered to 0025
--   so it runs after:
--     0020_obligations_and_receipts.sql  (core.obligations base)
--     0022_obligation_idempotency.sql    (idempotency_key column)
--     0023_core_jobs.sql                (core.jobs table)
--     0024_extend_obligations_for_jobs.sql (job columns on obligations)
--
-- Loop: job_created → service_configured → job_started →
--       job_completed → invoice_finalized → payment_received →
--       variance_detected (leakage.detected event if delta < 0)
--
-- Every public function:
--   1. validates workspace membership (fails closed)
--   2. validates job state transition (no illegal skips)
--   3. appends event(s) to ledger.events via api.append_event()
--   4. mutates core.jobs projection
--   5. creates/satisfies obligations where required
--   6. emits receipt(s) for high-value steps
--   7. returns stable identifiers + status as jsonb
--
-- No function writes directly to ledger.* tables.
-- All ledger writes go through api.append_event / api.emit_receipt.
--
-- Grants: authenticated only. anon has zero write surface.
-- =============================================================

BEGIN;

-- =============================================================
-- INTERNAL HELPERS (not exposed to authenticated)
-- =============================================================

-- ---------------------------------------------------------------
-- api._require_job_status
-- Asserts job exists and is in the expected status.
-- Returns the job row for callers that need it.
-- Raises on not-found or wrong status.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION api._require_job_status(
  p_job_id       uuid,
  p_workspace_id uuid,
  p_expected     text
) RETURNS core.jobs
LANGUAGE plpgsql AS $$
DECLARE
  v_job core.jobs%ROWTYPE;
BEGIN
  SELECT * INTO v_job
    FROM core.jobs
   WHERE id           = p_job_id
     AND workspace_id = p_workspace_id;

  IF v_job.id IS NULL THEN
    RAISE EXCEPTION 'job not found: %', p_job_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_job.status <> p_expected THEN
    RAISE EXCEPTION 'job % is in status %; expected %',
      p_job_id, v_job.status, p_expected
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  RETURN v_job;
END;
$$;

-- ---------------------------------------------------------------
-- api._open_obligation
-- Creates an obligation record and emits obligation_opened receipt.
-- Uses the extended core.obligations schema (job_id, obligation_type,
-- trigger_event_id columns added in 0024).
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION api._open_obligation(
  p_workspace_id   uuid,
  p_job_id         uuid,
  p_type           text,
  p_description    text,
  p_trigger_event  uuid,
  p_due_hours      int DEFAULT 24
) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
  v_id          uuid;
  v_due_at      timestamptz := now() + (p_due_hours || ' hours')::interval;
  v_receipt_row record;
BEGIN
  INSERT INTO core.obligations (
    workspace_id,
    job_id,
    obligation_type,
    title,           -- Track 1 required column: use obligation_type as title
    why,             -- Track 1 required column: use description as why
    face,
    severity,
    trigger_event_id,
    due_at
  ) VALUES (
    p_workspace_id,
    p_job_id,
    p_type,
    p_type,          -- title = type name (structured label for UI)
    p_description,   -- why = human-readable description
    'washbay',
    CASE
      WHEN p_due_hours <= 4  THEN 'critical'
      WHEN p_due_hours <= 12 THEN 'at_risk'
      WHEN p_due_hours <= 24 THEN 'due_today'
      ELSE 'queue'
    END,
    p_trigger_event,
    v_due_at
  ) RETURNING id INTO v_id;

  -- Emit obligation_opened receipt into ledger
  SELECT * INTO v_receipt_row
    FROM api.emit_receipt(
      p_workspace_id,
      p_trigger_event,
      'obligation:' || p_type,
      'obligation_opened',
      jsonb_build_object(
        'obligation_id',   v_id,
        'obligation_type', p_type,
        'job_id',          p_job_id,
        'due_at',          v_due_at
      )
    );

  RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------
-- api._close_obligation
-- Marks an obligation satisfied and records the proof receipt.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION api._close_obligation(
  p_workspace_id   uuid,
  p_obligation_id  uuid,
  p_receipt_id     uuid    -- may be NULL if no receipt was emitted
) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE core.obligations
     SET status                  = 'satisfied',
         satisfied_by_receipt_id = p_receipt_id,
         sealed_at               = now(),   -- Track 1 compat: keep sealed_at in sync
         updated_at              = now()
   WHERE id           = p_obligation_id
     AND workspace_id = p_workspace_id
     AND status       = 'open';
END;
$$;

-- =============================================================
-- api.create_job
-- Creates a job, appends job.created, emits job_created receipt,
-- opens assign_operator (4hr) and confirm_service (8hr) obligations.
-- =============================================================
CREATE OR REPLACE FUNCTION api.create_job(
  p_workspace_id    uuid,
  p_customer_id     uuid    DEFAULT NULL,
  p_asset_id        uuid    DEFAULT NULL,
  p_service_pkg     text    DEFAULT NULL,
  p_quoted_cents    bigint  DEFAULT 0,
  p_idempotency_key text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_event    record;
  v_receipt  record;
  v_job_id   uuid := gen_random_uuid();
  v_ob1_id   uuid;
  v_ob2_id   uuid;
BEGIN
  PERFORM core.assert_member(p_workspace_id);

  -- 1. Append job.created event
  SELECT * INTO v_event
    FROM api.append_event(
      p_workspace_id,
      'job:' || v_job_id,
      'job.created',
      jsonb_build_object(
        'job_id',        v_job_id,
        'customer_id',   p_customer_id,
        'asset_id',      p_asset_id,
        'service_pkg',   p_service_pkg,
        'quoted_cents',  p_quoted_cents
      ),
      p_idempotency_key
    );

  -- 2. Create projection row
  INSERT INTO core.jobs (
    id, workspace_id, customer_id, asset_id,
    service_package, quoted_cents,
    status, created_event_id
  ) VALUES (
    v_job_id, p_workspace_id, p_customer_id, p_asset_id,
    p_service_pkg, COALESCE(p_quoted_cents, 0),
    'created', v_event.event_id
  );

  -- 3. Emit job_created receipt (required proof)
  SELECT * INTO v_receipt
    FROM api.emit_receipt(
      p_workspace_id,
      v_event.event_id,
      'job:' || v_job_id,
      'job_created',
      jsonb_build_object(
        'job_id',       v_job_id,
        'quoted_cents', p_quoted_cents
      )
    );

  -- 4. Open initial obligations
  v_ob1_id := api._open_obligation(
    p_workspace_id, v_job_id,
    'assign_operator',
    'Assign an operator to this job before work begins.',
    v_event.event_id, 4
  );

  v_ob2_id := api._open_obligation(
    p_workspace_id, v_job_id,
    'confirm_service',
    'Confirm service package selection before job starts.',
    v_event.event_id, 8
  );

  RETURN jsonb_build_object(
    'ok',          true,
    'job_id',      v_job_id,
    'event_id',    v_event.event_id,
    'receipt_id',  v_receipt.receipt_id,
    'obligations', jsonb_build_array(v_ob1_id, v_ob2_id)
  );
END;
$$;

-- =============================================================
-- api.assign_operator
-- Assigns an operator, closes assign_operator obligation.
-- =============================================================
CREATE OR REPLACE FUNCTION api.assign_operator(
  p_workspace_id uuid,
  p_job_id       uuid,
  p_operator_id  uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_event  record;
  v_ob_id  uuid;
BEGIN
  PERFORM core.assert_member(p_workspace_id);
  PERFORM api._require_job_status(p_job_id, p_workspace_id, 'created');

  SELECT * INTO v_event
    FROM api.append_event(
      p_workspace_id, 'job:' || p_job_id, 'operator.assigned',
      jsonb_build_object('job_id', p_job_id, 'operator_id', p_operator_id)
    );

  UPDATE core.jobs
     SET operator_id = p_operator_id, updated_at = now()
   WHERE id = p_job_id AND workspace_id = p_workspace_id;

  -- Satisfy assign_operator obligation (no proof receipt needed — event is proof)
  SELECT id INTO v_ob_id FROM core.obligations
   WHERE job_id         = p_job_id
     AND obligation_type = 'assign_operator'
     AND status          = 'open'
   LIMIT 1;

  IF v_ob_id IS NOT NULL THEN
    PERFORM api._close_obligation(p_workspace_id, v_ob_id, NULL);
  END IF;

  RETURN jsonb_build_object(
    'ok',        true,
    'job_id',    p_job_id,
    'event_id',  v_event.event_id
  );
END;
$$;

-- =============================================================
-- api.add_service
-- Adds a service / addon / retail line item, updates projection totals.
-- Emits service_confirmed receipt and closes confirm_service obligation
-- on first successful add.
-- =============================================================
CREATE OR REPLACE FUNCTION api.add_service(
  p_workspace_id  uuid,
  p_job_id        uuid,
  p_service_name  text,
  p_price_cents   bigint,
  p_service_type  text   DEFAULT 'service'  -- 'service' | 'addon' | 'retail'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_event    record;
  v_receipt  record;
  v_ob_id    uuid;
  v_job      core.jobs%ROWTYPE;
BEGIN
  PERFORM core.assert_member(p_workspace_id);

  SELECT * INTO v_job FROM core.jobs
   WHERE id = p_job_id AND workspace_id = p_workspace_id;
  IF v_job.id IS NULL THEN
    RAISE EXCEPTION 'job not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_job.status IN ('completed', 'closed', 'voided') THEN
    RAISE EXCEPTION 'cannot add service to job in status %', v_job.status
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT * INTO v_event
    FROM api.append_event(
      p_workspace_id,
      'job:' || p_job_id,
      CASE p_service_type
        WHEN 'addon'  THEN 'addon.accepted'
        WHEN 'retail' THEN 'retail.item_added'
        ELSE 'service.added'
      END,
      jsonb_build_object(
        'job_id',       p_job_id,
        'service_name', p_service_name,
        'price_cents',  p_price_cents,
        'service_type', p_service_type
      )
    );

  -- Update projection totals
  UPDATE core.jobs SET
    quoted_cents    = CASE WHEN p_service_type = 'service'
                           THEN quoted_cents + p_price_cents
                           ELSE quoted_cents END,
    addon_cents     = CASE WHEN p_service_type = 'addon'
                           THEN addon_cents + p_price_cents
                           ELSE addon_cents END,
    retail_cents    = CASE WHEN p_service_type = 'retail'
                           THEN retail_cents + p_price_cents
                           ELSE retail_cents END,
    service_package = COALESCE(service_package, p_service_name),
    updated_at      = now()
  WHERE id = p_job_id AND workspace_id = p_workspace_id;

  -- Emit service_confirmed receipt
  SELECT * INTO v_receipt
    FROM api.emit_receipt(
      p_workspace_id, v_event.event_id, 'job:' || p_job_id,
      'service_confirmed',
      jsonb_build_object(
        'job_id',       p_job_id,
        'service_name', p_service_name,
        'price_cents',  p_price_cents,
        'service_type', p_service_type
      )
    );

  -- Close confirm_service obligation if still open
  SELECT id INTO v_ob_id FROM core.obligations
   WHERE job_id         = p_job_id
     AND obligation_type = 'confirm_service'
     AND status          = 'open'
   LIMIT 1;

  IF v_ob_id IS NOT NULL THEN
    PERFORM api._close_obligation(p_workspace_id, v_ob_id, v_receipt.receipt_id);
  END IF;

  RETURN jsonb_build_object(
    'ok',         true,
    'job_id',     p_job_id,
    'event_id',   v_event.event_id,
    'receipt_id', v_receipt.receipt_id
  );
END;
$$;

-- =============================================================
-- api.start_job
-- Transitions job to 'started', emits job_started receipt,
-- opens ensure_completion_receipt obligation (12hr).
-- =============================================================
CREATE OR REPLACE FUNCTION api.start_job(
  p_workspace_id uuid,
  p_job_id       uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_event    record;
  v_receipt  record;
  v_ob_id    uuid;
BEGIN
  PERFORM core.assert_member(p_workspace_id);
  PERFORM api._require_job_status(p_job_id, p_workspace_id, 'created');

  SELECT * INTO v_event
    FROM api.append_event(
      p_workspace_id, 'job:' || p_job_id, 'job.started',
      jsonb_build_object('job_id', p_job_id, 'started_at', now())
    );

  UPDATE core.jobs
     SET status     = 'started',
         started_at = now(),
         updated_at = now()
   WHERE id = p_job_id AND workspace_id = p_workspace_id;

  -- Emit job_started receipt (required proof labor began)
  SELECT * INTO v_receipt
    FROM api.emit_receipt(
      p_workspace_id, v_event.event_id, 'job:' || p_job_id,
      'job_started',
      jsonb_build_object('job_id', p_job_id, 'started_at', now())
    );

  -- Open obligation: completion receipt required before invoice
  v_ob_id := api._open_obligation(
    p_workspace_id, p_job_id,
    'ensure_completion_receipt',
    'Job started — completion receipt required before invoice.',
    v_event.event_id, 12
  );

  RETURN jsonb_build_object(
    'ok',         true,
    'job_id',     p_job_id,
    'event_id',   v_event.event_id,
    'receipt_id', v_receipt.receipt_id,
    'obligation', v_ob_id
  );
END;
$$;

-- =============================================================
-- api.complete_job
-- Transitions job to 'completed', emits job_completed receipt,
-- satisfies ensure_completion_receipt, opens verify_invoice (4hr).
-- =============================================================
CREATE OR REPLACE FUNCTION api.complete_job(
  p_workspace_id uuid,
  p_job_id       uuid,
  p_notes        text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_event    record;
  v_receipt  record;
  v_ob_id    uuid;
BEGIN
  PERFORM core.assert_member(p_workspace_id);
  PERFORM api._require_job_status(p_job_id, p_workspace_id, 'started');

  SELECT * INTO v_event
    FROM api.append_event(
      p_workspace_id, 'job:' || p_job_id, 'job.completed',
      jsonb_build_object(
        'job_id',       p_job_id,
        'completed_at', now(),
        'notes',        p_notes
      )
    );

  UPDATE core.jobs
     SET status       = 'completed',
         completed_at = now(),
         updated_at   = now()
   WHERE id = p_job_id AND workspace_id = p_workspace_id;

  -- Emit job_completed receipt (required proof work was done)
  SELECT * INTO v_receipt
    FROM api.emit_receipt(
      p_workspace_id, v_event.event_id, 'job:' || p_job_id,
      'job_completed',
      jsonb_build_object(
        'job_id',       p_job_id,
        'completed_at', now(),
        'notes',        p_notes
      )
    );

  -- Satisfy ensure_completion_receipt obligation
  SELECT id INTO v_ob_id FROM core.obligations
   WHERE job_id         = p_job_id
     AND obligation_type = 'ensure_completion_receipt'
     AND status          = 'open'
   LIMIT 1;

  IF v_ob_id IS NOT NULL THEN
    PERFORM api._close_obligation(p_workspace_id, v_ob_id, v_receipt.receipt_id);
  END IF;

  -- Open verify_invoice obligation (4hr — tight deadline)
  v_ob_id := api._open_obligation(
    p_workspace_id, p_job_id,
    'verify_invoice',
    'Job completed — invoice must be finalized within 4 hours.',
    v_event.event_id, 4
  );

  RETURN jsonb_build_object(
    'ok',         true,
    'job_id',     p_job_id,
    'event_id',   v_event.event_id,
    'receipt_id', v_receipt.receipt_id,
    'obligation', v_ob_id
  );
END;
$$;

-- =============================================================
-- api.finalize_invoice
-- Locks invoice amount, emits invoice_issued receipt,
-- satisfies verify_invoice, opens verify_payment (24hr).
-- =============================================================
CREATE OR REPLACE FUNCTION api.finalize_invoice(
  p_workspace_id  uuid,
  p_job_id        uuid,
  p_invoice_cents bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_event    record;
  v_receipt  record;
  v_ob_id    uuid;
  v_job      core.jobs%ROWTYPE;
BEGIN
  PERFORM core.assert_member(p_workspace_id);
  SELECT * INTO v_job
    FROM api._require_job_status(p_job_id, p_workspace_id, 'completed');

  SELECT * INTO v_event
    FROM api.append_event(
      p_workspace_id, 'job:' || p_job_id, 'invoice.finalized',
      jsonb_build_object(
        'job_id',        p_job_id,
        'invoice_cents', p_invoice_cents,
        'quoted_cents',  v_job.quoted_cents,
        'addon_cents',   v_job.addon_cents,
        'invoiced_at',   now()
      )
    );

  UPDATE core.jobs
     SET invoice_cents = p_invoice_cents,
         invoiced_at   = now(),
         updated_at    = now()
   WHERE id = p_job_id AND workspace_id = p_workspace_id;

  -- Emit invoice_issued receipt
  SELECT * INTO v_receipt
    FROM api.emit_receipt(
      p_workspace_id, v_event.event_id, 'job:' || p_job_id,
      'invoice_issued',
      jsonb_build_object(
        'job_id',        p_job_id,
        'invoice_cents', p_invoice_cents,
        'invoiced_at',   now()
      )
    );

  -- Satisfy verify_invoice obligation
  SELECT id INTO v_ob_id FROM core.obligations
   WHERE job_id         = p_job_id
     AND obligation_type = 'verify_invoice'
     AND status          = 'open'
   LIMIT 1;

  IF v_ob_id IS NOT NULL THEN
    PERFORM api._close_obligation(p_workspace_id, v_ob_id, v_receipt.receipt_id);
  END IF;

  -- Open verify_payment obligation (24hr)
  v_ob_id := api._open_obligation(
    p_workspace_id, p_job_id,
    'verify_payment',
    'Invoice finalized — payment must be recorded within 24 hours.',
    v_event.event_id, 24
  );

  RETURN jsonb_build_object(
    'ok',          true,
    'job_id',      p_job_id,
    'event_id',    v_event.event_id,
    'receipt_id',  v_receipt.receipt_id,
    'obligation',  v_ob_id
  );
END;
$$;

-- =============================================================
-- api.record_payment
-- Closes the economic loop. Computes variance.
-- Emits leakage.detected event if payment < expected.
-- Marks job 'closed'.
-- =============================================================
CREATE OR REPLACE FUNCTION api.record_payment(
  p_workspace_id  uuid,
  p_job_id        uuid,
  p_payment_cents bigint,
  p_method        text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_event         record;
  v_receipt       record;
  v_signal_event  record;
  v_ob_id         uuid;
  v_job           core.jobs%ROWTYPE;
  v_expected      bigint;
  v_variance      bigint;
  v_leakage       boolean := false;
BEGIN
  PERFORM core.assert_member(p_workspace_id);

  SELECT * INTO v_job FROM core.jobs
   WHERE id = p_job_id AND workspace_id = p_workspace_id;
  IF v_job.id IS NULL THEN
    RAISE EXCEPTION 'job not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_job.status <> 'completed' THEN
    RAISE EXCEPTION 'payment requires status=completed; current status=%', v_job.status
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Expected = invoice amount if locked, else quoted + addon + retail
  v_expected := COALESCE(
    v_job.invoice_cents,
    v_job.quoted_cents + v_job.addon_cents + v_job.retail_cents
  );
  v_variance := p_payment_cents - v_expected;

  SELECT * INTO v_event
    FROM api.append_event(
      p_workspace_id, 'job:' || p_job_id, 'payment.received',
      jsonb_build_object(
        'job_id',         p_job_id,
        'payment_cents',  p_payment_cents,
        'expected_cents', v_expected,
        'variance_cents', v_variance,
        'method',         p_method,
        'paid_at',        now()
      )
    );

  UPDATE core.jobs
     SET payment_cents = p_payment_cents,
         paid_at       = now(),
         status        = 'closed',
         closed_at     = now(),
         updated_at    = now()
   WHERE id = p_job_id AND workspace_id = p_workspace_id;

  -- Emit payment_recorded receipt (required proof)
  SELECT * INTO v_receipt
    FROM api.emit_receipt(
      p_workspace_id, v_event.event_id, 'job:' || p_job_id,
      'payment_recorded',
      jsonb_build_object(
        'job_id',         p_job_id,
        'payment_cents',  p_payment_cents,
        'expected_cents', v_expected,
        'variance_cents', v_variance,
        'paid_at',        now()
      )
    );

  -- Satisfy verify_payment obligation
  SELECT id INTO v_ob_id FROM core.obligations
   WHERE job_id         = p_job_id
     AND obligation_type = 'verify_payment'
     AND status          = 'open'
   LIMIT 1;

  IF v_ob_id IS NOT NULL THEN
    PERFORM api._close_obligation(p_workspace_id, v_ob_id, v_receipt.receipt_id);
  END IF;

  -- Variance detection: emit leakage.detected if payment < expected
  IF v_variance < 0 THEN
    v_leakage := true;
    SELECT * INTO v_signal_event
      FROM api.append_event(
        p_workspace_id,
        'signals:leakage',
        'leakage.detected',
        jsonb_build_object(
          'job_id',         p_job_id,
          'expected_cents', v_expected,
          'actual_cents',   p_payment_cents,
          'variance_cents', v_variance,
          'signal_type',    'payment_below_invoice',
          'detected_at',    now()
        )
      );
  END IF;

  RETURN jsonb_build_object(
    'ok',             true,
    'job_id',         p_job_id,
    'event_id',       v_event.event_id,
    'receipt_id',     v_receipt.receipt_id,
    'expected_cents', v_expected,
    'payment_cents',  p_payment_cents,
    'variance_cents', v_variance,
    'leakage',        v_leakage
  );
END;
$$;

-- =============================================================
-- Grants
-- Public functions: authenticated only
-- Internal helpers: explicitly revoked
-- =============================================================
GRANT EXECUTE ON FUNCTION api.create_job(uuid,uuid,uuid,text,bigint,text)  TO authenticated;
GRANT EXECUTE ON FUNCTION api.assign_operator(uuid,uuid,uuid)              TO authenticated;
GRANT EXECUTE ON FUNCTION api.add_service(uuid,uuid,text,bigint,text)      TO authenticated;
GRANT EXECUTE ON FUNCTION api.start_job(uuid,uuid)                         TO authenticated;
GRANT EXECUTE ON FUNCTION api.complete_job(uuid,uuid,text)                 TO authenticated;
GRANT EXECUTE ON FUNCTION api.finalize_invoice(uuid,uuid,bigint)           TO authenticated;
GRANT EXECUTE ON FUNCTION api.record_payment(uuid,uuid,bigint,text)        TO authenticated;

REVOKE ALL ON FUNCTION api._require_job_status(uuid,uuid,text)             FROM public, authenticated;
REVOKE ALL ON FUNCTION api._open_obligation(uuid,uuid,text,text,uuid,int)  FROM public, authenticated;
REVOKE ALL ON FUNCTION api._close_obligation(uuid,uuid,uuid)               FROM public, authenticated;

COMMIT;
