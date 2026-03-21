# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

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

## Commands

```bash
# Start local Supabase stack (Postgres :54322, API :54321, Studio :54323)
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

- `0001`–`0007` — kernel bootstrap: extensions, schemas, identity, registry, ledger, canonical API write surface, and baseline ACL/RLS
- `0008`–`0031` — knowledge, Stripe ingest, jobs/obligations, economic refs, and tenant hierarchy work
- `0100` — append-only ingest staging
- `20260307...` onward — governance and signals runtime, founder-console object/obligation pivot, canonical Stripe/service-role changes, projection rebuilds, receipt linking, and stripe-first wedge closure views

Important authority notes:

- The current files in `supabase/migrations` are the canonical reset chain.
- `0019_core_grants_and_operator_views.sql` and `0020_obligations_and_receipts.sql` were rewritten in place earlier in the repo's life; `supabase/archive/*.bak` preserves older bodies for audit, not execution.
- `20260314161901_rebuild_core_for_founder_console.sql` is the major structural pivot in the chain. It drops and recreates `core.objects`, `core.obligations`, related vocabulary tables, and compatibility views.

## Canonical live DB surfaces

- `api.append_event(...)` and `api.emit_receipt(...)` remain the canonical ledger writers.
- Canonical Stripe ingest is `api.ingest_stripe_event(text, text, text, boolean, text, timestamptz, jsonb)`.
- Governed operator mutations use `api.command_touch_obligation(...)` and `api.command_resolve_obligation(...)`.
- Receipt proof reconciliation uses `api.reconcile_obligation_proof(...)` and `api.link_receipt_to_obligation(...)`.
- Operator-facing reads come from `core.v_operator_next_actions`, `core.v_recent_receipts`, `core.v_stripe_first_wedge_integrity_summary`, and compatibility aliases in `core`.

## Architecture

### Multi-tenancy model

`core.tenants` → `core.workspaces` → `core.departments`. `core.operators` are users (soft-linked to `auth.users` via `auth_uid`). `core.memberships` controls workspace access and tenure. Workspace membership remains the main read/write guard for live operator surfaces.

### Hash-chained append-only ledger

`ledger.events` and `ledger.receipts` are immutable chains. `ledger._events_before_insert` and `ledger._receipts_before_insert` assign `seq`, `prev_hash`, and `hash` while advancing mutable head pointers under lock. `_deny_mutation` blocks direct UPDATE/DELETE on append-only tables.

### Founder-console obligation model

The active obligation surface is the post-rebuild `core.objects` + `core.obligations` model introduced and then fixed in the March 2026 founder-console migrations. Later migrations restore operator projections and add receipt-proof linkage on top of that model.

### Known drift / caution

- Broad placeholder RLS still exists in `knowledge`, `governance`, and `signals`; those surfaces remain audit-sensitive.
- Legacy `ak_*` naming survives in comments, indexes, triggers, and policy names inside `0008_intelligence.sql`. Treat those as drift, not doctrine.
- `fix_dealership_fn.sql` is historical contamination, not a valid current kernel extension point.
- Do not resurrect archived washbay RPC assumptions without reviewing the founder-console rebuild, receipt linker, and current projection migrations together.
