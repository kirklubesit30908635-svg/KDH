-- =============================================================
-- 0033_subscription_obligation_flow.sql
--
-- Wires Stripe customer.subscription.created through the full
-- governed mutation path:
--
-- 1. Vocabulary: subscription/direct_revenue seeded into
--    core.object_class_postures.
--
-- 2. Schema additions:
--    - core.objects gets a unique index on
--      (workspace_id, kernel_class, source_ref) to support
--      ON CONFLICT upsert for subscription anchors.
--    - core.obligations gets an idempotency_key column + unique
--      index for Stripe-retry safety.
--
-- 3. api.open_subscription_obligation — sole governed entry point
--    for Stripe → obligation creation:
--      · Derives workspace from core.provider_connections
--      · Upserts core.economic_refs for the subscription anchor
--      · Upserts core.objects (subscription/direct_revenue)
--      · Opens core.obligations with idempotency_key =
--        'operationalize_subscription:<stripe_event_id>'
--      · Returns existing UUID immediately on idempotent duplicate
--
-- 4. api.command_resolve_obligation — RPC that delegates to
--    api.resolve_obligation (0032) then reads back the committed
--    records by their deterministic idempotency keys and returns
--    the full GovernedMutationResult JSON.
--
-- 5. api.command_touch_obligation — appends audit.accessed event
--    + ack receipt on the obligation chain, returns same shape.
-- =============================================================

BEGIN;

-- ---------------------------------------------------------------
-- 1. VOCABULARY: subscription kernel_class + direct_revenue posture
-- ---------------------------------------------------------------

INSERT INTO core.object_class_postures (kernel_class, economic_posture)
VALUES ('subscription', 'direct_revenue')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------
-- 2a. core.objects — unique index for subscription upsert
--     Allows ON CONFLICT (workspace_id, kernel_class, source_ref)
-- ---------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS objects_workspace_class_source_ref_uidx
  ON core.objects (workspace_id, kernel_class, source_ref)
  WHERE source_ref IS NOT NULL;

-- ---------------------------------------------------------------
-- 2b. core.obligations — idempotency_key for Stripe-retry safety
-- ---------------------------------------------------------------

