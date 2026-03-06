-- =============================================================
-- 0005_ledger.sql
-- ledger schema: chain_heads, events (with idempotency index),
-- receipt_heads, receipts; insert triggers for both chains.
-- =============================================================

-- ---------------------------------------------------------------
-- ledger.chain_heads
-- Mutable pointer: current head of each (workspace, chain) pair.
-- Updated exclusively by ledger._events_before_insert().
-- No _deny_mutation trigger here — that trigger would block the
-- internal UPDATE. Client isolation via REVOKE ALL + RLS.
-- ---------------------------------------------------------------
CREATE TABLE ledger.chain_heads (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid        NOT NULL REFERENCES core.workspaces (id),
  chain_key    text        NOT NULL,
  head_hash    text        NOT NULL DEFAULT 'GENESIS',
  seq          bigint      NOT NULL DEFAULT 0,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, chain_key)
);

-- ---------------------------------------------------------------
-- ledger.events
-- Append-only, hash-chained ledger of business events.
-- seq, prev_hash, hash are assigned by the BEFORE INSERT trigger.
-- ---------------------------------------------------------------
CREATE TABLE ledger.events (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid        NOT NULL REFERENCES core.workspaces (id),
  chain_key       text        NOT NULL,
  seq             bigint      NOT NULL,
  event_type_id   int         NOT NULL REFERENCES registry.event_types (id),
  payload         jsonb       NOT NULL DEFAULT '{}',
  prev_hash       text        NOT NULL,
  hash            text        NOT NULL,
  idempotency_key text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, chain_key, seq)
);

-- Workspace-scoped idempotency: prevents cross-workspace key
-- collision and data-leak via the idempotency fallback path.
CREATE UNIQUE INDEX events_idempotency_key_uidx
  ON ledger.events (workspace_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ---------------------------------------------------------------
-- ledger._events_before_insert
-- Assigns seq, prev_hash, hash; enforces workspace-scoped
-- idempotency; advances chain_heads atomically via FOR UPDATE.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION ledger._events_before_insert()
RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_head ledger.chain_heads%ROWTYPE;
BEGIN
  -- Workspace-scoped idempotency: if the key is already recorded
  -- within this workspace, silently suppress the duplicate insert.
  IF NEW.idempotency_key IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM ledger.events
        WHERE idempotency_key = NEW.idempotency_key
          AND workspace_id    = NEW.workspace_id
     )
  THEN
    RETURN NULL;
  END IF;

  -- Upsert the chain head row so it exists, then lock it.
  INSERT INTO ledger.chain_heads (workspace_id, chain_key, head_hash, seq)
    VALUES (NEW.workspace_id, NEW.chain_key, 'GENESIS', 0)
    ON CONFLICT (workspace_id, chain_key) DO NOTHING;

  SELECT * INTO v_head
    FROM ledger.chain_heads
   WHERE workspace_id = NEW.workspace_id
     AND chain_key    = NEW.chain_key
     FOR UPDATE;

  -- Assign position in chain.
  NEW.seq       := v_head.seq + 1;
  NEW.prev_hash := v_head.head_hash;

  -- Hash covers the full causal context of this event.
  NEW.hash := ledger.sha256_hex(
    NEW.prev_hash          || '|' ||
    NEW.seq::text          || '|' ||
    NEW.workspace_id::text || '|' ||
    NEW.chain_key          || '|' ||
    NEW.event_type_id::text || '|' ||
    NEW.payload::text
  );

  -- Advance the chain head.
  UPDATE ledger.chain_heads
     SET head_hash  = NEW.hash,
         seq        = NEW.seq,
         updated_at = now()
   WHERE workspace_id = NEW.workspace_id
     AND chain_key    = NEW.chain_key;

  RETURN NEW;
END;
$$;

CREATE TRIGGER events_before_insert
  BEFORE INSERT ON ledger.events
  FOR EACH ROW EXECUTE FUNCTION ledger._events_before_insert();

CREATE TRIGGER events_deny_mutation
  BEFORE UPDATE OR DELETE ON ledger.events
  FOR EACH ROW EXECUTE FUNCTION ledger._deny_mutation();

-- ---------------------------------------------------------------
-- ledger.receipt_heads
-- Mutable pointer: current head of each (workspace, chain) receipt
-- chain. Updated exclusively by ledger._receipts_before_insert().
-- ---------------------------------------------------------------
CREATE TABLE ledger.receipt_heads (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid        NOT NULL REFERENCES core.workspaces (id),
  chain_key    text        NOT NULL,
  head_hash    text        NOT NULL DEFAULT 'GENESIS',
  seq          bigint      NOT NULL DEFAULT 0,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, chain_key)
);

-- ---------------------------------------------------------------
-- ledger.receipts
-- Append-only, hash-chained receipts table.
-- ---------------------------------------------------------------
CREATE TABLE ledger.receipts (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid        NOT NULL REFERENCES core.workspaces (id),
  event_id        uuid        NOT NULL REFERENCES ledger.events (id),
  receipt_type_id int         NOT NULL REFERENCES registry.receipt_types (id),
  chain_key       text        NOT NULL,
  seq             bigint      NOT NULL,
  payload         jsonb       NOT NULL DEFAULT '{}',
  prev_hash       text        NOT NULL,
  hash            text        NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, chain_key, seq)
);

-- ---------------------------------------------------------------
-- ledger._receipts_before_insert
-- Assigns seq, prev_hash, hash; advances receipt_heads atomically.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION ledger._receipts_before_insert()
RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_head ledger.receipt_heads%ROWTYPE;
BEGIN
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

CREATE TRIGGER receipts_before_insert
  BEFORE INSERT ON ledger.receipts
  FOR EACH ROW EXECUTE FUNCTION ledger._receipts_before_insert();

CREATE TRIGGER receipts_deny_mutation
  BEFORE UPDATE OR DELETE ON ledger.receipts
  FOR EACH ROW EXECUTE FUNCTION ledger._deny_mutation();
