# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

**autokirk-kernel** is a multi-tenant, event-driven PostgreSQL/Supabase kernel paired with a Next.js application layer. The kernel consists entirely of SQL migrations — schema, tables, triggers, RLS policies, and SECURITY DEFINER functions deployed via the Supabase CLI. The Next.js layer (React 19 + TypeScript) provides API routes and UI that consume the kernel via the Supabase JS SDK.

## Commands

```bash
# Start local Supabase stack
supabase start           # Postgres :54322, API :54321, Studio :54323

# Re-run all migrations from scratch + apply seed.sql
supabase db reset

# Create a new numbered migration file
supabase migration new <name>

# Push migrations to remote (confirm before running)
supabase db push

supabase stop
```

```bash
# Next.js development
npm run dev              # Local dev server
npm run build            # Production build
npm run lint             # ESLint check
```

Studio is at http://127.0.0.1:54323 when the local stack is running.

**Testing:** There are no automated test commands. Correctness is validated by running `supabase db reset` and verifying all migrations apply cleanly. For the app layer, test via the Studio UI or hitting API routes directly.

---

## Migration file order

Migrations run in filename order. The full current sequence (41 files):

### Foundation (0001–0031)

| File | Purpose |
|------|---------|
| `0001_extensions.sql` | `pgcrypto` extension |
| `0002_schemas.sql` | Schema declarations + `ledger._deny_mutation` + `ledger.sha256_hex` |
| `0003_identity.sql` | `core` tables (tenants, workspaces, departments, operators, memberships) + identity helpers |
| `0004_registry.sql` | `registry` catalogues (event_types, receipt_types) + seed rows |
| `0005_ledger.sql` | `ledger` tables (chain_heads, events, receipt_heads, receipts) + chaining triggers |
| `0006_api.sql` | `api.append_event` + `api.emit_receipt` SECURITY DEFINER RPCs |
| `0007_rls.sql` | Full ACL: RLS enables, policies, REVOKE ALL, GRANT SELECT, REVOKE/GRANT EXECUTE |
| `0008_intelligence.sql` | `knowledge` schema — AI subsystem (findings, recommendations, simulations, memory) |
| `0009_knowledge_refine.sql` | Unified `knowledge.evidence_refs` table + full-text search indexes |
| `0010_schema_reserve.sql` | Reserve `governance`, `receipts`, `signals` schemas |
| `0011_registry_stripe.sql` | Stripe event types (18 types: payment_intent, invoice, subscription, etc.) |
| `0012_core_provider_connections.sql` | `core.provider_connections` — workspace-to-provider-account bindings |
| `0013_ingest_stripe.sql` | `ingest.stripe_events` — append-only Stripe webhook envelope storage |
| `0014_api_stripe_ingest.sql` | `api.ingest_stripe_event()` SECURITY DEFINER RPC |
| `0015_stripe_acl_rls.sql` | Stripe ACL hardening (RLS + GRANT pass) |
| `0016_membership_tenure.sql` | Temporal access windows on memberships (active_from, active_to, status) |
| `0017_workspace_settings.sql` | `core.workspace_settings` key-value config + `api.get_workspace_setting()` |
| `0018_washbay_jobs.sql` | `core.washbay_jobs` — service/job board (replaces JSON file store) |
| `0019_core_grants_and_operator_views.sql` | Service-role grants + skeleton views (v_receipts, v_next_actions) |
| `0020_obligations_and_receipts.sql` | `core.obligations` + `core.receipts` + final views |
| `0021_grant_authenticated_schema_usage.sql` | Fix: USAGE grant for `authenticated` on all kernel schemas |
| `0022_obligation_idempotency.sql` | `idempotency_key` on obligations (prevents webhook duplicates) |
| `0023_core_jobs.sql` | `core.jobs` — projection-level, read-optimised job record |
| `0024_extend_obligations_for_jobs.sql` | Job-domain columns on obligations (job_id, obligation_type, trigger_event_id) |
| `0025_api_washbay.sql` | Job-domain API RPCs: `api.create_job()` + internal helpers |
| `0026_v_job_summary.sql` | `core.v_job_summary` — flattened projection view (variance, leakage flag, cycle time) |
| `0027_registry_job_domain.sql` | Job lifecycle + commercial + accountability + forecast event taxonomy |
| `0028_add_economic_object_governance.sql` | `core.economic_refs` + `api.resolve_economic_ref()` — kernel economic reference authority |
| `0029_wire_stripe_ingest_to_economic_refs.sql` | Wire Stripe charge IDs to `core.economic_refs` |
| `0030_add_stripe_to_operators.sql` | Stripe subscription tracking on operators (customer_id, subscription_id, status) |
| `0031_tenant_hierarchy.sql` | `parent_tenant_id` on tenants + KDH/AutoKirk seed hierarchy + founder memberships |

