# Operator Read Surface Map

## What is true

- The supported operator stack is projection-first and server-side for live reads:
  - `/api/command/feed` reads `core.v_operator_next_actions`.
  - `/api/receipts/feed` reads `core.v_recent_receipts`.
  - `/api/integrity/stats` reads `core.v_stripe_first_wedge_integrity_summary` plus `core.v_operator_next_actions` and `core.v_recent_receipts`.
- The supported governed write path is still server-side:
  - `/api/command/seal` calls `sealObligation()` in `src/lib/obligation-store.ts`.
  - `sealObligation()` calls `api.command_resolve_obligation`.
- Route access is gated by `requireOperatorRouteContext()` in `src/lib/operator-access.ts`, which resolves the authenticated operator and active memberships before exposing the read routes.
- The operator-facing command, receipts, and integrity pages all consume API route handlers instead of browser-side direct writes.
- The repo is not a clean single-surface operator app. It contains both the supported `/command*` stack and additional preview/legacy entry faces that render overlapping live state.

## What the operator actually sees today

### Supported operator surfaces

- `/command`
  - Reads `/api/command/feed`.
  - Shows queue counts, risk badges, empty state, auth-locked state, and seal action.
  - Empty copy: `No open billing enforcement obligations require action right now.`
- `/command/receipts`
  - Reads `/api/receipts/feed`.
  - Shows search, auth-locked state, error state, empty state, and receipt detail.
  - Empty copy: `No receipts found` and `No receipts match your search`.
- `/command/integrity`
  - Reads `/api/integrity/stats`.
  - Shows computed integrity score, signal list, domain card, and score breakdown.
  - Empty/domain copy: `No obligations yet`; clean-signal copy: `All signals clear -- governance operating cleanly`.

### Additional entry and preview surfaces

- `/`
  - Static marketing/operator-entry page in `src/app/page.tsx`.
  - Links to `/command`, `/command/receipts`, `/command/integrity`, and `/login`.
  - It does not load live state.
- `/login`
  - Not just auth. It actively loads `/api/integrity/stats`, `/api/command/feed`, and `/api/receipts/feed`.
  - It renders queue preview, recent proof, integrity score, and empty-state copy such as:
    - `No open obligations. The system is operating cleanly.`
    - `No receipts are visible yet.`
    - `Live state unavailable.`
- `/app`
  - Redirect-only route to `/command`.
- `/api/customer/status`
  - Reads `api.customer_activation_status()`, which itself reads `core.v_customer_activation_spine`.
  - This is a separate activation/provisioning summary surface, not the billing-operator truth surface.

## Authoritative read surfaces

### Live operator truth surfaces

- `src/app/api/command/feed/route.ts`
  - Query: `core.v_operator_next_actions`
  - Scope: `workspace_id = defaultWorkspaceId`
- `src/app/api/receipts/feed/route.ts`
  - Query: `core.v_recent_receipts`
  - Scope: `workspace_id IN workspaceIds`
- `src/app/api/integrity/stats/route.ts`
  - Queries:
    - `core.v_stripe_first_wedge_integrity_summary`
    - `core.v_operator_next_actions`
    - `core.v_recent_receipts`
  - Scope: `workspace_id = defaultWorkspaceId`

### Access/read membrane

- `src/lib/operator-access.ts`
  - Reads:
    - `core.operators`
    - `core.memberships`
  - Governs:
    - `workspaceIds`
    - `defaultWorkspaceId`

### Projection contracts that matter

- `supabase/migrations/20260317202500_normalize_stripe_projection_labels.sql`
  - Defines `core.v_operator_next_actions`
  - Defines `core.v_recent_receipts`
- `supabase/migrations/20260319143000_stripe_first_wedge_integrity_summary.sql`
  - Defines `core.v_stripe_first_wedge_integrity_summary`
- `supabase/migrations/20260328120000_customer_activation_spine.sql`
  - Defines `core.v_customer_activation_spine`
  - Defines `api.customer_activation_status()`

## What is broken

### Critical operator-trust defect: read-scope mismatch can hide duty while proof still exists

- `src/lib/operator-access.ts` returns both `workspaceIds` and `defaultWorkspaceId`.
- `src/app/api/command/feed/route.ts` filters to exactly one workspace:
  - `.eq("workspace_id", defaultWorkspaceId)`
- `src/app/api/integrity/stats/route.ts` also filters to exactly one workspace:
  - `.eq("workspace_id", defaultWorkspaceId)`
- `src/app/api/receipts/feed/route.ts` reads all active memberships:
  - `.in("workspace_id", workspaceIds)`

This means a multi-workspace operator can see receipts from all workspaces while command and integrity only show the default workspace. That is the repo’s clearest code-level path for duty to be hidden while proof still exists.

### Duplicate proof face still exists

- `src/app/receipts/page.tsx` is a second receipts UI outside the supported `/command/receipts` surface.
- It fetches `/api/receipts/feed` directly, sets `rows` to the full JSON payload, and renders either:
  - `No receipts found`
  - or raw JSON via `<pre>{JSON.stringify(rows, null, 2)}</pre>`
- This duplicates the supported proof layer with different semantics, different empty-state handling, and no auth/error distinction.

### Entry surface duplicates live state and can overstate “all clear”

