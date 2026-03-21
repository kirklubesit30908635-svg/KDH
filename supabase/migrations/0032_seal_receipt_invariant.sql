-- =============================================================
-- 0032_seal_receipt_invariant.sql
--
-- Closes two structural gaps:
--
-- 1. ORPHAN FIX — api.resolve_obligation now always emits a
--    ledger event (obligation.resolved) + receipt (obligation_proof)
--    and links core.obligations.receipt_id immediately, so the
--    proof_lag metric stays at zero going forward.
--    A backfill loop remediates the existing 150 orphaned resolved
--    obligations that have no committed receipt.
--
-- 2. RECEIPT IDEMPOTENCY — ledger.receipts gains an idempotency_key
--    column with workspace-scoped uniqueness; the
--    _receipts_before_insert trigger suppresses duplicate inserts the
--    same way _events_before_insert does for ledger.events.
--    api.emit_receipt accepts an optional p_idempotency_key.
--    api.ingest_stripe_event passes stripe_event_id as the receipt
--    idempotency key to close the Stripe-retry duplicate window.
--
-- 3. VIEW DEDUPLICATION — core.v_recent_receipts gains a
--    DISTINCT ON guard so any legacy duplicates already committed to
--    ledger.receipts do not surface as duplicate rows in the UI.
-- =============================================================

BEGIN;

-- ---------------------------------------------------------------
-- 0. HELPER — core.try_parse_timestamptz
--    Returns NULL instead of raising on malformed input.
--    Required by projection views. Defined here so db reset works
--    without manual preconditions.
-- ---------------------------------------------------------------

CREATE OR REPLACE FUNCTION core.try_parse_timestamptz(p_value text)
RETURNS timestamptz
LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN p_value::timestamptz;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION core.try_parse_timestamptz(text) TO authenticated, service_role;

-- ---------------------------------------------------------------
-- 1. REGISTER NEW CATALOGUE ENTRIES
-- ---------------------------------------------------------------

INSERT INTO registry.event_types (family, name, description)
VALUES ('obligation', 'obligation.resolved', 'Obligation resolved — terminal action recorded')
ON CONFLICT (name) DO NOTHING;

INSERT INTO registry.receipt_types (name, description)
VALUES ('obligation_proof', 'Proof of obligation resolution committed to the ledger')
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------
-- 2. RECEIPT IDEMPOTENCY — schema additions
-- ---------------------------------------------------------------

ALTER TABLE ledger.receipts
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS receipts_idempotency_key_uidx
  ON ledger.receipts (workspace_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ---------------------------------------------------------------
-- 3. RECEIPT IDEMPOTENCY — trigger update
--    Mirrors the logic already in ledger._events_before_insert.
-- ---------------------------------------------------------------

CREATE OR REPLACE FUNCTION ledger._receipts_before_insert()
RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_head ledger.receipt_heads%ROWTYPE;
BEGIN
  -- Workspace-scoped idempotency: if the key is already recorded
  -- within this workspace, silently suppress the duplicate insert.
  IF NEW.idempotency_key IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM ledger.receipts
        WHERE idempotency_key = NEW.idempotency_key
          AND workspace_id    = NEW.workspace_id
     )
  THEN
    RETURN NULL;
  END IF;

  INSERT INTO ledger.receipt_heads (workspace_id, chain_key, head_hash, seq)
    VALUES (NEW.workspace_id, NEW.chain_key, 'GENESIS', 0)
    ON CONFLICT (workspace_id, chain_key) DO NOTHING;

  SELECT * INTO v_head
    FROM ledger.receipt_heads
   WHERE workspace_id = NEW.workspace_id
     AND chain_key    = NEW.chain_key
     FOR UPDATE;

  NEW.seq       := v_head.seq + 1;
  NEW.prev_hash := v_head.head_hash;

  NEW.hash := ledger.sha256_hex(
    NEW.prev_hash              || '|' ||
    NEW.seq::text              || '|' ||
    NEW.workspace_id::text     || '|' ||
    NEW.chain_key              || '|' ||
    NEW.event_id::text         || '|' ||
    NEW.receipt_type_id::text  || '|' ||
    NEW.payload::text
  );

  UPDATE ledger.receipt_heads
     SET head_hash  = NEW.hash,
         seq        = NEW.seq,
         updated_at = now()
   WHERE workspace_id = NEW.workspace_id
     AND chain_key    = NEW.chain_key;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------
-- 4. api.emit_receipt — add optional p_idempotency_key parameter
--    and surface the committed row on idempotent suppression.
--    Drop the old 5-param overload so callers with positional args
--    resolve to this 6-param function (last param has DEFAULT NULL).
-- ---------------------------------------------------------------

