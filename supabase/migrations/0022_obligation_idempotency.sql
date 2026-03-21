-- =============================================================
-- 0022_obligation_idempotency.sql
--
-- Add idempotency_key to core.obligations so Stripe webhook
-- retries don't create duplicate obligations.
-- Key = stripe_event_id for Stripe-sourced obligations.
-- =============================================================

ALTER TABLE core.obligations
  ADD COLUMN idempotency_key text;
CREATE UNIQUE INDEX uq_obligations_idempotency
  ON core.obligations (idempotency_key)
  WHERE idempotency_key IS NOT NULL;
