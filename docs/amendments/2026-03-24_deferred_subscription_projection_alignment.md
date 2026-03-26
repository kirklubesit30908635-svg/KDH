# core_amendment_2026_03_24_deferred_subscription_projection_alignment

## Amendment proposal

Align the live Stripe billing wedge implementation with doctrine and vocabulary:

- treat `stripe.customer.subscription.created` and `stripe.customer.subscription.deleted` as **deferred**
- keep those events append-only at ingest
- prevent them from mutating operator, object, or obligation truth inside the frozen billing wedge
- normalize operator-facing vocabulary to use **revenue enforcement** and **enforcement domain** language

## Why amendment is required

This change affects lifecycle semantics and governance boundaries.

The doctrine currently says subscription lifecycle events are deferred until broader semantics are formalized, but the live SQL projection still mutates truth on `stripe.customer.subscription.deleted`. That is a direct doctrine breach.

## Doctrine alignment

- Core primitives do not change.
- Closure remains the only lawful completion.
- Receipts remain mandatory consequence artifacts.
- No legacy, dead, or deferred surface is promoted by this amendment.

## Migration plan

1. Add a forward migration that rewrites `api.project_operator_subscription_event(...)`.
2. Rewrite `api.rebuild_operator_subscription_projection(...)` so it replays only supported checkout activation events.
3. Rewrite `api.ingest_stripe_event(...)` so live downstream projection is invoked only for supported checkout activation events.
4. Update operator-facing copy so external language matches doctrine while internal schema names stay contained.
5. Add tests that fail if deferred subscription lifecycle events are wired back into live projection.

## Rollback plan

1. Revert the new migration file and UI vocabulary changes.
2. Re-run `supabase db reset` to restore the prior projection behavior.
3. Re-run tests to confirm the repo is back on the previous chain.

Rollback is safe because this amendment does not remove append-only ledger history. It only narrows which ingested events are allowed to mutate live operator truth.

## Drift risk analysis

- **Low risk**: metadata and UI vocabulary changes. They do not alter kernel writes.
- **Medium risk**: rebuild behavior changes for operator subscription projection. Rebuild output will stop honoring deferred deletion semantics.
- **Intentional behavior change**: subscription deletion events will still be ingested and receipted, but they will no longer block or mutate operator-access obligations in the frozen wedge.

## Expected result

After this amendment:

- supported movements continue to create governed pressure
- deferred subscription lifecycle events remain observable in the ledger
- doctrine, code, and operator language no longer contradict each other
