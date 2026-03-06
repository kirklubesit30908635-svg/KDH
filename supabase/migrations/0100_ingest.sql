-- =============================================================
-- 0100_ingest.sql
-- ingest schema: raw_events and trusted_events staging tables.
-- Append-only; deny-mutation triggers applied inline.
-- RLS and REVOKE are applied here (not in 0007_rls.sql) because
-- this file runs after the kernel RLS file.
-- =============================================================

-- Append-only staging table for all inbound events from any source.
CREATE TABLE ingest.raw_events (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid        NOT NULL REFERENCES core.workspaces (id),
  source       text        NOT NULL,
  payload      jsonb       NOT NULL,
  received_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER raw_events_deny_mutation
  BEFORE UPDATE OR DELETE ON ingest.raw_events
  FOR EACH ROW EXECUTE FUNCTION ledger._deny_mutation();

-- Append-only table for raw events that have passed validation
-- and classification.
CREATE TABLE ingest.trusted_events (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid        NOT NULL REFERENCES core.workspaces (id),
  raw_event_id  uuid        REFERENCES ingest.raw_events (id),
  event_type_id int         NOT NULL REFERENCES registry.event_types (id),
  payload       jsonb       NOT NULL,
  trusted_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trusted_events_deny_mutation
  BEFORE UPDATE OR DELETE ON ingest.trusted_events
  FOR EACH ROW EXECUTE FUNCTION ledger._deny_mutation();

-- ---------------------------------------------------------------
-- Ingest ACL: revoke all client access and enable RLS.
-- No authenticated read path exists in the current kernel.
-- Default-deny RLS confirms the REVOKE at the row level.
-- ---------------------------------------------------------------
REVOKE ALL ON TABLE ingest.raw_events     FROM anon, authenticated;
REVOKE ALL ON TABLE ingest.trusted_events FROM anon, authenticated;

ALTER TABLE ingest.raw_events     ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingest.trusted_events ENABLE ROW LEVEL SECURITY;
