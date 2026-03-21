-- =============================================================
-- 0033_subscription_obligation_bridge.sql
--
-- Closes the Stripe subscription → obligation enforcement loop.
--
-- 1. VOCABULARY — add `subscription` kernel_class to posture matrix;
--    unique source_ref index on core.objects for idempotent upsert.
--
-- 2. OBLIGATION SURFACE — restore idempotency_key + economic_ref_id
--    on core.obligations (both wiped by the 20260314161901 rebuild).
--
-- 3. OPEN RPC — api.open_subscription_obligation:
--    Atomic, idempotent. Resolves workspace from provider connection,
--    upserts economic ref, upserts kernel object, opens obligation.
--    Called from the Stripe webhook after ingest.
--    GRANT: service_role only.
--
-- 4. COMMAND RPCS — api.command_resolve_obligation +
--    api.command_touch_obligation:
--    Governed mutation surface for operator UI actions.
--    Both return the GovernedMutationResult JSON shape the
--    obligation-store.ts client already expects.
--    GRANT: authenticated + service_role.
--
-- 5. RECEIPT TYPE — subscription_operationalized receipt for
--    explicit obligation closure vocabulary.
-- =============================================================

BEGIN;

-- ---------------------------------------------------------------
-- 1a. Subscription posture in the object class matrix
-- ---------------------------------------------------------------

INSERT INTO core.object_class_postures (kernel_class, economic_posture) VALUES
  ('subscription', 'direct_revenue'),
  ('subscription', 'revenue_recovery')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------
-- 1b. Unique constraint on core.objects so we can do idempotent
--     upsert via ON CONFLICT for the same (workspace, class, ref).
-- ---------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS uq_objects_workspace_class_source_ref
  ON core.objects (workspace_id, kernel_class, source_ref)
  WHERE source_ref IS NOT NULL;

-- ---------------------------------------------------------------
-- 2a. Restore idempotency_key on core.obligations
--     (dropped by the 20260314161901 rebuild migration)
-- ---------------------------------------------------------------