### Ingest Pipeline

| File | Purpose |
|------|---------|
| `0100_ingest.sql` | `ingest.raw_events` + `ingest.trusted_events` staging tables + ACL |

### Governance & Signals (timestamp-named)

| File | Purpose |
|------|---------|
| `20260307223333_governance_rule_sets.sql` | `governance.rule_sets` + `governance.rule_versions` (requires `pg_jsonschema`) |
| `20260307223659_signals_runtime.sql` | `signals.detectors`, `signals.detector_bindings`, `signals.runs`, `signals.signal_instances` (requires `btree_gist`) |
| `20260307224145_signals_indexes.sql` | Performance indexes for signals (workspace+time, priority queue scan) |
| `20260307224404_api_run_signal_detector.sql` | `api.run_signal_detector()` — SECURITY DEFINER detector invocation RPC |
| `20260309000001_osm_location_field.sql` | Location columns on obligations + washbay_jobs; rebuilds v_next_actions |

### Founder Console (timestamp-named)

| File | Purpose |
|------|---------|
| `20260314040923_kernel_constitution_v1.sql` | Vocab tables (object_class_postures, reason_codes), `core.objects`, V2 obligations + ledger |
| `20260314043133_kernel_rpc_mutations_v1.sql` | `api.acknowledge_object()`, `api.open_obligation()`, `api.resolve_obligation()` |
| `20260314060000_founder_console_grants.sql` | EXECUTE/SELECT grants for founder RPCs + seeds object_class_postures |
| `20260314070000_founder_rpc_no_ledger.sql` | Patch: remove ledger.events writes from founder RPCs (schema conflict fix) |
| `20260314161901_rebuild_core_for_founder_console.sql` | Final rebuild: drops/recreates vocab, objects, obligations; consolidates RLS + grants |

**Note:** `fix_dealership_fn.sql` in the repo root is an out-of-band fixup for an external `dealership` schema that references the legacy `ak_kernel` name. It is **not** a numbered migration; apply manually when needed.

---

## Schema Doctrine

Kernel schemas must be institutional and product-agnostic. Allowed schemas:

```
core, governance, receipts, signals, knowledge, api, ingest, ledger, registry
```

Product-prefixed schemas are forbidden in the kernel (e.g. `ak_*`, `autokirk_*`). Vertical/industry faces may introduce their own schemas (e.g. `marine`, `dealership`, `service`), but the kernel itself must remain neutral.

---

## Architecture

### Multi-tenancy model

`core.tenants` (with optional `parent_tenant_id`) → `core.workspaces` → `core.departments`. All data is workspace-scoped. `core.operators` are users (soft-linked to `auth.users` via `auth_uid`). `core.memberships` maps operators to workspaces with a role (`owner/admin/member/viewer`) and enforces temporal tenure windows (`active_from`, `active_to`, status: `active/suspended/revoked/expired`).

Seeded hierarchy: KDH root tenant → AutoKirk IP Holdings + AutoKirk Systems → kdh-ops and ak-ops workspaces with founder membership.

### Hash-chained append-only ledger

