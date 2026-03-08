-- =============================================================
-- 0011_registry_stripe.sql
-- Seed Stripe event families into registry.event_types.
-- Additive only — no schema changes, no ACL changes.
-- All stripe.* event names must be registered here before
-- api.ingest_stripe_event() can accept them.
-- =============================================================

INSERT INTO registry.event_types (family, name, description) VALUES
  ('stripe', 'stripe.payment_intent.succeeded',          'Stripe PaymentIntent succeeded'),
  ('stripe', 'stripe.payment_intent.payment_failed',     'Stripe PaymentIntent payment failed'),
  ('stripe', 'stripe.payment_intent.created',            'Stripe PaymentIntent created'),
  ('stripe', 'stripe.payment_intent.canceled',           'Stripe PaymentIntent canceled'),
  ('stripe', 'stripe.invoice.paid',                      'Stripe Invoice paid'),
  ('stripe', 'stripe.invoice.payment_failed',            'Stripe Invoice payment failed'),
  ('stripe', 'stripe.invoice.created',                   'Stripe Invoice created'),
  ('stripe', 'stripe.invoice.finalized',                 'Stripe Invoice finalized'),
  ('stripe', 'stripe.customer.subscription.created',     'Stripe Subscription created'),
  ('stripe', 'stripe.customer.subscription.updated',     'Stripe Subscription updated'),
  ('stripe', 'stripe.customer.subscription.deleted',     'Stripe Subscription deleted'),
  ('stripe', 'stripe.customer.subscription.paused',      'Stripe Subscription paused'),
  ('stripe', 'stripe.customer.subscription.resumed',     'Stripe Subscription resumed'),
  ('stripe', 'stripe.checkout.session.completed',        'Stripe Checkout Session completed'),
  ('stripe', 'stripe.checkout.session.expired',          'Stripe Checkout Session expired'),
  ('stripe', 'stripe.charge.succeeded',                  'Stripe Charge succeeded'),
  ('stripe', 'stripe.charge.failed',                     'Stripe Charge failed'),
  ('stripe', 'stripe.charge.refunded',                   'Stripe Charge refunded');
