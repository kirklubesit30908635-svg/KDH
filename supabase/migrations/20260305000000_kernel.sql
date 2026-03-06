-- =============================================================
-- autokirk-kernel  —  20260305000000_kernel.sql
-- Kernel only. No Stripe. No face tables. No projections.
-- =============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =============================================================
-- SECTION 0: Utility functions
-- =============================================================

-- Raise on UPDATE/DELETE; attach as BEFORE trigger on append-only tables.
CREATE OR REPLACE FUNCTION _deny_mutation()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'table "%" is append-only: % is not permitted',
    TG_TABLE_NAME, TG_OP;
END;
$$;

-- SHA-256 hex digest of any text input.
CREATE OR REPLACE FUNCTION sha256_hex(input text)
RETURNS text
LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT encode(digest(input, 'sha256'), 'hex');
$$;

-- =============================================================
-- SECTION 1: Tenant / Workspace / Department
-- =============================================================

CREATE TABLE tenants (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       text        NOT NULL UNIQUE,
  name       text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE workspaces (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid        NOT NULL REFERENCES tenants (id),
  slug       text        NOT NULL,
  name       text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);

CREATE TABLE departments (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid        NOT NULL REFERENCES workspaces (id),
  slug         text        NOT NULL,
  name         text        NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, slug)
);

-- =============================================================
-- SECTION 2: Operators and Memberships
-- =============================================================

CREATE TABLE operators (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Soft reference to auth.users; no FK to keep kernel schema-independent.
  auth_uid   uuid        UNIQUE,
  handle     text        NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE memberships (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id  uuid        NOT NULL REFERENCES operators (id),
  workspace_id uuid        NOT NULL REFERENCES workspaces (id),
  role         text        NOT NULL DEFAULT 'member'
                           CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operator_id, workspace_id)
);

-- Resolves the operators row for the current Supabase auth session.
CREATE OR REPLACE FUNCTION current_operator_id()
RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT id FROM operators WHERE auth_uid = auth.uid();
$$;

-- Returns TRUE when the session operator holds any membership in the workspace.
CREATE OR REPLACE FUNCTION is_member(p_workspace_id uuid)
RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1
      FROM memberships
     WHERE operator_id  = current_operator_id()
       AND workspace_id = p_workspace_id
  );
$$;

-- Raises an exception when the session operator is not a member of the workspace.
CREATE OR REPLACE FUNCTION assert_member(p_workspace_id uuid)
RETURNS void
LANGUAGE plpgsql STABLE AS $$
BEGIN
  IF NOT is_member(p_workspace_id) THEN
    RAISE EXCEPTION 'operator % is not a member of workspace %',
      current_operator_id(), p_workspace_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
END;
$$;

-- =============================================================
-- SECTION 3: Registry — event_types and receipt_types
-- =============================================================

