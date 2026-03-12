# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A pure PostgreSQL/Supabase kernel — no application code, only SQL migrations. Everything is schema, tables, triggers, RLS policies, and SECURITY DEFINER functions deployed via the Supabase CLI.

**Project ID:** `autokirk-kernel` | **DB:** PostgreSQL v17 | **API:** 54321 | **DB port:** 54322 | **Studio:** 54323

## Commands

```bash
# Start local Supabase stack
supabase start

# Re-run all migrations from scratch + apply seed.sql
supabase db reset

# Create a new numbered migration file
supabase migration new <name>

# Push migrations to remote (confirm before running)
supabase db push

supabase stop
```

Studio is at http://127.0.0.1:54323 when the local stack is running.

There are no test commands — correctness is validated by running `supabase db reset` and verifying migrations apply cleanly.

## Migration file order

Migrations run in filename order. The current sequence:

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

## Schema Doctrine

Kernel schemas must be institutional and product-agnostic. Allowed schemas:

```
core, governance, receipts, signals, knowledge, api, ingest, ledger, registry
```

Product-prefixed schemas are forbidden in the kernel (e.g. `ak_*`, `autokirk_*`). Vertical/industry faces may introduce their own schemas (e.g. `marine`, `dealership`, `service`), but the kernel itself must remain neutral.

## Architecture

### Multi-tenancy model

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

### Write surface: SECURITY DEFINER RPCs only

No client role (`anon`, `authenticated`) may write directly to any kernel table. All writes go through:

- `api.append_event(workspace_id, chain_key, event_type, payload, idempotency_key)` → `ledger.events`
- `api.emit_receipt(workspace_id, event_id, chain_key, receipt_type, payload)` → `ledger.receipts`

Both call `core.assert_member()` first. Both return `(id, seq, hash)`.

### ACL model (0007_rls.sql)

- `REVOKE ALL` on every kernel table from `anon` and `authenticated`.
- Selective `GRANT SELECT` re-opened on: `ledger.events`, `ledger.receipts`, `core.operators`, `core.memberships`, `registry.event_types`, `registry.receipt_types` — required so RLS USING clauses can evaluate.
- RLS policies:
  - Ledger tables: `USING (core.is_member(workspace_id))`
  - `core.operators`: `USING (auth_uid = auth.uid())` (self-read only)
  - `core.memberships`: `USING (operator_id = core.current_operator_id())`
  - Registry catalogues: `USING (true)` (static, public)
- Internal functions (`_deny_mutation`, `_events_before_insert`, `_receipts_before_insert`, `sha256_hex`, `assert_member`) have `REVOKE EXECUTE FROM PUBLIC`. Only `core.current_operator_id()` and `core.is_member()` are re-granted to `authenticated` (needed inside RLS expressions).

### Provider connections & Stripe ingest (0012–0015)

**Trust anchor: `core.provider_connections`**

One row per workspace-to-provider-account binding. `UNIQUE (provider, provider_account_id)` — each Stripe account ID maps to exactly one workspace.

**`api.ingest_stripe_event()` pipeline:**

1. Resolve `provider_connection` by `(provider_account_id, livemode)` — workspace derived from connection, never trusted from caller.
2. `core.assert_member(workspace_id)`
3. Idempotency check: `(provider_connection_id, stripe_event_id)`
4. Validate `stripe_type` against `registry.event_types`
5. INSERT `ingest.stripe_events` (envelope storage, append-only)
6. `api.append_event()` → `ledger.events` (chain_key = stripe_type)
7. `api.emit_receipt()` → `ledger.receipts` (ack)

`ingest.stripe_events` has no authenticated read path — internal pipeline only.

### Job domain: enforceable economic loop (0023–0027)

#### Tables

**`core.jobs`** — Projection table (event-sourced view, write-protected via trigger)