ALTER TABLE core.obligations
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_obligations_idempotency_key
  ON core.obligations (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ---------------------------------------------------------------
-- 2b. Restore economic_ref_id FK on core.obligations
--     (dropped by the 20260314161901 rebuild migration)
-- ---------------------------------------------------------------

ALTER TABLE core.obligations
  ADD COLUMN IF NOT EXISTS economic_ref_id uuid
  REFERENCES core.economic_refs (id);

CREATE INDEX IF NOT EXISTS idx_obligations_economic_ref_id
  ON core.obligations (economic_ref_id);

-- ---------------------------------------------------------------
-- 3. REGISTER RECEIPT TYPE
-- ---------------------------------------------------------------

INSERT INTO registry.receipt_types (name, description)
VALUES (
  'subscription_operationalized',
  'Subscription operationalization confirmed by operator'
)
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------
-- 4. api.open_subscription_obligation
--
-- Idempotent. One Stripe event produces at most one obligation of
-- each type. Safe to re-call on webhook retry.
--
-- Workspace is derived from core.provider_connections — never
-- trusted from caller input. GRANT to service_role only.
-- ---------------------------------------------------------------

CREATE OR REPLACE FUNCTION api.open_subscription_obligation(
  p_provider_account_id text,
  p_stripe_event_id     text,
  p_subscription_id     text,
  p_customer_id         text,
  p_obligation_type     text,
  p_livemode            boolean DEFAULT true,
  p_metadata            jsonb   DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_conn            core.provider_connections%ROWTYPE;
  v_idempotency_key text;
  v_existing_id     uuid;
  v_economic_ref_id uuid;
  v_object_id       uuid;
  v_obligation_id   uuid;
BEGIN
  -- Resolve workspace from provider connection (same as ingest).
  SELECT * INTO v_conn
    FROM core.provider_connections
   WHERE provider            = 'stripe'
     AND provider_account_id = p_provider_account_id
     AND livemode            = p_livemode
     AND is_active           = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'no active stripe connection for account % (livemode=%)',
      p_provider_account_id, p_livemode
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Idempotency: one event + one obligation_type = one obligation.
  v_idempotency_key := p_obligation_type || ':' || p_stripe_event_id;

  SELECT id INTO v_existing_id
    FROM core.obligations
   WHERE workspace_id    = v_conn.workspace_id
     AND idempotency_key = v_idempotency_key;

  IF v_existing_id IS NOT NULL THEN
    RETURN v_existing_id;
  END IF;

  -- Upsert the economic reference anchor for this subscription.
  SELECT api.resolve_economic_ref(
    p_workspace_id    := v_conn.workspace_id,
    p_ref_type        := 'subscription',
    p_ref_key         := p_subscription_id,
    p_external_system := 'stripe',
    p_external_id     := p_subscription_id,
    p_subject_key     := p_customer_id,
    p_customer_key    := p_customer_id,
    p_metadata        := jsonb_build_object(
                           'subscription_id', p_subscription_id,
                           'customer_id',     p_customer_id,
                           'source',          'stripe'
                         )
  ) INTO v_economic_ref_id;

  -- Upsert the kernel object for this subscription.
  -- ON CONFLICT uses the unique index added in section 1b.
  INSERT INTO core.objects (
    workspace_id,
    kernel_class,
    economic_posture,
    acknowledged_by_actor_class,
    acknowledged_by_actor_id,
    source_ref,
    metadata
  ) VALUES (
    v_conn.workspace_id,
    'subscription',
    'direct_revenue',
    'stripe',
    p_customer_id,
    p_subscription_id,
    jsonb_build_object(
      'subscription_id', p_subscription_id,
      'customer_id',     p_customer_id,
      'stripe_event_id', p_stripe_event_id,
      'source',          'stripe'
    )
  )
  ON CONFLICT (workspace_id, kernel_class, source_ref)
    WHERE source_ref IS NOT NULL
    DO NOTHING
  RETURNING id INTO v_object_id;

  -- Object already existed — fetch its id.
  IF v_object_id IS NULL THEN
    SELECT id INTO v_object_id
      FROM core.objects
     WHERE workspace_id = v_conn.workspace_id
       AND kernel_class  = 'subscription'
       AND source_ref    = p_subscription_id;
  END IF;

  IF v_object_id IS NULL THEN
    RAISE EXCEPTION
      'could not resolve kernel object for subscription %', p_subscription_id;
  END IF;

  -- Open the obligation.
  INSERT INTO core.obligations (
    workspace_id,
    object_id,
    obligation_type,
    opened_by_actor_class,
    opened_by_actor_id,
    idempotency_key,
    economic_ref_id,
    metadata
  ) VALUES (
    v_conn.workspace_id,
    v_object_id,
    p_obligation_type,
    'stripe',
    p_customer_id,
    v_idempotency_key,
    v_economic_ref_id,
    jsonb_build_object(
      'subscription_id', p_subscription_id,
      'customer_id',     p_customer_id,
      'stripe_event_id', p_stripe_event_id,
      'source_ref',      p_subscription_id,
      'stripe_type',     (p_metadata ->> 'stripe_type'),
      'face',            COALESCE(p_metadata ->> 'face', 'billing'),
      'surface',         'stripe_webhook',
      'title',           (p_metadata ->> 'title'),
      'why',             (p_metadata ->> 'why'),
      'severity',        (p_metadata ->> 'severity')
    ) || COALESCE(p_metadata, '{}')
  )
  RETURNING id INTO v_obligation_id;

  RETURN v_obligation_id;
END;
$$;

REVOKE ALL ON FUNCTION api.open_subscription_obligation(text,text,text,text,text,boolean,jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION api.open_subscription_obligation(text,text,text,text,text,boolean,jsonb) TO service_role;

-- ---------------------------------------------------------------
-- 5. api.command_resolve_obligation
--
-- Operator-facing close path. Delegates to api.resolve_obligation
-- (which emits the ledger event + obligation_proof receipt per
-- 0032_seal_receipt_invariant). Returns GovernedMutationResult JSON
-- expected by obligation-store.ts.
-- ---------------------------------------------------------------

CREATE OR REPLACE FUNCTION api.command_resolve_obligation(
  p_obligation_id   uuid,
  p_actor_id        text,
  p_terminal_action text  DEFAULT 'closed',
  p_reason_code     text  DEFAULT 'action_completed',
  p_metadata        jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_workspace_id  uuid;
  v_event_id      uuid;
  v_receipt_id    uuid;
  v_event_seq     bigint;
  v_event_hash    text;
  v_receipt_seq   bigint;
  v_receipt_hash  text;
  v_resolved_at   timestamptz;
BEGIN
  SELECT workspace_id INTO v_workspace_id
    FROM core.obligations
   WHERE id = p_obligation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'obligation % not found', p_obligation_id;
  END IF;

  -- Membership check: only workspace members may resolve.
  PERFORM core.assert_member(v_workspace_id);

  -- Resolve (idempotent; emits ledger event + receipt per 0032).
  PERFORM api.resolve_obligation(
    p_obligation_id   := p_obligation_id,
    p_terminal_action := p_terminal_action,
    p_reason_code     := p_reason_code,
    p_actor_class     := 'operator',
    p_actor_id        := p_actor_id,
    p_metadata        := COALESCE(p_metadata, '{}')
  );

  -- Retrieve committed ledger records via the deterministic
  -- idempotency keys written by api.resolve_obligation.
  SELECT id, seq, hash INTO v_event_id, v_event_seq, v_event_hash
    FROM ledger.events
   WHERE idempotency_key = 'obligation.resolved:' || p_obligation_id::text
     AND workspace_id    = v_workspace_id;

  SELECT id, seq, hash INTO v_receipt_id, v_receipt_seq, v_receipt_hash
    FROM ledger.receipts
   WHERE idempotency_key = 'obligation.proof:' || p_obligation_id::text
     AND workspace_id    = v_workspace_id;

  SELECT resolved_at INTO v_resolved_at
    FROM core.obligations WHERE id = p_obligation_id;

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

GRANT EXECUTE ON FUNCTION api.command_resolve_obligation(uuid,text,text,text,jsonb)
  TO authenticated, service_role;

-- ---------------------------------------------------------------
-- 6. api.command_touch_obligation
--
-- Records non-terminal operator activity on an obligation.
-- Appends an audit.accessed ledger event + ack receipt.
-- Returns GovernedMutationResult JSON (same shape as resolve).
-- ---------------------------------------------------------------

CREATE OR REPLACE FUNCTION api.command_touch_obligation(
  p_obligation_id uuid,
  p_actor_id      text,
  p_metadata      jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_workspace_id  uuid;
  v_event_id      uuid;
  v_receipt_id    uuid;
  v_event_seq     bigint;
  v_event_hash    text;
  v_receipt_seq   bigint;
  v_receipt_hash  text;
  v_idempotency   text;
  v_next_due_at   text;
BEGIN
  SELECT workspace_id INTO v_workspace_id
    FROM core.obligations
   WHERE id = p_obligation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'obligation % not found', p_obligation_id;
  END IF;

  -- Membership check.
  PERFORM core.assert_member(v_workspace_id);

  -- Idempotency: deduplicate within the same minute for the same actor.
  v_idempotency := 'touch:' || p_obligation_id::text
                            || ':' || p_actor_id
                            || ':' || date_trunc('minute', now())::text;

  -- Append the touch event via the governed write surface.
  SELECT e.event_id, e.seq, e.hash
    INTO v_event_id, v_event_seq, v_event_hash
    FROM api.append_event(
      v_workspace_id,
      'obligation:' || p_obligation_id::text,
      'audit.accessed',
      jsonb_build_object(
        'obligation_id', p_obligation_id,
        'actor_id',      p_actor_id,
        'action',        'touch'
      ) || COALESCE(p_metadata, '{}'),
      v_idempotency
    ) e;

  -- Surface the committed event on idempotent suppression.
  IF v_event_id IS NULL THEN
    SELECT id, seq, hash INTO v_event_id, v_event_seq, v_event_hash
      FROM ledger.events
     WHERE idempotency_key = v_idempotency
       AND workspace_id    = v_workspace_id;
  END IF;

  -- Emit the acknowledgment receipt.
  IF v_event_id IS NOT NULL THEN
    SELECT r.receipt_id, r.seq, r.hash
      INTO v_receipt_id, v_receipt_seq, v_receipt_hash
      FROM api.emit_receipt(
        v_workspace_id,
        v_event_id,
        'obligation:' || p_obligation_id::text,
        'ack',
        jsonb_build_object('obligation_id', p_obligation_id, 'actor_id', p_actor_id),
        'touch-ack:' || v_idempotency
      ) r;
  END IF;

  -- Carry through next_due_at from metadata if the caller supplies it.
  v_next_due_at := p_metadata ->> 'next_due_at';

  RETURN jsonb_build_object(
    'ok',              true,
    'obligation_id',   p_obligation_id,
    'ledger_event_id', v_event_id,
    'receipt_id',      v_receipt_id,
    'event_seq',       v_event_seq,
    'event_hash',      v_event_hash,
    'receipt_seq',     v_receipt_seq,
    'receipt_hash',    v_receipt_hash,
    'next_due_at',     v_next_due_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION api.command_touch_obligation(uuid,text,jsonb)
  TO authenticated, service_role;

COMMIT;