CREATE TABLE event_types (
  id          serial      PRIMARY KEY,
  family      text        NOT NULL,
  name        text        NOT NULL UNIQUE,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE receipt_types (
  id          serial      PRIMARY KEY,
  name        text        NOT NULL UNIQUE,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---- Seed: 12 event families --------------------------------

INSERT INTO event_types (family, name, description) VALUES
  -- 1. system
  ('system',       'system.booted',              'Kernel bootstrap completed'),
  ('system',       'system.shutdown',             'Kernel shutdown initiated'),
  -- 2. auth
  ('auth',         'auth.login',                  'Operator authenticated'),
  ('auth',         'auth.logout',                 'Operator session terminated'),
  -- 3. workflow
  ('workflow',     'workflow.started',             'Workflow instance started'),
  ('workflow',     'workflow.completed',           'Workflow instance completed'),
  ('workflow',     'workflow.failed',              'Workflow instance failed'),
  -- 4. task
  ('task',         'task.enqueued',               'Task placed in queue'),
  ('task',         'task.executed',               'Task execution completed'),
  ('task',         'task.failed',                 'Task execution failed'),
  -- 5. agent
  ('agent',        'agent.invoked',               'Agent invocation triggered'),
  ('agent',        'agent.responded',             'Agent produced a response'),
  -- 6. tool
  ('tool',         'tool.called',                 'Tool call initiated'),
  ('tool',         'tool.returned',               'Tool call returned a result'),
  -- 7. ingest
  ('ingest',       'ingest.received',             'Raw event received from source'),
  ('ingest',       'ingest.trusted',              'Raw event promoted to trusted'),
  -- 8. ledger
  ('ledger',       'ledger.appended',             'Event appended to ledger chain'),
  ('ledger',       'ledger.chain_created',        'New ledger chain initialised'),
  -- 9. receipt
  ('receipt',      'receipt.issued',              'Receipt issued for an event'),
  -- 10. notification
  ('notification', 'notification.sent',           'Notification dispatched'),
  ('notification', 'notification.failed',         'Notification delivery failed'),
  -- 11. audit
  ('audit',        'audit.accessed',              'Resource access recorded'),
  ('audit',        'audit.modified',              'Resource modification recorded'),
  -- 12. integration
  ('integration',  'integration.connected',       'External integration connected'),
  ('integration',  'integration.synced',          'External integration sync completed');

-- ---- Seed: 4 receipt types ----------------------------------

INSERT INTO receipt_types (name, description) VALUES
  ('ack',    'Positive acknowledgment — event accepted and processed'),
  ('nack',   'Negative acknowledgment — event rejected, retry eligible'),
  ('error',  'Processing error — event failed, not retry eligible'),
  ('commit', 'Commit confirmation — durable side-effect recorded');

-- =============================================================
-- SECTION 4: Ledger — chain_heads and events
-- =============================================================

-- Mutable state: tracks the current head of each (workspace, chain) pair.
-- Updated exclusively by the events BEFORE INSERT trigger; never by users.
CREATE TABLE chain_heads (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid        NOT NULL REFERENCES workspaces (id),
  chain_key    text        NOT NULL,
  head_hash    text        NOT NULL DEFAULT 'GENESIS',
  seq          bigint      NOT NULL DEFAULT 0,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, chain_key)
);

-- Append-only, hash-chained ledger of business events.
CREATE TABLE events (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid        NOT NULL REFERENCES workspaces (id),
  chain_key       text        NOT NULL,
  seq             bigint      NOT NULL,          -- assigned by trigger
  event_type_id   int         NOT NULL REFERENCES event_types (id),
  payload         jsonb       NOT NULL DEFAULT '{}',
  prev_hash       text        NOT NULL,          -- assigned by trigger
  hash            text        NOT NULL,          -- assigned by trigger
  idempotency_key text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, chain_key, seq)
);

-- Partial unique index: idempotency_key must be unique when provided.
CREATE UNIQUE INDEX events_idempotency_key_uidx
  ON events (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Assigns seq, prev_hash, and hash; enforces idempotency.
CREATE OR REPLACE FUNCTION _events_before_insert()
RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_head chain_heads%ROWTYPE;
BEGIN
  -- Idempotency: if the key is already recorded, silently suppress the insert.
  IF NEW.idempotency_key IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM events WHERE idempotency_key = NEW.idempotency_key
     )
  THEN
    RETURN NULL;
  END IF;

  -- Upsert the chain head row so it exists, then lock it.
  INSERT INTO chain_heads (workspace_id, chain_key, head_hash, seq)
    VALUES (NEW.workspace_id, NEW.chain_key, 'GENESIS', 0)
    ON CONFLICT (workspace_id, chain_key) DO NOTHING;

  SELECT * INTO v_head
    FROM chain_heads
   WHERE workspace_id = NEW.workspace_id
     AND chain_key    = NEW.chain_key
     FOR UPDATE;

  -- Assign position in chain.
  NEW.seq       := v_head.seq + 1;
  NEW.prev_hash := v_head.head_hash;

  -- Hash covers the full causal context of this event.
  NEW.hash := sha256_hex(
    NEW.prev_hash       || '|' ||
    NEW.seq::text       || '|' ||
    NEW.workspace_id::text || '|' ||
    NEW.chain_key       || '|' ||
    NEW.event_type_id::text || '|' ||
    NEW.payload::text
  );

  -- Advance the chain head.
  UPDATE chain_heads
     SET head_hash  = NEW.hash,
         seq        = NEW.seq,
         updated_at = now()
   WHERE workspace_id = NEW.workspace_id
     AND chain_key    = NEW.chain_key;

  RETURN NEW;
END;
$$;

CREATE TRIGGER events_before_insert
  BEFORE INSERT ON events
  FOR EACH ROW EXECUTE FUNCTION _events_before_insert();

CREATE TRIGGER events_deny_mutation
  BEFORE UPDATE OR DELETE ON events
  FOR EACH ROW EXECUTE FUNCTION _deny_mutation();

-- =============================================================
-- SECTION 5: Receipts — receipt_heads and receipts
-- =============================================================

-- Mutable state: current head of each (workspace, chain) receipt chain.
CREATE TABLE receipt_heads (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid        NOT NULL REFERENCES workspaces (id),
  chain_key    text        NOT NULL,
  head_hash    text        NOT NULL DEFAULT 'GENESIS',
  seq          bigint      NOT NULL DEFAULT 0,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, chain_key)
);