| Column | Notes |
|--------|-------|
| `status` | `created → scheduled → checked_in → started → completed → closed` (also `voided`) |
| `customer_id`, `asset_id`, `operator_id` | Workspace-scoped FKs |
| `quoted_cents`, `addon_cents`, `retail_cents`, `discount_cents` | Pre-invoice amounts |
| `invoice_cents`, `payment_cents` | Financial closure |

**`core.obligations`** — Business-layer action tracking

| Column | Notes |
|--------|-------|
| `status` | `open → sealed / satisfied / cancelled / expired / voided` |
| `obligation_type` | `assign_operator (4hr)`, `confirm_service (8hr)`, `ensure_completion_receipt (12hr)`, `verify_invoice (4hr)`, `verify_payment (24hr)` |
| `trigger_event_id` | FK to `ledger.events` (causality) |
| `satisfied_by_receipt_id` | FK to `ledger.receipts` (proof) |
| `idempotency_key` | `UNIQUE WHERE NOT NULL` |

**`core.receipts`** — Business-layer proof artifacts; bridges `ledger.receipts` → `core.obligations`.

#### API functions (0025_api_washbay.sql)

All SECURITY DEFINER; pattern: assert_member → validate state → append_event → mutate projection → manage obligations → emit_receipt → return status jsonb.

| Function | State Transition | Obligations |
|----------|-----------------|-------------|
| `api.create_job()` | → created | opens assign_operator (4hr) + confirm_service (8hr) |
| `api.assign_operator()` | — | closes assign_operator |
| `api.add_service()` | — | closes confirm_service; updates amounts |
| `api.start_job()` | → started | opens ensure_completion_receipt (12hr) |
| `api.complete_job()` | → completed | closes ensure_completion_receipt; opens verify_invoice (4hr) |
| `api.finalize_invoice()` | — | locks invoice_cents; opens verify_payment (24hr) |
| `api.record_payment()` | → closed | closes economic loop; detects leakage |

**Leakage detection:** `expected = invoice_cents OR (quoted + addon + retail - discount)`. If `payment - expected < 0` → emit `signals:leakage.detected` event.

#### View: `core.v_job_summary` (0026)

Flattened read surface including: `expected_cents`, `variance_cents`, `has_leakage`, `open_obligation_count`, `has_obligation_breach`, `receipt_count`, `age_hours`, `cycle_time_hours`, `days_since_completed`.

### Intelligence layer / knowledge schema (0008–0009)

**Doctrine: AI may observe, interpret, simulate, and propose — it may not directly mutate domain reality.**

| Table | Purpose |
|-------|---------|
| `knowledge.findings` | Evidence-backed claims (severity, confidence, impact_estimate, risk_if_ignored) |
| `knowledge.recommendations` | AI-drafted proposals (requires_approval, emitted_proposal_id) |
| `knowledge.simulation_runs` | Counterfactual/forecast outputs |
| `knowledge.memory_patterns` | Institutional memory distilled from repeated findings |
| `knowledge.outcome_comparisons` | Expected vs actual (learning loop) |
| `knowledge.review_actions` | Human interaction trail |
| `knowledge.founder_briefs` | Cross-face strategic summaries |

**0009 refinements:**
- Consolidated five per-type evidence_refs tables → single `knowledge.evidence_refs` (one parent FK per row via CHECK constraint)
- FTS indexes on `findings (title + summary)` and `recommendations (rationale)`
- Materialized views: `v_open_findings`, `v_ready_recommendations`, `v_learning_loop`
- `proposal_status_history` audit trail for recommendation status transitions
- `findings_archive` for aged-out findings (terminal status, > 1 year old)
- `archive_old_findings()` and `cleanup_old_memory_patterns()` maintenance functions

All `knowledge` RLS policies currently use `USING (true)` — placeholders to be replaced with proper tenant-membership checks.

### Governance & signals runtime (20260307 migrations)

#### `governance.rule_sets` + `governance.rule_versions`