- `src/app/login/page.tsx` is not a pure sign-in screen. It is a live dashboard preview over the same read routes.
- It renders:
  - `No open obligations. The system is operating cleanly.`
  - `All clear`
  - `No receipts are visible yet.`
  - `Live state unavailable.`
- Because it is not the authoritative work surface, it is a second read face with its own summarization and reassurance copy.
- It also depends on the same mixed read scopes described above, so its “all clear” copy is not safe for multi-workspace operators.

### Honest proof labeling is currently weak

- Live receipt rows observed through `core.v_recent_receipts` currently surface null label fields for real Stripe proof:
  - `face = null`
  - `economic_ref_type = null`
  - `economic_ref_id = null`
- The canonical receipts UI therefore falls back to generic labels like `Unknown` or truncated IDs.
- This does not break authority, but it does break operator comprehension and violates the deterministic-label requirement.

### Empty state and clean state are not consistently separated

- `/command` empty state is narrow and action-oriented. This is good.
- `/login` uses broader clean-language:
  - `No open obligations. The system is operating cleanly.`
- `/command/integrity` can emit `All signals clear -- governance operating cleanly` even when the domain card also says `No obligations yet`.
- This conflates “no current pressure” with “clean system” on non-authoritative preview surfaces.

## Misleading or stale read surfaces

- `src/app/receipts/page.tsx`
  - Legacy duplicate proof page.
  - Different behavior from `/command/receipts`.
- `src/app/login/page.tsx`
  - Live preview/dashboard duplicate of command/receipts/integrity.
  - Contains stronger reassurance copy than the supported work surfaces.
- `src/app/api/customer/status/route.ts`
  - Separate activation-status summary path using `api.customer_activation_status()` and `core.v_customer_activation_spine`.
  - Useful for provisioning, but not authoritative for billing duty/proof.
- `src/app/page.tsx`
  - Static doctrine/marketing page that talks about receipts and integrity without reading live state.
  - Not harmful by itself, but not a truth surface.

## Views, query contracts, and diagnostics that matter

- `core.v_operator_next_actions`
  - Queue projection used by command feed and integrity stats.
  - Any suppression here suppresses visible duty.
- `core.v_recent_receipts`
  - Proof projection used by receipts feed and integrity stats.
  - Weak labels here degrade operator comprehension.
- `core.v_stripe_first_wedge_integrity_summary`
  - Wedge-specific integrity summary read by `/api/integrity/stats`.
- `core.v_customer_activation_spine`
  - Activation/provisioning summary view; not a command/proof truth surface.
- `api.customer_activation_status()`
  - RPC wrapper over activation spine; separate diagnostic/read model.

## Current migration list shape

- Foundational numeric chain: `0001` through `0033`
- Timestamped forward migrations for founder rebuild, projection repairs, receipt linkage, wedge integrity, escalation, provisioning, and activation spine
- Current tail includes:
  - `20260327210000_customer_provisioning_pipeline.sql`
  - `20260328060000_align_provisioning_to_autokirk_doctrine.sql`
  - `20260328120000_customer_activation_spine.sql`
  - untracked forward migration in the working tree: `20260329053000_repair_recent_receipts_projection.sql`

This is not a repo where rewriting settled historical migrations is low-risk. It has a real forward chain and production-facing route surfaces.

## Smallest safe sequence of fixes

1. Fix workspace-scope mismatch first.
   - Make command, receipts, and integrity read surfaces use one consistent workspace policy.
   - Do not let receipts aggregate across workspaces while duty/integrity remain single-workspace.
2. Remove or quarantine duplicate operator read faces.
   - Retire or redirect `src/app/receipts/page.tsx`.
   - Re-scope `/login` to auth entry, or explicitly frame it as preview-only and stop using it as a second live dashboard.
3. Strengthen `core.v_recent_receipts` labels in a forward additive migration.
   - Keep logic in the projection layer, not the browser.
   - Derive deterministic `face`, `economic_ref_type`, and `economic_ref_id` from committed truth.
4. Re-audit empty-state copy after read-scope repair.
   - Clean/clear copy should only appear when the authoritative surface is actually empty for the same scope it is summarizing.

## Files that govern the operator experience most

- `src/lib/operator-access.ts`
- `src/app/api/command/feed/route.ts`
- `src/app/api/receipts/feed/route.ts`
- `src/app/api/integrity/stats/route.ts`
- `src/app/api/command/seal/route.ts`
- `src/app/command/page.tsx`
- `src/app/command/receipts/page.tsx`
- `src/app/command/integrity/page.tsx`
- `src/app/login/page.tsx`
- `src/app/page.tsx`
- `src/app/receipts/page.tsx`
- `src/app/api/customer/status/route.ts`
- `supabase/migrations/20260317202500_normalize_stripe_projection_labels.sql`
- `supabase/migrations/20260319143000_stripe_first_wedge_integrity_summary.sql`
- `supabase/migrations/20260328120000_customer_activation_spine.sql`

## Risks / open questions grounded in repo evidence

- Multi-workspace operator behavior is currently under-specified in the supported read routes.
- The legacy `/receipts` page remains present in the app tree and can still surface proof differently from the canonical page.
- The login page is effectively a second operator dashboard, which increases the chance of contradictory “all clear” messaging.
- The receipts projection currently returns weak labels in live reads, which weakens operator comprehension even when proof exists.