`ledger.events` and `ledger.receipts` are immutable chains. Each row is assigned `seq`, `prev_hash`, and `hash` by a BEFORE INSERT trigger (`ledger._events_before_insert` / `ledger._receipts_before_insert`). The hash is computed as `sha256_hex(prev_hash || seq || workspace_id || chain_key || event_type_id || payload)`. The trigger also advances the mutable head pointer (`ledger.chain_heads` / `ledger.receipt_heads`) under a `FOR UPDATE` lock for atomicity. A separate `_deny_mutation` trigger blocks UPDATE/DELETE on all append-only tables. Idempotency is workspace-scoped: duplicate `idempotency_key` within the same workspace is silently suppressed.

### Write surface: SECURITY DEFINER RPCs only

No client role (`anon`, `authenticated`) may write directly to any kernel table. All writes go through SECURITY DEFINER functions in the `api` schema:

| Function | Purpose |
|----------|---------|
| `api.append_event(workspace_id, chain_key, event_type, payload, idempotency_key)` | Sole write path to `ledger.events` |
| `api.emit_receipt(workspace_id, event_id, chain_key, receipt_type, payload)` | Sole write path to `ledger.receipts` |
| `api.ingest_stripe_event(...)` | Stripe webhook → provider lookup → idempotency → append_event → emit_receipt |
| `api.create_job(...)` | Creates job, appends event, opens obligations |
| `api.resolve_economic_ref(...)` | Create/update entries in `core.economic_refs` |
| `api.run_signal_detector(binding_id, mode, ...)` | Invoke a signal detector, record run, upsert signal instances |
| `api.acknowledge_object(...)` | Create a `core.objects` record (founder console) |
| `api.open_obligation(...)` | Create an obligation tied to an object (founder console) |
| `api.resolve_obligation(...)` | Mark an obligation resolved with terminal action (founder console) |

All functions call `core.assert_member()` first to enforce workspace membership.

### ACL model

- `REVOKE ALL` on every kernel table from `anon` and `authenticated`.
- Selective `GRANT SELECT` re-opened on `ledger.events`, `ledger.receipts`, `core.operators`, `core.memberships`, registry catalogues — required so RLS USING clauses can evaluate.
- RLS policies on every table. Ledger read policies use `core.is_member(workspace_id)`. Identity read policies use `auth.uid()` self-checks.
- Internal functions (`_deny_mutation`, `_events_before_insert`, `_receipts_before_insert`, `sha256_hex`, `assert_member`) have `REVOKE EXECUTE FROM PUBLIC`. Only `core.current_operator_id()` and `core.is_member()` are re-granted to `authenticated` (needed inside RLS expressions).
- `service_role` has full access to `core` schema tables.

### Intelligence layer (knowledge schema)

`0008_intelligence.sql` + `0009_knowledge_refine.sql` implement a governed AI subsystem. **Doctrine: AI may observe, interpret, simulate, and propose — it may not directly mutate domain reality.**

Key tables:
- `knowledge.findings` — evidence-backed claims produced by detectors
- `knowledge.recommendations` — proposal drafts authored by AI (feed into normal proposal/approval path, not mutations)
- `knowledge.simulation_runs` — counterfactual/forecast outputs
- `knowledge.memory_patterns` — institutional memory distilled from repeated findings
- `knowledge.outcome_comparisons` — expected vs actual learning loop
- `knowledge.review_actions` — human interaction trail
- `knowledge.founder_briefs` — cross-face strategic summaries
- `knowledge.evidence_refs` — unified evidence reference table (replaces 5 separate tables)

All `knowledge` RLS policies currently use `USING (true)` — placeholders to replace with proper tenant-membership checks.

### Governance & rule versioning

`governance.rule_sets` is a named catalogue with a JSON Schema (enforced by `pg_jsonschema`). `governance.rule_versions` provides versioned rule definitions with states: `draft/approved/retired`. Domains: `signals`, `obligations`, `pricing`, `collections`.

### Signal detection