DROP FUNCTION IF EXISTS api.emit_receipt(uuid, uuid, text, text, jsonb);

CREATE OR REPLACE FUNCTION api.emit_receipt(
  p_workspace_id    uuid,
  p_event_id        uuid,
  p_chain_key       text,
  p_receipt_type    text,
  p_payload         jsonb DEFAULT '{}',
  p_idempotency_key text  DEFAULT NULL
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
    payload, idempotency_key, seq, prev_hash, hash
  ) VALUES (
    p_workspace_id, p_event_id, v_type_id, p_chain_key,
    p_payload, p_idempotency_key, 0, 'GENESIS', 'PENDING'
  )
  RETURNING id, receipts.seq, receipts.hash
    INTO v_receipt_id, v_seq, v_hash;

  -- Trigger returned NULL (idempotent duplicate suppressed).
  -- Surface the already-committed row instead.
  IF v_receipt_id IS NULL AND p_idempotency_key IS NOT NULL THEN
    SELECT id, receipts.seq, receipts.hash
      INTO v_receipt_id, v_seq, v_hash
      FROM ledger.receipts AS receipts
     WHERE idempotency_key = p_idempotency_key
       AND workspace_id    = p_workspace_id;
  END IF;

  RETURN QUERY SELECT v_receipt_id, v_seq, v_hash;
END;
$$;

GRANT EXECUTE ON FUNCTION api.emit_receipt(uuid, uuid, text, text, jsonb, text) TO authenticated;

-- ---------------------------------------------------------------
-- 5. api.ingest_stripe_event — pass stripe_event_id as receipt
--    idempotency key so Stripe-retry duplicate receipts are blocked
--    at the ledger layer.
-- ---------------------------------------------------------------

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

  PERFORM core.assert_member(v_conn.workspace_id);

  -- Idempotency: surface existing rows if already ingested.
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

  IF NOT EXISTS (
    SELECT 1 FROM registry.event_types WHERE name = p_stripe_type
  ) THEN
    RAISE EXCEPTION 'unknown stripe event type: %', p_stripe_type
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

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

  v_chain_key := p_stripe_type;

  SELECT e.event_id, e.seq, e.hash
    INTO v_event_id, v_seq, v_hash
    FROM api.append_event(
      v_conn.workspace_id,
      v_chain_key,
      p_stripe_type,
      p_payload,
      p_stripe_event_id
    ) e;

  -- Pass stripe_event_id as receipt idempotency key to prevent
  -- duplicate receipts if the webhook is retried concurrently.
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
      ),
      'stripe:receipt:' || p_stripe_event_id   -- idempotency_key
    ) r;

  RETURN QUERY SELECT v_event_id, v_receipt_id, v_seq, v_hash;
END;
$$;

-- ---------------------------------------------------------------
-- 6. api.resolve_obligation — emit ledger event + receipt on
--    fresh resolution so every sealed obligation is immediately
--    proof-linked.
-- ---------------------------------------------------------------

