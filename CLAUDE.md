# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

This is a mixed application + database repository. The canonical database lives under `supabase/` and is still a migration-first Supabase/Postgres kernel, but the repo also contains a Next.js app, server routes, helper libraries, and tests that operationalize kernel truth. Do not assume this repo is SQL-only.

## Active structure

- `supabase/migrations` — authoritative migration chain. Migrations run in filename order, including the timestamped migrations after `0100_ingest.sql`.
- `supabase/config.toml` — local Supabase configuration. `db.seed.sql_paths` points to `./seed.sql`; that file exists as a no-op placeholder so `supabase db reset` is self-contained.
- `supabase/archive` — historical `.bak` files preserving superseded bodies of `0019` and `0020`. They are reference artifacts, not part of reset.
- `src/app` — Next.js pages and route handlers.
- `src/lib` — Supabase helpers, canonical Stripe ingest, obligation helpers, and projection helpers.
- `tests` — app/runtime verification, including Stripe-first wedge coverage.
- `fix_dealership_fn.sql` — quarantined legacy out-of-band SQL that still references `ak_kernel`. It is not part of canonical resetability and must not be applied to current kernel databases.

**Project ID:** `autokirk-kernel` | **DB:** PostgreSQL v17 | **API:** 54321 | **DB port:** 54322 | **Studio:** 54323

## Commands

```bash
# Start local Supabase stack
supabase start

# Re-run the full migration chain from scratch
supabase db reset

# Lint the resulting database for broken SQL references
supabase db lint

# Create a new migration file
supabase migration new <name>

# Push migrations to remote (confirm before running)
supabase db push

# Run the app test suite currently checked into this repo
npm test

# Run a single test file directly
npx tsx --test tests/stripe-first-wedge-closure.test.ts

# Run the Next.js dev server
npm run dev

# Type-check and build the app
npm run build

# Lint TypeScript/JS
npm run lint

supabase stop
```

Studio is at http://127.0.0.1:54323 when the local stack is running.

The DB validation contract is now:

1. `supabase db reset` succeeds from repo contents alone
2. `supabase db lint` is clean
3. `npm test` stays green for the checked-in app/runtime path

Reset success alone is not sufficient.

## Migration authority