`signals.detectors` catalogs runnable detectors, each with an `implementation_ref` pointing to a SQL function returning `signals.detector_candidate[]`. `signals.detector_bindings` activates a detector for a workspace under a specific rule version, with time-windowed, no-overlap exclusion constraint (enforced via `btree_gist`). `signals.runs` records execution history. `signals.signal_instances` stores machine-detected condition instances.

`api.run_signal_detector(binding_id, mode, ...)` is the SECURITY DEFINER entry point. Flow: load binding → membership check → idempotency → dispatch to implementation_ref → upsert signal instances. Supports modes: `event_driven`, `scheduled`, `replay`, `backfill`.

### Economic reference authority

`core.economic_refs` is the kernel-owned reference table for external objects (e.g. Stripe charges, invoices). States: `open/active/sealed/breached/canceled/superseded/abandoned`. Stripe charge IDs are wired to this table via `api.ingest_stripe_event()`. Both `core.obligations` and `core.receipts` carry `economic_ref_id` FKs.

### Founder console

Schema: `core.objects`, `core.object_class_postures`, `core.reason_codes`.

`core.objects` tracks acknowledged economic objects with `kernel_class` and `economic_posture`. Obligations and receipts are tied to objects. The founder console API routes (`/api/founder/*`) drive the machine-health, machine-state, and obligation lifecycle flows via the three founder RPCs.

Posture matrix seeds: `lead`, `invoice`, `job`, `campaign`, `inspection`, `payment`.

### Ingest pipeline

`ingest.raw_events` receives all inbound events. Validated/classified events are promoted to `ingest.trusted_events`. Both tables are append-only with `_deny_mutation` triggers. No authenticated read path — internal pipeline only.

### External integrations

**Stripe:** Provider connections stored in `core.provider_connections`. Stripe events ingested via `api.ingest_stripe_event()` with workspace-scoped idempotency. Stripe webhooks handled in `/api/stripe/webhook`. Operators carry `stripe_customer_id`, `stripe_subscription_id`, `subscription_status`. Stripe event types registered in `registry.event_types` (18 types).

---

## Application layer

### Stack

- **Framework:** Next.js with React 19 and TypeScript
- **Backend:** Supabase JS SDK (`@supabase/ssr`, `@supabase/supabase-js`)
- **Payments:** Stripe
- **UI:** Tailwind CSS, Framer Motion, Lucide icons

### Supabase clients

| Module | Purpose |
|--------|---------|
| `src/lib/supabase/supabaseBrowser.ts` | Browser-side client (uses `createBrowserClient`) |
| `src/lib/supabase-server.ts` | Server-side client (uses `createServerClient`, reads cookies) |
| `src/lib/supabaseAdmin.ts` | Admin client with service role key (bypasses RLS) |
| `src/lib/founder-console/server.ts` | Founder-console-specific server client (`getFounderSupabase`) |

### API routes

| Route | Purpose |
|-------|---------|
| `POST /api/command/feed` | Feed events to the kernel ledger |
| `POST /api/command/seal` | Seal a chain |
| `POST /api/command/touch` | Touch/update an event |
| `GET /api/receipts/feed` | Read receipts feed |
| `GET /api/billing-ops/feed` | Billing operations feed |
| `GET /api/billing-ops/stats` | Billing stats |
| `POST /api/billing-ops/seal` | Seal billing operation |
| `GET /api/washbay` | List washbay jobs |
| `POST /api/washbay` | Create washbay job |
| `PATCH /api/washbay/[id]` | Update washbay job |
| `GET /api/users/feed` | List users/operators |
| `POST /api/users/assign` | Assign operator to workspace |
| `GET /api/users/workspace` | Get workspace users |
| `GET /api/founder/machine-health` | Founder console health check |
| `GET /api/founder/machine-state` | Current machine state |
| `POST /api/founder/acknowledge-object` | Acknowledge an economic object |
| `POST /api/founder/open-obligation` | Open an obligation |
| `POST /api/founder/resolve-obligation` | Resolve an obligation |
| `POST /api/stripe/webhook` | Stripe webhook handler |
| `POST /api/stripe/checkout` | Create Stripe checkout session |
| `POST /api/stripe/portal` | Create Stripe billing portal session |
| `GET /api/integrity/stats` | Ledger integrity stats |
| `GET /api/system-state` | Overall system state |
| `GET /api/access/tenant` | Tenant access check |
| `GET /api/advertising/feed` | Advertising feed |
| `GET /api/spine-test` | Kernel spine health test |

