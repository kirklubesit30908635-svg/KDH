-- Add Stripe subscription tracking fields to core.operators
ALTER TABLE core.operators
  ADD COLUMN IF NOT EXISTS stripe_customer_id     text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS subscription_status    text NOT NULL DEFAULT 'inactive';
-- Fast lookup by customer_id (used by subscription.deleted webhook)
CREATE INDEX IF NOT EXISTS idx_operators_stripe_customer_id
  ON core.operators (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;