The live chain currently breaks into these eras:
| File | Purpose |
|------|---------|
| `0001_extensions.sql` | `pgcrypto` extension |
| `0002_schemas.sql` | Schema declarations + `ledger._deny_mutation` + `ledger.sha256_hex` |
| `0003_identity.sql` | `core` tables (tenants, workspaces, departments, operators, memberships) + identity helpers |
| `0004_registry.sql` | `registry` catalogues (event_types, receipt_types) + kernel seed rows |
| `0005_ledger.sql` | `ledger` tables (chain_heads, events, receipt_heads, receipts) + chaining triggers |
| `0006_api.sql` | `api.append_event` + `api.emit_receipt` SECURITY DEFINER RPCs |
| `0007_rls.sql` | Full ACL: RLS enables, policies, REVOKE ALL, GRANT SELECT, REVOKE/GRANT EXECUTE |
| `0008_intelligence.sql` | `knowledge` schema: findings, recommendations, simulations, memory patterns |
| `0009_knowledge_refine.sql` | Consolidated evidence_refs, FTS indexes, materialized views, archival functions |
| `0010_schema_reserve.sql` | Reserve `governance`, `receipts`, `signals` schemas |
| `0011_registry_stripe.sql` | Stripe event type seed rows (18 types) |
| `0012_core_provider_connections.sql` | `core.provider_connections` workspace-to-provider trust anchor |
| `0013_ingest_stripe.sql` | `ingest.stripe_events` append-only envelope storage |
| `0014_api_stripe_ingest.sql` | `api.ingest_stripe_event` SECURITY DEFINER RPC |
| `0015_stripe_acl_rls.sql` | ACL hardening for Stripe objects |
| `0016_membership_tenure.sql` | Tenure fields: `active_from`, `active_to`, `status` on memberships |
| `0017_workspace_settings.sql` | `core.workspace_settings` key/value config table |
| `0018_washbay_jobs.sql` | `core.washbay_jobs` job board persistence (deprecated; superseded by core.jobs) |
| `0019_core_grants_and_operator_views.sql` | Service role grants + skeleton views (`v_receipts`, `v_next_actions`) |
| `0020_obligations_and_receipts.sql` | `core.obligations` + `core.receipts` business-layer tables |
| `0021_grant_authenticated_schema_usage.sql` | Fix: `GRANT USAGE ON SCHEMA core` to `authenticated` |
| `0022_obligation_idempotency.sql` | `UNIQUE (idempotency_key)` partial index on obligations |
| `0023_core_jobs.sql` | `core.jobs` projection table (write-protected, event-sourced view) |
| `0024_extend_obligations_for_jobs.sql` | Job-domain columns on obligations (job_id, obligation_type, trigger/satisfaction FKs) |
| `0025_api_washbay.sql` | Washbay API: full job lifecycle RPCs |
| `0026_v_job_summary.sql` | `core.v_job_summary` flattened view with derived metrics |
| `0027_registry_job_domain.sql` | Job domain event/receipt type seed rows |
| `0100_ingest.sql` | `ingest.raw_events` + `ingest.trusted_events` staging tables + ACL |
| `20260307223333_governance_rule_sets.sql` | `governance.rule_sets` + `governance.rule_versions` catalogues |
| `20260307223659_signals_runtime.sql` | `signals` runtime: detectors, bindings, runs, signal_instances |
| `20260307224145_signals_indexes.sql` | Additional signals indexes |
| `20260307224404_api_run_signal_detector.sql` | `api.run_signal_detector` SECURITY DEFINER RPC |

`fix_dealership_fn.sql` in the repo root is a **deprecated** out-of-band fixup script for an external `dealership` schema referencing the legacy `ak_kernel` name. Do **not** apply it — the referenced tables no longer exist.

- `0001`–`0007` — kernel bootstrap: extensions, schemas, identity, registry, ledger, canonical API write surface, and baseline ACL/RLS
- `0008`–`0031` — knowledge, Stripe ingest, jobs/obligations, economic refs, and tenant hierarchy work
- `0100` — append-only ingest staging
- `20260307...` onward — governance and signals runtime, founder-console object/obligation pivot, canonical Stripe/service-role changes, projection rebuilds, receipt linking, and stripe-first wedge closure views

Important authority notes:

- The current files in `supabase/migrations` are the canonical reset chain.
- `0019_core_grants_and_operator_views.sql` and `0020_obligations_and_receipts.sql` were rewritten in place earlier in the repo's life; `supabase/archive/*.bak` preserves older bodies for audit, not execution.
- `20260314161901_rebuild_core_for_founder_console.sql` is the major structural pivot in the chain. It drops and recreates `core.objects`, `core.obligations`, related vocabulary tables, and compatibility views.

## Canonical live DB surfaces

## Architecture

### Multi-tenancy model

`core.tenants` → `core.workspaces` → `core.departments`. `core.operators` are users (soft-linked to `auth.users` via `auth_uid`). `core.memberships` controls workspace access and tenure. Workspace membership remains the main read/write guard for live operator surfaces.

### Hash-chained append-only ledger

`ledger.events` and `ledger.receipts` are immutable chains. `ledger._events_before_insert` and `ledger._receipts_before_insert` assign `seq`, `prev_hash`, and `hash` while advancing mutable head pointers under lock. `_deny_mutation` blocks direct UPDATE/DELETE on append-only tables.
```
core.tenants (id, slug, name)
  └── core.workspaces (id, tenant_id, slug, name)
        ├── core.departments (id, workspace_id, slug, name)
        └── core.memberships (id, operator_id, workspace_id, role, status, active_from, active_to)
              └── core.operators (id, auth_uid, handle)
```

