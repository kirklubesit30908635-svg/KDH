-- =============================================================
-- 0015_stripe_acl_rls.sql
-- ACL audit and hardening pass for all Stripe ingest objects
-- introduced in 0012, 0013, and 0014.
--
-- This migration is authoritative for the Stripe ingest ACL.
-- It confirms and finalises all REVOKE/GRANT/RLS state.
-- =============================================================

-- ---------------------------------------------------------------
-- Schema USAGE
-- core and api USAGE already granted to authenticated (0006, 0007).
-- ingest has no authenticated USAGE grant and must not receive one:
-- ingest is an internal pipeline schema only.
-- No new USAGE grants required.
-- ---------------------------------------------------------------

-- ---------------------------------------------------------------
-- core.provider_connections
-- Confirmed: REVOKE ALL + GRANT SELECT TO authenticated (0012).
-- RLS policy provider_connections_select_member enforces
-- core.is_member(workspace_id) — workspace-scoped reads only.
-- No write policy: connections are managed administratively.
-- No further changes required.
-- ---------------------------------------------------------------

-- ---------------------------------------------------------------
-- ingest.stripe_events
-- Confirmed: REVOKE ALL from anon, authenticated (0013).
-- RLS enabled with no permissive policy — default deny at row level
-- confirms the table-level REVOKE. No client read path exists.
-- No further changes required.
-- ---------------------------------------------------------------

-- ---------------------------------------------------------------
-- api.ingest_stripe_event
-- PostgreSQL grants EXECUTE to PUBLIC on every new function.
-- Revoke from PUBLIC, then re-grant to authenticated only.
-- anon has no write surface into this function.
-- ---------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION api.ingest_stripe_event(
  text, text, text, boolean, text, timestamptz, jsonb
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION api.ingest_stripe_event(
  text, text, text, boolean, text, timestamptz, jsonb
) TO authenticated;

-- ---------------------------------------------------------------
-- core.set_updated_at (introduced in 0012)
-- Internal trigger function. Already revoked from PUBLIC in 0012.
-- Confirmed — no further action required.
-- ---------------------------------------------------------------

-- ---------------------------------------------------------------
-- Ledger chain_key namespace note (informational)
-- api.ingest_stripe_event writes chain_key = p_stripe_type directly,
-- e.g. 'stripe.payment_intent.succeeded'.
-- chain_key is a free-text scoping key, not a registry reference.
-- Using the event type name as the chain_key scopes each Stripe
-- event family to its own chain within the workspace ledger.
-- ---------------------------------------------------------------