-- Append-only, hash-chained receipts table.
CREATE TABLE receipts (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid        NOT NULL REFERENCES workspaces (id),
  event_id        uuid        NOT NULL REFERENCES events (id),
  receipt_type_id int         NOT NULL REFERENCES receipt_types (id),
  chain_key       text        NOT NULL,
  seq             bigint      NOT NULL,          -- assigned by trigger
  payload         jsonb       NOT NULL DEFAULT '{}',
  prev_hash       text        NOT NULL,          -- assigned by trigger
  hash            text        NOT NULL,          -- assigned by trigger
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, chain_key, seq)
);

-- Assigns seq, prev_hash, and hash for each receipt.
CREATE OR REPLACE FUNCTION _receipts_before_insert()
RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_head receipt_heads%ROWTYPE;
BEGIN
  INSERT INTO receipt_heads (workspace_id, chain_key, head_hash, seq)
    VALUES (NEW.workspace_id, NEW.chain_key, 'GENESIS', 0)
    ON CONFLICT (workspace_id, chain_key) DO NOTHING;

  SELECT * INTO v_head
    FROM receipt_heads
   WHERE workspace_id = NEW.workspace_id
     AND chain_key    = NEW.chain_key
     FOR UPDATE;

  NEW.seq       := v_head.seq + 1;
  NEW.prev_hash := v_head.head_hash;

  NEW.hash := sha256_hex(
    NEW.prev_hash           || '|' ||
    NEW.seq::text           || '|' ||
    NEW.workspace_id::text  || '|' ||
    NEW.chain_key           || '|' ||
    NEW.event_id::text      || '|' ||
    NEW.receipt_type_id::text || '|' ||
    NEW.payload::text
  );

  UPDATE receipt_heads
     SET head_hash  = NEW.hash,
         seq        = NEW.seq,
         updated_at = now()
   WHERE workspace_id = NEW.workspace_id
     AND chain_key    = NEW.chain_key;

  RETURN NEW;
END;
$$;

CREATE TRIGGER receipts_before_insert
  BEFORE INSERT ON receipts
  FOR EACH ROW EXECUTE FUNCTION _receipts_before_insert();

CREATE TRIGGER receipts_deny_mutation
  BEFORE UPDATE OR DELETE ON receipts
  FOR EACH ROW EXECUTE FUNCTION _deny_mutation();

-- =============================================================
-- SECTION 6: Ingest — raw_events and trusted_events
-- =============================================================

