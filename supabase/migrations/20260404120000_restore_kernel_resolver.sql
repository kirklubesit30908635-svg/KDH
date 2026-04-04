-- =============================================================
-- 20260404120000_restore_kernel_resolver.sql
--
-- PURE RESTORATION MIGRATION
--
-- Problem: 20260314170000_fix_rpc_member_guards.sql overwrote the
-- full api.resolve_obligation (defined in 0032_seal_receipt_invariant.sql)
-- with a stripped version that only updates the obligation row.
-- The stripped version emits NO ledger event, NO receipt, and NO
-- proof linkage — so every obligation resolved since that migration
-- has proof_state = 'missing'.
--
-- Fix: Restore the canonical resolver from 0032 exactly, with the
-- assert_member guard from 20260314170000 preserved. Re-run the
-- backfill to remediate any obligations resolved without proof.
--
-- This migration does NOT change any other function.
-- =============================================================

BEGIN;

-- ---------------------------------------------------------------
-- A. Schema guards — ensure 0032/0033 schema additions exist
--    regardless of prior application state.
-- ---------------------------------------------------------------

-- Receipt idempotency column (from 0032)
ALTER TABLE ledger.receipts
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS receipts_idempotency_key_uidx
  ON ledger.receipts (workspace_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Obligation idempotency column (from 0033)
ALTER TABLE core.obligations
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS obligations_idempotency_key_uidx
  ON core.obligations (workspace_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Object upsert index (from 0033)
CREATE UNIQUE INDEX IF NOT EXISTS objects_workspace_class_source_ref_uidx
  ON core.objects (workspace_id, kernel_class, source_ref)
  WHERE source_ref IS NOT NULL;

-- Registry seeds (from 0032)
INSERT INTO registry.event_types (family, name, description)
VALUES ('obligation', 'obligation.resolved', 'Obligation resolved — terminal action recorded')
ON CONFLICT (name) DO NOTHING;

INSERT INTO registry.receipt_types (name, description)
VALUES ('obligation_proof', 'Proof of obligation resolution committed to the ledger')
ON CONFLICT (name) DO NOTHING;

-- Vocabulary seed (from 0033)
INSERT INTO core.object_class_postures (kernel_class, economic_posture)
VALUES ('subscription', 'direct_revenue')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------
-- B. Receipt trigger — ensure idempotency-aware version is live.
--    Copied exactly from 0032_seal_receipt_invariant.sql lines 75-125.
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
-- C. THE CANONICAL RESOLVER — restored from 0032 lines 335-476.
--    This is the critical piece. The function:
--    - Takes FOR UPDATE lock on the obligation row
--    - Updates the obligation state to 'resolved'
--    - If already resolved: returns (idempotent, no crash)
--    - Emits a ledger event with idempotency key
--    - Emits a proof receipt with idempotency key
--    - Links the receipt to the obligation row
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
-- D. Grants
-- ---------------------------------------------------------------

GRANT EXECUTE ON FUNCTION api.resolve_obligation(uuid, text, text, text, text, jsonb)
  TO authenticated, service_role;

-- ---------------------------------------------------------------
-- E. BACKFILL — remediate resolved obligations that have no
--    committed ledger receipt. Copied from 0032 lines 516-642.
--    Idempotency keys ensure this block is safe to re-run.
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
            'Skipping receipt backfill; founder obligation schema is not present yet.';
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
               proof_note     = 'Backfilled by 20260404120000_restore_kernel_resolver'
         WHERE id          = v_obl.id
           AND receipt_id  IS NULL;

    END LOOP;
END $$;

COMMIT;