ALTER TABLE core.obligations
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS obligations_idempotency_key_uidx
  ON core.obligations (workspace_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ---------------------------------------------------------------
-- 3. api.open_subscription_obligation
--    Sole governed entry point for Stripe → obligation creation.
--    Derives workspace from core.provider_connections (same trust
--    model as api.ingest_stripe_event).
--    Idempotency key: 'operationalize_subscription:<stripe_event_id>'
-- ---------------------------------------------------------------

CREATE OR REPLACE FUNCTION api.open_subscription_obligation(
  p_provider_account_id    text,
  p_stripe_event_id        text,
  p_stripe_subscription_id text,
  p_stripe_customer_id     text,
  p_livemode               boolean DEFAULT false,
  p_metadata               jsonb   DEFAULT '{}'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_conn            core.provider_connections%ROWTYPE;
  v_idempotency_key text;
  v_economic_ref_id uuid;
  v_object_id       uuid;
  v_obligation_id   uuid;
BEGIN
  -- Derive workspace from the active provider connection.
  SELECT * INTO v_conn
    FROM core.provider_connections
   WHERE provider            = 'stripe'
     AND provider_account_id = p_provider_account_id
     AND livemode            = p_livemode
     AND is_active           = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'no active stripe provider connection for account % (livemode=%)',
      p_provider_account_id, p_livemode
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  v_idempotency_key := 'operationalize_subscription:' || p_stripe_event_id;

  -- Idempotent: return existing obligation UUID immediately.
  SELECT id INTO v_obligation_id
    FROM core.obligations
   WHERE workspace_id    = v_conn.workspace_id
     AND idempotency_key = v_idempotency_key;

  IF FOUND THEN
    RETURN v_obligation_id;
  END IF;

  -- Upsert economic anchor for the subscription.
  v_economic_ref_id := api.resolve_economic_ref(
    p_workspace_id    := v_conn.workspace_id,
    p_ref_type        := 'subscription',
    p_ref_key         := p_stripe_subscription_id,
    p_external_system := 'stripe',
    p_external_id     := p_stripe_subscription_id,
    p_customer_key    := p_stripe_customer_id,
    p_metadata        := jsonb_build_object(
      'stripe_event_id',     p_stripe_event_id,
      'stripe_customer_id',  p_stripe_customer_id,
      'provider_account_id', p_provider_account_id
    ) || p_metadata
  );

  -- Upsert object anchor (subscription / direct_revenue).
  INSERT INTO core.objects (
    workspace_id, kernel_class, economic_posture,
    acknowledged_by_actor_class, acknowledged_by_actor_id,
    source_ref, metadata
  ) VALUES (
    v_conn.workspace_id, 'subscription', 'direct_revenue',
    'system', 'stripe:' || p_provider_account_id,
    p_stripe_subscription_id,
    jsonb_build_object(
      'stripe_subscription_id', p_stripe_subscription_id,
      'stripe_customer_id',     p_stripe_customer_id,
      'provider_account_id',    p_provider_account_id,
      'stripe_event_id',        p_stripe_event_id
    ) || p_metadata
  )
  ON CONFLICT (workspace_id, kernel_class, source_ref)
  DO UPDATE SET
    metadata = core.objects.metadata || excluded.metadata
  RETURNING id INTO v_object_id;

  -- ON CONFLICT DO UPDATE always returns the row; belt-and-suspenders.
  IF v_object_id IS NULL THEN
    SELECT id INTO v_object_id
      FROM core.objects
     WHERE workspace_id = v_conn.workspace_id
       AND kernel_class = 'subscription'
       AND source_ref   = p_stripe_subscription_id;
  END IF;

  -- Open the obligation.
  INSERT INTO core.obligations (
    workspace_id, object_id, obligation_type,
    opened_by_actor_class, opened_by_actor_id,
    idempotency_key, economic_ref_id, metadata
  ) VALUES (
    v_conn.workspace_id, v_object_id, 'operationalize_subscription',
    'system', 'stripe:' || p_provider_account_id,
    v_idempotency_key, v_economic_ref_id,
    jsonb_build_object(
      'stripe_event_id',        p_stripe_event_id,
      'stripe_subscription_id', p_stripe_subscription_id,
      'stripe_customer_id',     p_stripe_customer_id,
      'provider_account_id',    p_provider_account_id,
      'face',                   'billing',
      'severity',               'due_today',
      'surface',                'stripe_webhook'
    ) || p_metadata
  )
  ON CONFLICT (workspace_id, idempotency_key)
  DO NOTHING
  RETURNING id INTO v_obligation_id;

  -- Idempotent suppression: surface the existing row.
  IF v_obligation_id IS NULL THEN
    SELECT id INTO v_obligation_id
      FROM core.obligations
     WHERE workspace_id    = v_conn.workspace_id
       AND idempotency_key = v_idempotency_key;
  END IF;

  RETURN v_obligation_id;
END;
$$;

REVOKE ALL ON FUNCTION api.open_subscription_obligation(
  text, text, text, text, boolean, jsonb
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION api.open_subscription_obligation(
  text, text, text, text, boolean, jsonb
) TO service_role;

-- ---------------------------------------------------------------
-- 4. api.command_resolve_obligation
--    Delegates to api.resolve_obligation (0032) which emits
--    obligation.resolved event + obligation_proof receipt.
--    Reads back committed records by deterministic idempotency
--    keys and returns GovernedMutationResult as JSON.
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
  v_resolved_at     timestamptz;
  v_idempotency_evt text;
  v_idempotency_rct text;
  v_event_id        uuid;
  v_receipt_id      uuid;
  v_event_seq       bigint;
  v_event_hash      text;
  v_receipt_seq     bigint;
  v_receipt_hash    text;
BEGIN
  -- Verify the caller is a workspace member before mutating.
  SELECT workspace_id INTO v_workspace_id
    FROM core.obligations
   WHERE id = p_obligation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'obligation % not found', p_obligation_id;
  END IF;

  PERFORM core.assert_member(v_workspace_id);

  -- Delegate to the 0032 resolution function (emits ledger writes).
  PERFORM api.resolve_obligation(
    p_obligation_id   := p_obligation_id,
    p_terminal_action := p_terminal_action,
    p_reason_code     := p_reason_code,
    p_actor_class     := 'operator',
    p_actor_id        := p_actor_id,
    p_metadata        := p_metadata
  );

  -- Deterministic keys assigned by api.resolve_obligation (0032).
  v_idempotency_evt := 'obligation.resolved:' || p_obligation_id::text;
  v_idempotency_rct := 'obligation.proof:'    || p_obligation_id::text;

  SELECT resolved_at INTO v_resolved_at
    FROM core.obligations
   WHERE id = p_obligation_id;

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

  RETURN jsonb_build_object(
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
END;
$$;

REVOKE ALL ON FUNCTION api.command_resolve_obligation(
  uuid, text, text, text, jsonb
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION api.command_resolve_obligation(
  uuid, text, text, text, jsonb
) TO authenticated, service_role;

-- ---------------------------------------------------------------
-- 5. api.command_touch_obligation
--    Appends audit.accessed event + ack receipt on the obligation
--    chain (non-idempotent; each touch is independently recorded).
--    Returns GovernedMutationResult as JSON.
-- ---------------------------------------------------------------

CREATE OR REPLACE FUNCTION api.command_touch_obligation(
  p_obligation_id uuid,
  p_actor_id      text,
  p_metadata      jsonb DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_workspace_id    uuid;
  v_event_type_id   int;
  v_receipt_type_id int;
  v_chain_key       text;
  v_event_id        uuid;
  v_receipt_id      uuid;
  v_event_seq       bigint;
  v_event_hash      text;
  v_receipt_seq     bigint;
  v_receipt_hash    text;
BEGIN
  SELECT workspace_id INTO v_workspace_id
    FROM core.obligations
   WHERE id = p_obligation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'obligation % not found', p_obligation_id;
  END IF;

  PERFORM core.assert_member(v_workspace_id);

  SELECT id INTO v_event_type_id
    FROM registry.event_types
   WHERE name = 'audit.accessed';

  SELECT id INTO v_receipt_type_id
    FROM registry.receipt_types
   WHERE name = 'ack';

  IF v_event_type_id IS NULL OR v_receipt_type_id IS NULL THEN
    RAISE EXCEPTION 'registry entries for audit.accessed / ack missing';
  END IF;

  v_chain_key := 'obligation:' || p_obligation_id::text;

  -- Append access event (no idempotency key — each touch is distinct).
  INSERT INTO ledger.events (
    workspace_id, chain_key, event_type_id, payload,
    seq, prev_hash, hash
  ) VALUES (
    v_workspace_id, v_chain_key, v_event_type_id,
    jsonb_build_object(
      'obligation_id', p_obligation_id,
      'actor_id',      p_actor_id,
      'action',        'accessed'
    ) || p_metadata,
    0, 'GENESIS', 'PENDING'
  )
  RETURNING id, seq, hash INTO v_event_id, v_event_seq, v_event_hash;

  -- Emit ack receipt on the same chain.
  INSERT INTO ledger.receipts (
    workspace_id, event_id, receipt_type_id, chain_key,
    payload, seq, prev_hash, hash
  ) VALUES (
    v_workspace_id, v_event_id, v_receipt_type_id, v_chain_key,
    jsonb_build_object(
      'obligation_id', p_obligation_id,
      'actor_id',      p_actor_id,
      'action',        'accessed'
    ),
    0, 'GENESIS', 'PENDING'
  )
  RETURNING id, seq, hash INTO v_receipt_id, v_receipt_seq, v_receipt_hash;

  RETURN jsonb_build_object(
    'ok',              true,
    'obligation_id',   p_obligation_id,
    'ledger_event_id', v_event_id,
    'receipt_id',      v_receipt_id,
    'event_seq',       v_event_seq,
    'event_hash',      v_event_hash,
    'receipt_seq',     v_receipt_seq,
    'receipt_hash',    v_receipt_hash
  );
END;
$$;

REVOKE ALL ON FUNCTION api.command_touch_obligation(uuid, text, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION api.command_touch_obligation(uuid, text, jsonb)
  TO authenticated, service_role;

COMMIT;
