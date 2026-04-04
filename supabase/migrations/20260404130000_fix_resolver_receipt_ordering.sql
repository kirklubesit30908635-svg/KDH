-- =============================================================
-- 20260404130000_fix_resolver_receipt_ordering.sql
--
-- Root cause: governance.enforce_resolved_obligation_receipt() is a
-- BEFORE trigger on core.obligations that rejects any UPDATE that
-- sets state = 'resolved' while receipt_id IS NULL.
--
-- The 0032 / 20260404120000 resolver did:
--   1. UPDATE obligations SET state = 'resolved'  ← trigger fires, rejects
--   2. emit event
--   3. emit receipt
--   4. UPDATE obligations SET receipt_id = ...
--
-- Fix: emit event → emit receipt FIRST, then a single UPDATE that
-- sets state = 'resolved' AND receipt_id together. The trigger sees
-- receipt_id already populated and passes.
-- =============================================================

BEGIN;

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
    -- Lock and read the obligation.
    SELECT state, workspace_id, obligation_type
      INTO v_current_state, v_workspace_id, v_obligation_type
      FROM core.obligations
     WHERE id = p_obligation_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'obligation % not found', p_obligation_id;
    END IF;

    -- Idempotent: already resolved, nothing to do.
    IF v_current_state = 'resolved' THEN
        RETURN;
    END IF;

    SELECT id INTO v_event_type_id
      FROM registry.event_types
     WHERE name = 'obligation.resolved';

    SELECT id INTO v_receipt_type_id
      FROM registry.receipt_types
     WHERE name = 'obligation_proof';

    -- If the registry types are missing skip rather than hard-fail.
    IF v_event_type_id IS NULL OR v_receipt_type_id IS NULL THEN
        -- Fall back to plain resolution without ledger writes.
        UPDATE core.obligations
           SET state                   = 'resolved',
               terminal_action         = p_terminal_action,
               terminal_reason_code    = p_reason_code,
               resolved_at             = now(),
               resolved_by_actor_class = p_actor_class,
               resolved_by_actor_id    = p_actor_id,
               metadata                = COALESCE(metadata, '{}'::jsonb)
                                         || COALESCE(p_metadata, '{}'::jsonb)
         WHERE id = p_obligation_id;
        RETURN;
    END IF;

    v_idempotency_evt := 'obligation.resolved:' || p_obligation_id::text;
    v_idempotency_rct := 'obligation.proof:'    || p_obligation_id::text;

    -- -------------------------------------------------------
    -- STEP 1: Append the resolution event BEFORE updating the
    --         obligation row.  The governance trigger fires on
    --         the obligation UPDATE; emitting the event first
    --         means the receipt will exist when that UPDATE runs.
    -- -------------------------------------------------------
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
        RAISE EXCEPTION
            'Failed to emit resolution event for obligation %', p_obligation_id;
    END IF;

    -- -------------------------------------------------------
    -- STEP 2: Emit the proof receipt BEFORE updating the
    --         obligation row.
    -- -------------------------------------------------------
    INSERT INTO ledger.receipts (
        workspace_id, event_id, receipt_type_id, chain_key,
        payload, idempotency_key, seq, prev_hash, hash
    ) VALUES (
        v_workspace_id,
        v_event_id,
        v_receipt_type_id,
        'obligation:' || p_obligation_id::text,
        jsonb_build_object(
            'obligation_id',   p_obligation_id,
            'terminal_action', p_terminal_action,
            'actor_class',     p_actor_class,
            'actor_id',        p_actor_id
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

    IF v_receipt_id IS NULL THEN
        RAISE EXCEPTION
            'Failed to emit proof receipt for obligation %', p_obligation_id;
    END IF;

    -- -------------------------------------------------------
    -- STEP 3: Single UPDATE — sets state = 'resolved' AND
    --         receipt_id together so the governance trigger
    --         (enforce_resolved_obligation_receipt) sees both
    --         fields populated at the same time and passes.
    -- -------------------------------------------------------
    UPDATE core.obligations
       SET state                   = 'resolved',
           terminal_action         = p_terminal_action,
           terminal_reason_code    = p_reason_code,
           resolved_at             = COALESCE(resolved_at, now()),
           resolved_by_actor_class = p_actor_class,
           resolved_by_actor_id    = p_actor_id,
           metadata                = COALESCE(metadata, '{}'::jsonb)
                                     || COALESCE(p_metadata, '{}'::jsonb),
           receipt_id              = COALESCE(receipt_id, v_receipt_id),
           proof_state             = 'linked',
           proof_strength          = 'kernel_receipt',
           linked_at               = COALESCE(linked_at, now()),
           proof_note              = NULL
     WHERE id = p_obligation_id;
END;
$$;

GRANT EXECUTE ON FUNCTION api.resolve_obligation(uuid, text, text, text, text, jsonb)
  TO authenticated, service_role;

-- ---------------------------------------------------------------
-- Backfill: re-run for any resolved obligations still missing
-- a receipt (same idempotency-keyed loop as 20260404120000).
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
           SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'core' AND table_name = 'obligations'
              AND column_name = 'receipt_id'
       ) THEN
        RAISE NOTICE 'Skipping backfill; founder obligation schema not present.';
        RETURN;
    END IF;

    SELECT id INTO v_event_type_id
      FROM registry.event_types WHERE name = 'obligation.resolved';
    SELECT id INTO v_receipt_type_id
      FROM registry.receipt_types WHERE name = 'obligation_proof';

    IF v_event_type_id IS NULL OR v_receipt_type_id IS NULL THEN
        RAISE EXCEPTION 'registry entries missing';
    END IF;

    FOR v_obl IN
        SELECT o.id, o.workspace_id, o.obligation_type,
               o.terminal_action, o.resolved_by_actor_class,
               o.resolved_by_actor_id, o.resolved_at
          FROM core.obligations o
         WHERE o.state = 'resolved' AND o.receipt_id IS NULL
         ORDER BY o.resolved_at ASC NULLS LAST
    LOOP
        v_idempotency_evt := 'obligation.resolved:' || v_obl.id::text;
        v_idempotency_rct := 'obligation.proof:'    || v_obl.id::text;

        INSERT INTO ledger.events (
            workspace_id, chain_key, event_type_id, payload,
            idempotency_key, seq, prev_hash, hash
        ) VALUES (
            v_obl.workspace_id, 'obligation:' || v_obl.id::text,
            v_event_type_id,
            jsonb_build_object(
                'obligation_id',   v_obl.id,
                'obligation_type', v_obl.obligation_type,
                'terminal_action', v_obl.terminal_action,
                'actor_class',     v_obl.resolved_by_actor_class,
                'actor_id',        v_obl.resolved_by_actor_id,
                'backfilled',      true
            ),
            v_idempotency_evt, 0, 'GENESIS', 'PENDING'
        )
        RETURNING id INTO v_event_id;

        IF v_event_id IS NULL THEN
            SELECT id INTO v_event_id FROM ledger.events
             WHERE idempotency_key = v_idempotency_evt
               AND workspace_id    = v_obl.workspace_id;
        END IF;

        CONTINUE WHEN v_event_id IS NULL;

        INSERT INTO ledger.receipts (
            workspace_id, event_id, receipt_type_id, chain_key,
            payload, idempotency_key, seq, prev_hash, hash
        ) VALUES (
            v_obl.workspace_id, v_event_id, v_receipt_type_id,
            'obligation:' || v_obl.id::text,
            jsonb_build_object('obligation_id', v_obl.id, 'backfilled', true),
            v_idempotency_rct, 0, 'GENESIS', 'PENDING'
        )
        RETURNING id INTO v_receipt_id;

        IF v_receipt_id IS NULL THEN
            SELECT id INTO v_receipt_id FROM ledger.receipts
             WHERE idempotency_key = v_idempotency_rct
               AND workspace_id    = v_obl.workspace_id;
        END IF;

        CONTINUE WHEN v_receipt_id IS NULL;

        -- Update receipt_id directly (trigger allows this since
        -- state is already 'resolved' and receipt_id is being set).
        UPDATE core.obligations
           SET receipt_id     = v_receipt_id,
               proof_state    = 'linked',
               proof_strength = 'kernel_receipt',
               linked_at      = COALESCE(linked_at, v_obl.resolved_at, now()),
               proof_note     = 'Backfilled by 20260404130000_fix_resolver_receipt_ordering'
         WHERE id = v_obl.id AND receipt_id IS NULL;

    END LOOP;
END $$;

COMMIT;