Roles: `owner / admin / member / viewer`.

**Membership tenure** (0016): `status ∈ {active, suspended, revoked, expired}`. Validity window: `active_from ≤ now()` AND `(active_to IS NULL OR active_to > now())`. All RLS policies that call `core.is_member()` inherit this enforcement.

### Hash-chained append-only ledger

`ledger.events` and `ledger.receipts` are immutable chains. Each row is assigned `seq`, `prev_hash`, and `hash` by a BEFORE INSERT trigger.

**Hash formula:** `sha256(prev_hash || seq || workspace_id || chain_key || event_type_id || payload)`

- The trigger locks `ledger.chain_heads` / `ledger.receipt_heads` with `FOR UPDATE` for atomicity.
- `ledger._deny_mutation()` trigger blocks UPDATE/DELETE on all append-only tables.
- Idempotency is workspace-scoped: duplicate `idempotency_key` within the same workspace is silently suppressed (trigger returns early, INSERT never fires).
- Both tables have `UNIQUE (workspace_id, chain_key, seq)` to prevent seq reuse.

### Founder-console obligation model

The active obligation surface is the post-rebuild `core.objects` + `core.obligations` model introduced and then fixed in the March 2026 founder-console migrations. Later migrations restore operator projections and add receipt-proof linkage on top of that model.

### App-layer architecture

The Next.js app lives in `src/app/` and communicates with Supabase exclusively through three client helpers:
- `src/lib/supabase-server.ts` — SSR cookie-based client for route handlers and server components
- `src/lib/supabaseBrowser.ts` — browser client
- `src/lib/supabaseAdmin.ts` — service-role client (bypasses RLS; use only for trusted server paths)

Every authenticated route handler starts with `requireOperatorRouteContext()` (`src/lib/operator-access.ts`). It resolves the auth session → `core.operators` record → active `core.memberships` and returns a typed context including `defaultWorkspaceId`. Do not inline this auth logic; always use this helper.

The Stripe ingest pipeline flows: Stripe webhook → `api.ingest_stripe_event` (DB function) → `core.objects` + `core.obligations` rows. The app layer then reads open obligations and routes operator actions through `sealObligation()` (`src/lib/obligation-store.ts`), which calls `api.command_resolve_obligation` and produces a ledger event + receipt pair.

`src/lib/kernel/rules.ts` is the typed constraint layer (`CLASS_RULES`). Every `kernel_class` (e.g. `invoice`, `payment`, `operator_access_subscription`) declares exactly which `economic_posture` values and `obligation_type` values are valid. Both DB functions and app code must respect these constraints; `assertValidClassPosture` / `assertValidObligationForClass` are the enforcement helpers.

`src/lib/stripe_first_wedge_contract.ts` maps Stripe event types to obligation types. `src/lib/stripe_first_wedge_closure.ts` defines which legacy routes/surfaces have been retired. The test in `tests/stripe-first-wedge-closure.test.ts` enforces both: it verifies that the contract covers all supported event types and that dead files have been physically deleted from the repo. When adding Stripe event support, update the contract file first.

The `/command` surface (`src/app/command/`) is the live operator console. It reads from `core.v_operator_next_actions` and posts to `/api/command/seal` (or `/api/command/touch`) to advance obligations. The `/command/integrity` and `/command/receipts` pages pull from integrity summary views and `core.v_recent_receipts`.

### Known drift / caution

- Broad placeholder RLS still exists in `knowledge`, `governance`, and `signals`; those surfaces remain audit-sensitive.
- Legacy `ak_*` naming survives in comments, indexes, triggers, and policy names inside `0008_intelligence.sql`. Treat those as drift, not doctrine.
- `fix_dealership_fn.sql` is historical contamination, not a valid current kernel extension point.
- Do not resurrect archived washbay RPC assumptions without reviewing the founder-console rebuild, receipt linker, and current projection migrations together.