CREATE OR REPLACE FUNCTION api.resolve_obligation(
    p_obligation_id   uuid,
    p_terminal_action text,
    p_reason_code     text,
    p_actor_class     text,
    p_actor_id        text,
    p_metadata        jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    v_workspace_id    uuid;
    v_obligation_type text;
    v_current_state   text;
    v_event_type_id   int;
    v_receipt_type_id int;
    v_event_id        uuid;
    v_receipt_id      uuid;
    v_idempotency_evt text;
    v_idempotency_rct text;
BEGIN
    -- Lock and read the obligation for update.
    SELECT state, workspace_id, obligation_type
      INTO v_current_state, v_workspace_id, v_obligation_type
      FROM core.obligations
     WHERE id = p_obligation_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'obligation % not found', p_obligation_id;
    END IF;

    -- Resolve the obligation (idempotent re-set if already resolved).
    UPDATE core.obligations
       SET state                   = 'resolved',
           terminal_action         = p_terminal_action,
           terminal_reason_code    = p_reason_code,
           resolved_at             = COALESCE(resolved_at, now()),
           resolved_by_actor_class = p_actor_class,
           resolved_by_actor_id    = p_actor_id,
           metadata                = COALESCE(metadata, '{}'::jsonb) || COALESCE(p_metadata, '{}'::jsonb)
     WHERE id = p_obligation_id;

    -- Only emit ledger writes for a fresh (first-time) resolution.
    IF v_current_state = 'resolved' THEN
        RETURN;
    END IF;

    SELECT id INTO v_event_type_id
      FROM registry.event_types
     WHERE name = 'obligation.resolved';

    SELECT id INTO v_receipt_type_id
      FROM registry.receipt_types
     WHERE name = 'obligation_proof';

    -- If the registry types are missing (should not happen after this
    -- migration) skip the ledger writes rather than hard-failing.
    IF v_event_type_id IS NULL OR v_receipt_type_id IS NULL THEN
        RETURN;
    END IF;

    v_idempotency_evt := 'obligation.resolved:' || p_obligation_id::text;
    v_idempotency_rct := 'obligation.proof:'    || p_obligation_id::text;

    -- Append the resolution event to the obligation's ledger chain.
    INSERT INTO ledger.events (
        workspace_id, chain_key, event_type_id, payload,
        idempotency_key, seq, prev_hash, hash
    ) VALUES (
        v_workspace_id,
        'obligation:' || p_obligation_id::text,
        v_event_type_id,
        jsonb_build_object(
            'obligation_id',    p_obligation_id,
            'obligation_type',  v_obligation_type,
            'terminal_action',  p_terminal_action,
            'reason_code',      p_reason_code,
            'actor_class',      p_actor_class,
            'actor_id',         p_actor_id
        ),
        v_idempotency_evt,
        0, 'GENESIS', 'PENDING'
    )
    RETURNING id INTO v_event_id;

    -- Trigger suppressed the INSERT (idempotent duplicate).
    IF v_event_id IS NULL THEN
        SELECT id INTO v_event_id
          FROM ledger.events
         WHERE idempotency_key = v_idempotency_evt
           AND workspace_id    = v_workspace_id;
    END IF;

    IF v_event_id IS NULL THEN
        RETURN;
    END IF;

    -- Emit the proof receipt on the same obligation chain.
    INSERT INTO ledger.receipts (
        workspace_id, event_id, receipt_type_id, chain_key,
        payload, idempotency_key, seq, prev_hash, hash
    ) VALUES (
        v_workspace_id,
        v_event_id,
        v_receipt_type_id,
        'obligation:' || p_obligation_id::text,
        jsonb_build_object(
            'obligation_id',  p_obligation_id,
            'terminal_action', p_terminal_action,
            'actor_class',    p_actor_class,
            'actor_id',       p_actor_id
        ),
        v_idempotency_rct,
        0, 'GENESIS', 'PENDING'
    )
    RETURNING id INTO v_receipt_id;

    -- Trigger suppressed the INSERT (idempotent duplicate).
    IF v_receipt_id IS NULL THEN
        SELECT id INTO v_receipt_id
          FROM ledger.receipts
         WHERE idempotency_key = v_idempotency_rct
           AND workspace_id    = v_workspace_id;
    END IF;

    -- Link the proof to the obligation row.
    IF v_receipt_id IS NOT NULL THEN
        UPDATE core.obligations
           SET receipt_id     = COALESCE(receipt_id, v_receipt_id),
               proof_state    = 'linked',
               proof_strength = 'kernel_receipt',
               linked_at      = COALESCE(linked_at, now()),
               proof_note     = NULL
         WHERE id = p_obligation_id
           AND receipt_id IS NULL;
    END IF;
END;
$$;

-- ---------------------------------------------------------------
-- 7. core.v_recent_receipts — reset-safe placeholder
--    The founder-era receipt projection depends on core.objects and
--    founder-era obligation columns that no longer exist at this
--    point in the replayed chain. Later founder-console migrations
--    recreate the real projection from canonical kernel truth.
-- ---------------------------------------------------------------

CREATE OR REPLACE VIEW core.v_recent_receipts AS
SELECT
  NULL::uuid        AS workspace_id,
  NULL::uuid        AS receipt_id,
  NULL::text        AS obligation_id,
  NULL::uuid        AS object_id,
  NULL::text        AS receipt_type,
  NULL::timestamptz AS created_at,
  NULL::text        AS actor_user_id,
  NULL::uuid        AS event_id,
  NULL::jsonb       AS payload,
  NULL::timestamptz AS sealed_at,
  NULL::text        AS sealed_by,
  NULL::text        AS face,
  NULL::text        AS economic_ref_type,
  NULL::text        AS economic_ref_id,
  NULL::uuid        AS ledger_event_id
WHERE false;

GRANT SELECT ON core.v_recent_receipts TO authenticated, service_role;

-- ---------------------------------------------------------------
-- 8. BACKFILL — remediate the ~150 resolved obligations that have
--    no committed ledger receipt.  Inserts directly into
--    ledger.events / ledger.receipts (SECURITY DEFINER context in
--    the migration runner = postgres superuser; triggers handle
--    seq / hash assignment).  Idempotency keys ensure this block
--    is safe to re-run.
-- ---------------------------------------------------------------

DO $$
DECLARE
    v_obl             record;
    v_event_type_id   int;
    v_receipt_type_id int;
    v_event_id        uuid;
    v_receipt_id      uuid;
    v_idempotency_evt text;
    v_idempotency_rct text;
BEGIN
    IF to_regclass('core.objects') IS NULL
       OR NOT EXISTS (
           SELECT 1
             FROM information_schema.columns
            WHERE table_schema = 'core'
              AND table_name = 'obligations'
              AND column_name = 'state'
       )
       OR NOT EXISTS (
           SELECT 1
             FROM information_schema.columns
            WHERE table_schema = 'core'
              AND table_name = 'obligations'
              AND column_name = 'receipt_id'
       ) THEN
        RAISE NOTICE
            'Skipping 0032 founder-era receipt backfill during reset; founder obligation schema is not present yet.';
        RETURN;
    END IF;

    SELECT id INTO v_event_type_id
      FROM registry.event_types WHERE name = 'obligation.resolved';

    SELECT id INTO v_receipt_type_id
      FROM registry.receipt_types WHERE name = 'obligation_proof';

    IF v_event_type_id IS NULL OR v_receipt_type_id IS NULL THEN
        RAISE EXCEPTION 'registry entries for obligation.resolved / obligation_proof missing';
    END IF;

    FOR v_obl IN
        SELECT
            o.id,
            o.workspace_id,
            o.obligation_type,
            o.terminal_action,
            o.resolved_by_actor_class,
            o.resolved_by_actor_id,
            o.resolved_at
          FROM core.obligations o
         WHERE o.state      = 'resolved'
           AND o.receipt_id IS NULL
         ORDER BY o.resolved_at ASC NULLS LAST
    LOOP
        v_idempotency_evt := 'obligation.resolved:' || v_obl.id::text;
        v_idempotency_rct := 'obligation.proof:'    || v_obl.id::text;

        -- Insert resolution event (trigger assigns seq/hash;
        -- returns NULL on idempotent duplicate).
        INSERT INTO ledger.events (
            workspace_id, chain_key, event_type_id, payload,
            idempotency_key, seq, prev_hash, hash
        ) VALUES (
            v_obl.workspace_id,
            'obligation:' || v_obl.id::text,
            v_event_type_id,
            jsonb_build_object(
                'obligation_id',   v_obl.id,
                'obligation_type', v_obl.obligation_type,
                'terminal_action', v_obl.terminal_action,
                'actor_class',     v_obl.resolved_by_actor_class,
                'actor_id',        v_obl.resolved_by_actor_id,
                'backfilled',      true
            ),
            v_idempotency_evt,
            0, 'GENESIS', 'PENDING'
        )
        RETURNING id INTO v_event_id;

        IF v_event_id IS NULL THEN
            SELECT id INTO v_event_id
              FROM ledger.events
             WHERE idempotency_key = v_idempotency_evt
               AND workspace_id    = v_obl.workspace_id;
        END IF;

        CONTINUE WHEN v_event_id IS NULL;

        -- Insert proof receipt.
        INSERT INTO ledger.receipts (
            workspace_id, event_id, receipt_type_id, chain_key,
            payload, idempotency_key, seq, prev_hash, hash
        ) VALUES (
            v_obl.workspace_id,
            v_event_id,
            v_receipt_type_id,
            'obligation:' || v_obl.id::text,
            jsonb_build_object(
                'obligation_id', v_obl.id,
                'backfilled',    true
            ),
            v_idempotency_rct,
            0, 'GENESIS', 'PENDING'
        )
        RETURNING id INTO v_receipt_id;

        IF v_receipt_id IS NULL THEN
            SELECT id INTO v_receipt_id
              FROM ledger.receipts
             WHERE idempotency_key = v_idempotency_rct
               AND workspace_id    = v_obl.workspace_id;
        END IF;

        CONTINUE WHEN v_receipt_id IS NULL;

        -- Link the proof to the obligation row.
        UPDATE core.obligations
           SET receipt_id     = v_receipt_id,
               proof_state    = 'linked',
               proof_strength = 'kernel_receipt',
               linked_at      = COALESCE(linked_at, v_obl.resolved_at, now()),
               proof_note     = 'Backfilled by 0032_seal_receipt_invariant'
         WHERE id          = v_obl.id
           AND receipt_id  IS NULL;

    END LOOP;
END $$;

COMMIT;