### Key library modules

| Module | Purpose |
|--------|---------|
| `src/lib/kernel/rules.ts` | Kernel business rules and invariants |
| `src/lib/obligation-store.ts` | Client-side obligation state management |
| `src/lib/washbay-store.ts` | Client-side washbay job state management |
| `src/lib/stripe-obligations.ts` | Stripe → obligation mapping logic |
| `src/lib/ui-models.ts` | Shared UI data models |
| `src/lib/ui-fmt.ts` | UI formatting utilities |
| `src/lib/founder-console/types.ts` | Founder console TypeScript types |
| `src/lib/founder-console/context.ts` | Founder console React context |

---

## Key design patterns

1. **Workspace scoping** — All data is workspace-scoped; RLS enforces membership gates at the DB level.
2. **Idempotency keys** — Workspace-scoped keys prevent webhook/retry duplicates silently.
3. **Economic references** — `core.economic_refs` is the kernel-owned source of truth for external object IDs (Stripe charges, invoices, etc.).
4. **Object/obligation lifecycle** — Acknowledge object → open obligations → resolve with terminal action.
5. **Event types registry** — All event names are pre-registered in `registry.event_types`; unknown types are rejected at append time.
6. **Projection views** — Flattened, indexed read surfaces: `core.v_job_summary`, `core.v_next_actions`, `core.v_receipts`.
7. **Tenure windows** — Time-bound access control on memberships with status lifecycle.
8. **Append-only immutability** — `_deny_mutation` trigger + hash-chaining on all ledger tables.
9. **SECURITY DEFINER boundary** — No raw table writes from clients; all mutations are RPC-mediated.

---

## Development conventions

### Adding migrations

- **Sequential (0NNN_name.sql):** For foundational kernel changes. Pick the next number.
- **Timestamp (YYYYMMDDHHMMSS_name.sql):** For feature-layer additions (governance, signals, founder console). Use `supabase migration new <name>`.
- Always test with `supabase db reset` before committing.
- Never rename or reorder existing migration files — Supabase tracks applied migrations by filename.

### ACL checklist for new tables

When adding a new kernel table, follow this checklist:
1. `REVOKE ALL ON <table> FROM anon, authenticated;`
2. `ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;`
3. Add RLS policies (typically `core.is_member(workspace_id)` for reads)
4. `GRANT SELECT ON <table> TO authenticated;` only if clients need to read directly
5. If append-only, add `ledger._deny_mutation()` as a BEFORE UPDATE OR DELETE trigger

### Adding new event types

Register in `registry.event_types` with a `family` and `code` before calling `api.append_event()` with that type. Stripe types use the `stripe.*` family.

### Founder console changes

The founder console schema was rebuilt in `20260314161901_rebuild_core_for_founder_console.sql`. If extending `core.objects` or `core.obligations`, prefer new migration files that `ALTER TABLE` rather than replacing the rebuild migration.

### Avoiding common pitfalls

- **Schema conflicts:** `ledger.events` in the kernel has a specific schema; the founder console patches removed direct writes to it from founder RPCs to avoid conflicts.
- **RLS bypass:** Use `supabaseAdmin` (service role) only from trusted server-side code. Never expose the service role key to the browser.
- **Chain head locking:** `ledger.chain_heads` uses `FOR UPDATE` during insert triggers — avoid long-running transactions that hold this lock.
- **`ak_intelligence` reference:** The old schema name is `ak_intelligence` in migration 0008; it was renamed to `knowledge` conceptually but check actual schema names in older migrations.
