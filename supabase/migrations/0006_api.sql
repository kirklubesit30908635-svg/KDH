-- =============================================================
-- 0006_api.sql
-- api schema: SECURITY DEFINER write surface for the kernel.
-- All kernel writes go through these functions; no client role
-- may write directly to any kernel table.
-- =============================================================

-- ---------------------------------------------------------------
-- api.append_event
-- Sole authorised write path into ledger.events.
--
-- Flow:
--   1. core.assert_member() aborts if the calling operator is
--      not a member of the target workspace.
--   2. event_type name is resolved to its registry id; unknown
--      types are rejected with invalid_parameter_value.
--   3. INSERT fires ledger._events_before_insert() which assigns
--      seq, prev_hash, hash, and advances chain_heads atomically.
--   4. If an idempotency_key is supplied and the event already
--      exists, the trigger suppresses the INSERT (RETURN NULL) and
--      this function surfaces the committed row instead.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION api.append_event(
  p_workspace_id    uuid,
  p_chain_key       text,
  p_event_type      text,
  p_payload         jsonb DEFAULT '{}',
  p_idempotency_key text  DEFAULT NULL
)
RETURNS TABLE (
  event_id uuid,
  seq      bigint,
  hash     text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_type_id  int;
  v_event_id uuid;
  v_seq      bigint;
  v_hash     text;
BEGIN
  PERFORM core.assert_member(p_workspace_id);

  SELECT id INTO v_type_id
    FROM registry.event_types
   WHERE name = p_event_type;
  IF v_type_id IS NULL THEN
    RAISE EXCEPTION 'unknown event_type: %', p_event_type
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- seq, prev_hash, and hash are placeholder values; the
  -- ledger._events_before_insert() trigger overwrites all three
  -- before the row is durably stored.
  INSERT INTO ledger.events (
    workspace_id, chain_key, event_type_id, payload,
    idempotency_key, seq, prev_hash, hash
  ) VALUES (
    p_workspace_id, p_chain_key, v_type_id, p_payload,
    p_idempotency_key, 0, 'GENESIS', 'PENDING'
  )
  RETURNING id, events.seq, events.hash
    INTO v_event_id, v_seq, v_hash;

  -- Trigger returned NULL (idempotent duplicate suppressed).
  -- Surface the already-committed row instead.
  IF v_event_id IS NULL AND p_idempotency_key IS NOT NULL THEN
    SELECT id, events.seq, events.hash
      INTO v_event_id, v_seq, v_hash
      FROM ledger.events AS events
     WHERE idempotency_key = p_idempotency_key
       AND workspace_id    = p_workspace_id;
  END IF;

  RETURN QUERY SELECT v_event_id, v_seq, v_hash;
END;
$$;

-- ---------------------------------------------------------------
-- api.emit_receipt
-- Sole authorised write path into ledger.receipts.
--
-- Flow mirrors api.append_event: membership guard → type
-- resolution → INSERT that fires ledger._receipts_before_insert()
-- to assign seq, prev_hash, hash, and advance receipt_heads.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION api.emit_receipt(
  p_workspace_id  uuid,
  p_event_id      uuid,
  p_chain_key     text,
  p_receipt_type  text,
  p_payload       jsonb DEFAULT '{}'
)
RETURNS TABLE (
  receipt_id uuid,
  seq        bigint,
  hash       text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_type_id    int;
  v_receipt_id uuid;
  v_seq        bigint;
  v_hash       text;
BEGIN
  PERFORM core.assert_member(p_workspace_id);

  SELECT id INTO v_type_id
    FROM registry.receipt_types
   WHERE name = p_receipt_type;
  IF v_type_id IS NULL THEN
    RAISE EXCEPTION 'unknown receipt_type: %', p_receipt_type
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  INSERT INTO ledger.receipts (
    workspace_id, event_id, receipt_type_id, chain_key,
    payload, seq, prev_hash, hash
  ) VALUES (
    p_workspace_id, p_event_id, v_type_id, p_chain_key,
    p_payload, 0, 'GENESIS', 'PENDING'
  )
  RETURNING id, receipts.seq, receipts.hash
    INTO v_receipt_id, v_seq, v_hash;

  RETURN QUERY SELECT v_receipt_id, v_seq, v_hash;
END;
$$;

-- Grant the api schema and its write RPCs to authenticated operators.
-- anon has no write surface whatsoever.
GRANT USAGE ON SCHEMA api TO authenticated;
GRANT EXECUTE ON FUNCTION api.append_event(uuid, text, text, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION api.emit_receipt(uuid, uuid, text, text, jsonb)  TO authenticated;