- `rule_sets`: code, name, description, domain ∈ `{signals, obligations, pricing, collections}`, `definition_schema` (JSON Schema validated by `pg_jsonschema`)
- `rule_versions`: version_label, status ∈ `{draft, approved, retired}`, rule_definition, rule_hash

#### Signals system

| Table | Purpose |
|-------|---------|
| `signals.signal_types` | Catalogue of detectable conditions |
| `signals.detectors` | SQL function references; `evaluation_mode ∈ {event_driven, scheduled, hybrid}`; `detection_grain ∈ {event, job, invoice, customer, asset, workspace}` |
| `signals.detector_event_types` | Maps event-driven detectors to triggering `registry.event_types` |
| `signals.detector_bindings` | Activates detector per workspace under approved rule version; `EXCLUDE` constraint prevents overlapping (workspace, detector) bindings |
| `signals.runs` | Execution log; `status ∈ {pending, running, succeeded, failed}`; idempotent |
| `signals.signal_instances` | De-duplicated, lifecycle-managed signals; `lifecycle_status ∈ {open, acknowledged, in_review, resolved, dismissed, superseded}`; `UNIQUE (workspace_id, dedupe_key) WHERE lifecycle_status IN (open, acknowledged, in_review)` |

**`api.run_signal_detector(binding_id, source_event_id?, window?)`:**
1. Validate binding enabled, detector active
2. Invoke `implementation_ref` dynamically (returns `SETOF signals.detector_candidate`)
3. Upsert signal instances: new → INSERT; existing open → UPDATE (reaffirm count, last_seen_at)
4. Idempotent: duplicate run returns prior output summary

### Ingest pipeline (0100_ingest.sql)

Two-stage append-only process:

1. `ingest.raw_events` — all inbound events from any source
2. `ingest.trusted_events` — validated/classified events

Both tables: append-only with `_deny_mutation` trigger, `REVOKE ALL` from anon/authenticated, RLS enabled with no permissive policy (default-deny). No authenticated read path — internal pipeline only.

## Registry catalogues

| Category | Count | Families / Notes |
|----------|-------|-----------------|
| Kernel event types | 26 | system, auth, workflow, task, agent, tool, ingest, ledger, receipt, notification, audit, integration |
| Stripe event types | 18 | payment_intent.*, invoice.*, subscription.*, checkout.session.*, charge.* |
| Job domain event types | 19 | job (8), commercial (9), account (5), forecast (3) — also `signals:leakage.detected` |
| Kernel receipt types | 4 | ack, nack, error, commit |
| Job receipt types | 9 | job_created, job_started, job_completed, service_confirmed, invoice_issued, payment_recorded, obligation_opened, obligation_closed, projection_run |

## Key conventions

1. **Workspace scoping** — Every mutation validates workspace membership via `core.assert_member()`.
2. **Idempotency** — Duplicate keys are suppressed silently; callers may retry safely.
3. **Atomicity** — BEFORE INSERT triggers lock mutable chain heads with `FOR UPDATE`.
4. **Causality** — Ledger events are first-class facts; `core.jobs` and other projections are derived.
5. **No direct writes** — All authenticated writes go through `api.*` SECURITY DEFINER RPCs.
6. **Proof chain** — `core.receipts` ties `ledger.receipts` to business-layer `core.obligations`.
7. **Governance** — Rule sets are versioned and JSON Schema-validated before a binding can be activated.
8. **Intelligence isolation** — The `knowledge` schema observes reality but cannot write to ledger or projection tables.
9. **Tenure enforcement** — Membership status and date windows are checked inside `core.is_member()`, inherited by all RLS.
10. **Schema neutrality** — The kernel never uses product-prefixed schemas; vertical faces extend via their own schemas.
11. **Numbered migrations** — Prefer `NNNN_name.sql` for new kernel migrations. Timestamp-based names (`YYYYMMDDHHMMSS_name.sql`) are used for feature migrations that arrived after the numbered series reached a stable baseline.
