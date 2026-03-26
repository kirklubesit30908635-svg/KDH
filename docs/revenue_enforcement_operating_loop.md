# revenue_enforcement_operating_loop

The product loop is:

1. Inspect DB truth
2. Inspect visible UI truth
3. Compare mismatch
4. Adjust product
5. Verify again

This repo already has the right surfaces to run that loop:

- DB truth lives in `core.obligations`, `core.objects`, `ledger.receipts`, `ingest.stripe_events`, `core.v_operator_next_actions`, `core.v_recent_receipts`, and `core.v_stripe_first_wedge_integrity_summary`.
- Visible operator truth lives in [src/app/command/page.tsx](C:/Users/chase kirk/autokirk-kernel/src/app/command/page.tsx), [src/app/command/receipts/page.tsx](C:/Users/chase kirk/autokirk-kernel/src/app/command/receipts/page.tsx), and [src/app/command/integrity/page.tsx](C:/Users/chase kirk/autokirk-kernel/src/app/command/integrity/page.tsx).
- Runtime health truth lives in the local Supabase containers, especially `supabase_db_autokirk-kernel`, `supabase_kong_autokirk-kernel`, `supabase_auth_autokirk-kernel`, and `supabase_storage_autokirk-kernel`.

## Operating rule

- Never trust the UI by itself.
- Never trust raw ingest by itself.
- Never call the wedge healthy unless obligation pressure, proof linkage, and visible operator force agree.

## The 5 checks to run next

### 1. Obligation pressure audit

Use `local-postgres-ro`.

Answer:

- How many open obligations exist?
- How many are overdue?
- How many have no owner?
- How many are explicitly marked blocked?
- How many are resolved without credible proof linkage?

Run the SQL in [docs/revenue_enforcement_query_pack.sql](C:/Users/chase kirk/autokirk-kernel/docs/revenue_enforcement_query_pack.sql) under `obligation pressure audit`.

Interpretation:

- High open + high overdue = pressure is real and unresolved.
- High unowned = product is surfacing work without responsibility.
- Zero blocked is not automatically healthy. In the current repo, `blocked` is present in the Stripe wedge contract but not as a first-class kernel state. A zero count may mean missing representation rather than no blockers.
- Any resolved obligation without credible proof means closure cannot be trusted.

### 2. Receipt integrity audit

Use `local-postgres-ro`.

Answer:

- Do resolved obligations reliably create receipts?
- Are obligation-chain receipts orphaned?
- Are there resolved obligations with no receipt trail?
- Are ledger receipts missing direct economic ref attachment?

Run the SQL in [docs/revenue_enforcement_query_pack.sql](C:/Users/chase kirk/autokirk-kernel/docs/revenue_enforcement_query_pack.sql) under `receipt integrity audit`.

Interpretation:

- `proof_gap` is the fastest signal that the system is claiming closure without evidence.
- Orphan obligation-chain receipts mean ledger truth and kernel truth are diverging.
- Missing `economic_ref_id` on ledger receipts is weaker than missing receipt linkage, but it still reduces enforceability.

### 3. UI truth audit

Use `local-playwright`.

Inspect these routes in order:

- `/login`
- `/command`
- `/command/receipts`
- `/command/integrity`

Answer:

- What does the operator see first?
- Are overdue and revenue-critical items surfaced first?
- Does the command screen feel like action or just reporting?
- Is proof visibility strong enough to trust a closure?
- Does the integrity screen explain pressure, proof lag, and event coverage clearly?

Current repo truth:

- [src/app/api/command/feed/route.ts](C:/Users/chase kirk/autokirk-kernel/src/app/api/command/feed/route.ts) orders the queue by `is_overdue desc`, then `due_at asc`, then `sort_key desc`.
- [src/app/command/page.tsx](C:/Users/chase kirk/autokirk-kernel/src/app/command/page.tsx) is already framed as a command rail, not a dashboard.
- [src/app/command/receipts/page.tsx](C:/Users/chase kirk/autokirk-kernel/src/app/command/receipts/page.tsx) is the proof layer.
- [src/app/command/integrity/page.tsx](C:/Users/chase kirk/autokirk-kernel/src/app/command/integrity/page.tsx) is the operator-visible scoring and signal layer.

### 4. Runtime health audit

Use `local-docker-ro`.

Check:

- DB healthy
- gateway healthy
- auth healthy
- no restart churn
- no error bursts during UI interaction

Primary containers:

- `supabase_db_autokirk-kernel`
- `supabase_kong_autokirk-kernel`
- `supabase_auth_autokirk-kernel`
- `supabase_storage_autokirk-kernel`
- `supabase_rest_autokirk-kernel`

Interpretation:

- If runtime is unstable, do not attribute weirdness to product logic yet.
- If runtime is stable and UI truth still disagrees with DB truth, that is a product/kernel mismatch.

### 5. Stripe-to-obligation spot check

Use `local-postgres-ro` first, then `local-playwright`.

Goal:

- Find a recent supported Stripe event
- Determine whether it produced billing-wedge object and obligation pressure
- Determine whether that pressure is visible in `/command`
- Determine whether closure can become visible in `/command/receipts`

Current repo truth to keep in mind:

- [src/app/api/stripe/webhook/route.ts](C:/Users/chase kirk/autokirk-kernel/src/app/api/stripe/webhook/route.ts) verifies the Stripe event and calls canonical ingest.
- [src/lib/stripe-canonical-ingest.ts](C:/Users/chase kirk/autokirk-kernel/src/lib/stripe-canonical-ingest.ts) writes through `api.ingest_stripe_event(...)`.
- The repo currently exposes `api.acknowledge_object(...)` and `api.open_obligation(...)`, but there is no obvious repo-owned bridge from canonical Stripe ingest into those mutation surfaces.

That means this spot check is not ceremonial. It is a live test for whether money movement becomes operational pressure or dies at ingest.

## Compare mismatch

After running the five checks, compare the truths like this:

- DB says overdue pressure exists, UI feels calm:
  UI is lying or deprioritizing the revenue queue.
- DB says proof is missing, receipts screen feels clean:
  the proof layer is overstating closure.
- Stripe events exist, but no object or obligation appears:
  the ingest-to-enforcement bridge is missing.
- Operators report blockers, but blocked count stays zero:
  the kernel is not expressing blocker state strongly enough.
- Runtime is unstable and UI/DB disagree:
  fix runtime noise before redesigning product logic.

## Adjust product

Only change what the mismatch proves.

- Queue ordering weak:
  strengthen command-surface prioritization and severity framing.
- Ownership weak:
  make assignment visible and mandatory.
- Proof weak:
  increase proof-state visibility and fail-closed behavior.
- Stripe bridge weak:
  build or repair the event -> object -> obligation path before polishing UI.
- Integrity view weak:
  elevate proof lag, event coverage, and aging pressure.

## Verify again

After each change:

1. run the same SQL probes
2. inspect the same UI surfaces
3. inspect runtime stability
4. compare again

Do not declare progress based on prettier UI alone.

## Thin helper layer rule

Do not add a Supabase-specific business helper layer yet.

Add one only if all three become true:

- the same diagnostic queries are being repeated constantly
- raw schema access is slowing operator iteration
- named probes such as `open_revenue_obligations`, `receipt_integrity_check`, or `orphan_stripe_events` would materially speed product decisions

If that happens, add a thin business diagnostic layer only. Do not add a generic abstraction.
