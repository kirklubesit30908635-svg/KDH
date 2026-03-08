# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A pure PostgreSQL/Supabase kernel — no application code, only SQL migrations. Everything is schema, tables, triggers, RLS policies, and SECURITY DEFINER functions deployed via the Supabase CLI.

## Commands

```bash
# Start local Supabase stack (Postgres :54322, API :54321, Studio :54323)
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
| `0004_registry.sql` | `registry` catalogues (event_types, receipt_types) + seed rows |
| `0005_ledger.sql` | `ledger` tables (chain_heads, events, receipt_heads, receipts) + chaining triggers |
| `0006_api.sql` | `api.append_event` + `api.emit_receipt` SECURITY DEFINER RPCs |
| `0007_rls.sql` | Full ACL: RLS enables, policies, REVOKE ALL, GRANT SELECT, REVOKE/GRANT EXECUTE |
| `0008_intelligence.sql` | `ak_intelligence` schema (see below) |
| `0100_ingest.sql` | `ingest.raw_events` + `ingest.trusted_events` staging tables + their own ACL |

`fix_dealership_fn.sql` in the repo root is an out-of-band fixup script for an external `dealership` schema that references a legacy `ak_kernel` schema name. It is **not** a numbered migration and must be applied manually when needed.

## Schema Doctrine

Kernel schemas must be institutional and product-agnostic. Allowed schemas:

```
core, governance, receipts, signals, knowledge, api, ingest, ledger, registry
```

Product-prefixed schemas are forbidden in the kernel (e.g. `ak_*`, `autokirk_*`). Vertical/industry faces may introduce their own schemas (e.g. `marine`, `dealership`, `service`), but the kernel itself must remain neutral.


## Architecture

### Multi-tenancy model

`core.tenants` → `core.workspaces` → `core.departments`. All data is workspace-scoped. `core.operators` are users (soft-linked to `auth.users` via `auth_uid`). `core.memberships` maps operators to workspaces with a role (`owner/admin/member/viewer`).

### Hash-chained append-only ledger

`ledger.events` and `ledger.receipts` are immutable chains. Each row is assigned `seq`, `prev_hash`, and `hash` by a BEFORE INSERT trigger (`ledger._events_before_insert` / `ledger._receipts_before_insert`). The trigger also advances the mutable head pointer (`ledger.chain_heads` / `ledger.receipt_heads`) under a `FOR UPDATE` lock for atomicity. A separate `_deny_mutation` trigger blocks UPDATE/DELETE on all append-only tables. Idempotency is workspace-scoped: duplicate `idempotency_key` within the same workspace is silently suppressed.

### Write surface: SECURITY DEFINER RPCs only

No client role (`anon`, `authenticated`) may write directly to any kernel table. All writes go through:
- `api.append_event(workspace_id, chain_key, event_type, payload, idempotency_key)` — sole write path to `ledger.events`
- `api.emit_receipt(workspace_id, event_id, chain_key, receipt_type, payload)` — sole write path to `ledger.receipts`

Both functions call `core.assert_member()` first to enforce workspace membership.

### ACL model (0007_rls.sql)

- `REVOKE ALL` on every kernel table from `anon` and `authenticated`.
- Selective `GRANT SELECT` re-opened on `ledger.events`, `ledger.receipts`, `core.operators`, `core.memberships`, and both registry catalogues — required so RLS USING clauses can evaluate.
- RLS policies on every table. Ledger read policies use `core.is_member(workspace_id)`. Identity read policies use `auth.uid()` self-checks.
- Internal functions (`_deny_mutation`, `_events_before_insert`, `_receipts_before_insert`, `sha256_hex`, `assert_member`) have `REVOKE EXECUTE FROM PUBLIC`. Only `core.current_operator_id()` and `core.is_member()` are re-granted to `authenticated` (needed inside RLS expressions).

### Intelligence layer (knowledge)

`0008_intelligence.sql` implements a governed AI subsystem. Doctrine: **AI may observe, interpret, simulate, and propose — it may not directly mutate domain reality.**

Key tables:
- `findings` — evidence-backed claims produced by detectors
- `recommendations` — proposal drafts authored by AI (not mutations; feed into the normal proposal/approval path)
- `simulation_runs` — counterfactual/forecast outputs
- `memory_patterns` — institutional memory distilled from repeated findings
- `outcome_comparisons` — expected vs actual learning loop
- `review_actions` — human interaction trail
- `founder_briefs` — cross-face strategic summaries

All `ak_intelligence` RLS policies currently use `USING (true)` — they are placeholders to be replaced with proper tenant-membership checks.

### Ingest pipeline

`ingest.raw_events` receives all inbound events from any source. Validated/classified events are promoted to `ingest.trusted_events`. Both tables are append-only with `_deny_mutation` triggers. No authenticated read path exists; these are internal pipeline tables only.
