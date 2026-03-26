-- 0033_subscription_obligation_flow.sql
--
-- Historical note:
-- This migration previously attempted to:
-- - create subscription direct-revenue vocabulary,
-- - add obligation idempotency support,
-- - define subscription-created mutation RPCs, and
-- - redefine command mutation functions.
--
-- That body depended on founder-era core.objects/core.obligations schema
-- that is not available at this point in the chain, so a clean reset failed
-- before the canonical founder rebuild migrations could run.
--
-- It also reintroduced a customer.subscription.created obligation path that
-- no longer matches the frozen Stripe billing wedge doctrine, where broader
-- subscription lifecycle semantics are deferred and the live command rail is
-- defined by later founder-era migrations.
--
-- The canonical versions now live later in the chain:
-- - founder-era core schema rebuilds
-- - governed command mutation migrations
-- - wedge-specific Stripe projection migrations
--
-- This compatibility migration is therefore intentionally a no-op so the
-- clean reset path reaches the later canonical definitions.

BEGIN;
COMMIT;
