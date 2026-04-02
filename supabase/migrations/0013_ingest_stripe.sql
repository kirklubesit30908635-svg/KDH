-- =============================================================
-- 0013_ingest_stripe.sql
-- ingest.stripe_events: append-only Stripe webhook envelope
-- storage. One row per Stripe event per provider connection.
--
-- Idempotency is scoped to (provider_connection_id, stripe_event_id)
-- to ensure safe deduplication across multiple Stripe accounts.
--
-- workspace_id is denormalized from core.provider_connections
-- for query efficiency. It is always set by the kernel ingest
-- function — never by caller input.
--
-- No authenticated read path. This is an internal pipeline table.
-- =============================================================

CREATE TABLE ingest.stripe_events (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_connection_id uuid        NOT NULL REFERENCES core.provider_connections (id),
  workspace_id           uuid        NOT NULL REFERENCES core.workspaces (id),
  stripe_event_id        text        NOT NULL,
  stripe_type            text        NOT NULL,
  livemode               boolean     NOT NULL,
  api_version            text,
  stripe_created_at      timestamptz NOT NULL,
  payload                jsonb       NOT NULL,
  received_at            timestamptz NOT NULL DEFAULT now(),
  -- Idempotency scoped per provider connection, not globally.
  -- A stripe_event_id from one Stripe account cannot collide
  -- with the same ID from a different account.
  UNIQUE (provider_connection_id, stripe_event_id)
);
COMMENT ON TABLE ingest.stripe_events IS
  'Append-only Stripe webhook envelope storage. One row per Stripe '
  'event per provider connection. workspace_id is derived from the '
  'provider connection by the kernel — never trusted from input.';
CREATE INDEX idx_ingest_stripe_events_workspace_type
  ON ingest.stripe_events (workspace_id, stripe_type, received_at DESC);
CREATE INDEX idx_ingest_stripe_events_connection
  ON ingest.stripe_events (provider_connection_id, received_at DESC);
CREATE TRIGGER stripe_events_deny_mutation
  BEFORE UPDATE OR DELETE ON ingest.stripe_events
  FOR EACH ROW EXECUTE FUNCTION ledger._deny_mutation();
-- ---------------------------------------------------------------
-- ACL: No authenticated read or write path.
-- This is an internal pipeline table only.
-- api.ingest_stripe_event() (SECURITY DEFINER / postgres) is the
-- sole write path.
-- ---------------------------------------------------------------
REVOKE ALL ON TABLE ingest.stripe_events FROM anon, authenticated;
ALTER TABLE ingest.stripe_events ENABLE ROW LEVEL SECURITY;