-- Append-only staging table for all inbound events from any source.
CREATE TABLE raw_events (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid        NOT NULL REFERENCES workspaces (id),
  source       text        NOT NULL,
  payload      jsonb       NOT NULL,
  received_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER raw_events_deny_mutation
  BEFORE UPDATE OR DELETE ON raw_events
  FOR EACH ROW EXECUTE FUNCTION _deny_mutation();

-- Append-only table for raw events that have passed validation and classification.
CREATE TABLE trusted_events (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid        NOT NULL REFERENCES workspaces (id),
  raw_event_id  uuid        REFERENCES raw_events (id),
  event_type_id int         NOT NULL REFERENCES event_types (id),
  payload       jsonb       NOT NULL,
  trusted_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trusted_events_deny_mutation
  BEFORE UPDATE OR DELETE ON trusted_events
  FOR EACH ROW EXECUTE FUNCTION _deny_mutation();

-- =============================================================
-- SECTION 7: Access Control — RLS, REVOKE, and kernel RPCs
-- =============================================================

-- ---------------------------------------------------------------
-- 7a. RLS on the mutable pointer tables (chain_heads, receipt_heads)
-- ---------------------------------------------------------------
-- These tables are legitimately updated by kernel BEFORE INSERT
-- triggers (_events_before_insert, _receipts_before_insert).
-- A _deny_mutation() trigger on UPDATE would block those internal
-- writes and is therefore intentionally omitted here.
--
-- Client isolation is enforced by two independent layers:
--   1. REVOKE ALL from anon and authenticated (table privileges)
--   2. ENABLE ROW LEVEL SECURITY with no permissive policy for
--      client roles (RLS default-deny)
--
-- The postgres superuser bypasses RLS, which is required for the
-- kernel triggers to advance the chain pointers.

ALTER TABLE chain_heads   ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipt_heads ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------
-- 7b. RLS on the append-only ledgers (events, receipts)
-- ---------------------------------------------------------------
ALTER TABLE events   ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;

-- Authenticated operators may SELECT events in workspaces they
-- belong to. No INSERT/UPDATE/DELETE policy: all writes must go
-- through api.append_event.
CREATE POLICY events_select_member ON events
  FOR SELECT TO authenticated
  USING (is_member(workspace_id));

-- Authenticated operators may SELECT receipts in their workspace.
-- No INSERT/UPDATE/DELETE policy: all writes must go through
-- api.emit_receipt.
CREATE POLICY receipts_select_member ON receipts
  FOR SELECT TO authenticated
  USING (is_member(workspace_id));

-- ---------------------------------------------------------------
-- 7c. Revoke all direct table access from client roles
-- ---------------------------------------------------------------
REVOKE ALL ON TABLE tenants        FROM anon, authenticated;
REVOKE ALL ON TABLE workspaces     FROM anon, authenticated;
REVOKE ALL ON TABLE departments    FROM anon, authenticated;
REVOKE ALL ON TABLE operators      FROM anon, authenticated;
REVOKE ALL ON TABLE memberships    FROM anon, authenticated;
REVOKE ALL ON TABLE event_types    FROM anon, authenticated;
REVOKE ALL ON TABLE receipt_types  FROM anon, authenticated;
REVOKE ALL ON TABLE chain_heads    FROM anon, authenticated;
REVOKE ALL ON TABLE events         FROM anon, authenticated;
REVOKE ALL ON TABLE receipt_heads  FROM anon, authenticated;
REVOKE ALL ON TABLE receipts       FROM anon, authenticated;
REVOKE ALL ON TABLE raw_events     FROM anon, authenticated;
REVOKE ALL ON TABLE trusted_events FROM anon, authenticated;

-- Reference catalogue is read-safe; expose to authenticated only.
GRANT SELECT ON TABLE event_types   TO authenticated;
GRANT SELECT ON TABLE receipt_types TO authenticated;

-- ---------------------------------------------------------------
-- 7d. api schema — SECURITY DEFINER write surface
-- ---------------------------------------------------------------
-- All kernel write operations are exposed through SECURITY DEFINER
-- functions in the api schema. These functions run as their owner
-- (postgres), assert workspace membership, and delegate all chain
-- sequencing and hash computation to the BEFORE INSERT triggers.
-- No client role may write directly to any kernel table.

CREATE SCHEMA IF NOT EXISTS api;

-- api.append_event — sole authorised write path into the events ledger.
--
-- Flow:
--   1. assert_member() aborts if the calling operator is not a
--      member of the target workspace.
--   2. event_type name is resolved to its registry id; unknown
--      types are rejected.
--   3. INSERT fires _events_before_insert() which assigns seq,
--      prev_hash, and hash, and advances chain_heads atomically.
--   4. If an idempotency_key is supplied and the event already
--      exists, the trigger suppresses the INSERT (RETURN NULL) and
--      this function surfaces the committed row instead.
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
SET search_path = public, pg_temp
AS $$
DECLARE
  v_type_id  int;
  v_event_id uuid;
  v_seq      bigint;
  v_hash     text;
BEGIN
  PERFORM assert_member(p_workspace_id);

  SELECT id INTO v_type_id FROM event_types WHERE name = p_event_type;
  IF v_type_id IS NULL THEN
    RAISE EXCEPTION 'unknown event_type: %', p_event_type
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- seq, prev_hash, and hash are placeholder values; the
  -- _events_before_insert() trigger overwrites all three before
  -- the row is durably stored.
  INSERT INTO events (
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
      FROM events
     WHERE idempotency_key = p_idempotency_key;
  END IF;

  RETURN QUERY SELECT v_event_id, v_seq, v_hash;
END;
$$;

-- api.emit_receipt — sole authorised write path into the receipts ledger.
--
-- Flow mirrors api.append_event: membership guard → type resolution
-- → INSERT that fires _receipts_before_insert() to assign seq,
-- prev_hash, hash, and advance receipt_heads.
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
SET search_path = public, pg_temp
AS $$
DECLARE
  v_type_id    int;
  v_receipt_id uuid;
  v_seq        bigint;
  v_hash       text;
BEGIN
  PERFORM assert_member(p_workspace_id);

  SELECT id INTO v_type_id FROM receipt_types WHERE name = p_receipt_type;
  IF v_type_id IS NULL THEN
    RAISE EXCEPTION 'unknown receipt_type: %', p_receipt_type
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  INSERT INTO receipts (
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
GRANT EXECUTE ON FUNCTION api.emit_receipt(uuid, uuid, text, text, jsonb) TO authenticated;
