-- =============================================================
-- 0014_api_stripe_ingest.sql
-- api.ingest_stripe_event: SECURITY DEFINER RPC — the sole
-- authorised write path for Stripe webhook events.
--
-- Flow:
--   1. Resolve provider connection from (provider_account_id, livemode).
--      workspace_id is derived from the connection — never trusted
--      from caller input.
--   2. core.assert_member() enforces workspace membership for the
--      calling operator.
--   3. Idempotency check on (provider_connection_id, stripe_event_id).
--      Duplicate events surface the existing committed rows.
--   4. Validate stripe_type against registry.event_types.
--   5. INSERT into ingest.stripe_events (envelope storage).
--   6. api.append_event() → ledger.events (canonical truth).
--   7. api.emit_receipt()  → ledger.receipts (proof artifact).
--   8. Return event_id, receipt_id, seq, hash.
-- =============================================================

CREATE OR REPLACE FUNCTION api.ingest_stripe_event(
  p_provider_account_id text,
  p_stripe_event_id     text,
  p_stripe_type         text,
  p_livemode            boolean,
  p_api_version         text        DEFAULT NULL,
  p_stripe_created_at   timestamptz DEFAULT now(),
  p_payload             jsonb       DEFAULT '{}'
)
RETURNS TABLE (
  event_id   uuid,
  receipt_id uuid,
  seq        bigint,
  hash       text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_conn       core.provider_connections%ROWTYPE;
  v_event_id   uuid;
  v_receipt_id uuid;
  v_seq        bigint;
  v_hash       text;
  v_chain_key  text;
BEGIN
  -- ---------------------------------------------------------------
  -- 1. Resolve provider connection; derive workspace_id from binding.
  --    Rejects unknown or inactive accounts before any writes occur.
  -- ---------------------------------------------------------------
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

  -- ---------------------------------------------------------------
  -- 2. Membership check against the derived workspace_id.
  -- ---------------------------------------------------------------
  PERFORM core.assert_member(v_conn.workspace_id);

  -- ---------------------------------------------------------------
  -- 3. Idempotency: if already ingested, surface existing rows.
  -- ---------------------------------------------------------------
  IF EXISTS (
    SELECT 1
      FROM ingest.stripe_events
     WHERE provider_connection_id = v_conn.id
       AND stripe_event_id        = p_stripe_event_id
  ) THEN
    SELECT e.id, e.seq, e.hash
      INTO v_event_id, v_seq, v_hash
      FROM ledger.events e
     WHERE e.workspace_id    = v_conn.workspace_id
       AND e.idempotency_key = p_stripe_event_id;

    SELECT r.id INTO v_receipt_id
      FROM ledger.receipts r
     WHERE r.workspace_id = v_conn.workspace_id
       AND r.event_id     = v_event_id
     ORDER BY r.seq DESC
     LIMIT 1;

    RETURN QUERY SELECT v_event_id, v_receipt_id, v_seq, v_hash;
    RETURN;
  END IF;

  -- ---------------------------------------------------------------
  -- 4. Validate stripe_type against the registry before any writes.
  --    api.append_event() would also reject unknown types, but
  --    validating here prevents a dangling ingest.stripe_events row.
  -- ---------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM registry.event_types WHERE name = p_stripe_type
  ) THEN
    RAISE EXCEPTION 'unknown stripe event type: %', p_stripe_type
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- ---------------------------------------------------------------
  -- 5. Store the raw Stripe envelope.
  --    workspace_id is set from the resolved connection — not input.
  -- ---------------------------------------------------------------
  INSERT INTO ingest.stripe_events (
    provider_connection_id,
    workspace_id,
    stripe_event_id,
    stripe_type,
    livemode,
    api_version,
    stripe_created_at,
    payload
  ) VALUES (
    v_conn.id,
    v_conn.workspace_id,
    p_stripe_event_id,
    p_stripe_type,
    p_livemode,
    p_api_version,
    p_stripe_created_at,
    p_payload
  );

  -- ---------------------------------------------------------------
  -- 6. Append to the ledger (canonical truth).
  --    chain_key is scoped to the stripe event type.
  --    idempotency_key = stripe_event_id for cross-layer dedup.
  -- ---------------------------------------------------------------
  v_chain_key := p_stripe_type;

  SELECT e.event_id, e.seq, e.hash
    INTO v_event_id, v_seq, v_hash
    FROM api.append_event(
      v_conn.workspace_id,
      v_chain_key,
      p_stripe_type,
      p_payload,
      p_stripe_event_id       -- idempotency_key
    ) e;

  -- ---------------------------------------------------------------
  -- 7. Emit receipt (proof artifact).
  -- ---------------------------------------------------------------
  SELECT r.receipt_id
    INTO v_receipt_id
    FROM api.emit_receipt(
      v_conn.workspace_id,
      v_event_id,
      v_chain_key,
      'ack',
      jsonb_build_object(
        'stripe_event_id',     p_stripe_event_id,
        'provider_account_id', p_provider_account_id,
        'stripe_type',         p_stripe_type,
        'livemode',            p_livemode
      )
    ) r;

  RETURN QUERY SELECT v_event_id, v_receipt_id, v_seq, v_hash;
END;
$$;

GRANT EXECUTE ON FUNCTION api.ingest_stripe_event(
  text, text, text, boolean, text, timestamptz, jsonb
) TO authenticated;
