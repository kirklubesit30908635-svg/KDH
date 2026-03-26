# Migration Audit

## Purpose

This document tracks migration integrity issues, recovery actions, and canonicalization decisions for AutoKirk.

The goal is to ensure:
- schema builds cleanly from zero
- migration order is valid
- canonical functions are not duplicated
- replay and idempotency guarantees remain intact
- kernel doctrine matches actual persistence layer behavior

---

## Audit goals

Every migration audit should answer:

1. Does the schema build cleanly from scratch?
2. Are tables created before dependent functions reference them?
3. Are canonical columns present where the doctrine requires them?
4. Are duplicate RPCs or functions present?
5. Do replay and idempotency assumptions survive the full migration chain?
6. Does the final schema match the intended enforcement model?

---

## Current audit focus

Priority areas:

- migration ordering
- `core.objects` availability before dependent logic
- `core.obligations` canonical schema consistency
- `idempotency_key` preservation
- duplicate command RPC definitions
- storage of `economic_ref_id`
- replay/rebuild function correctness

---

## Known risk categories

## 1. Ordering failures
Definition:
A migration references schema that does not yet exist at its position in the chain.

Risk:
- fresh installs fail
- staging/prod drift appears
- local builds become misleading

Mitigation:
- reorder where safe
- split migrations if needed
- move logic to later canonical migration
- avoid dependency on future schema

---

## 2. Duplicate function definitions
Definition:
The same logical command or RPC is defined multiple times in conflicting or stale ways.

Risk:
- unclear canonical behavior
- hidden regressions
- environment mismatch
- difficult debugging

Mitigation:
- identify one canonical implementation
- remove, replace, or clearly supersede stale versions
- document replacement path

---

## 3. Schema doctrine drift
Definition:
The intended product model and final database schema no longer match.

Examples:
- obligation lifecycle expects fields that do not exist
- proof model depends on columns not present
- idempotency doctrine exists in code but not schema

Mitigation:
- canonicalize schema
- move unstable fields into `metadata` only when appropriate
- restore required first-class columns where doctrine depends on them

---

## 4. Rebuild/replay mismatch
Definition:
Replay functions reconstruct state differently than live mutation paths.

Risk:
- inconsistent truth
- integrity corruption
- unreliable founder demo
- loss of trust in system outputs

Mitigation:
- test rebuild against live flows
- use deterministic projection rules
- ensure replay logic reflects canonical semantics

---

## Canonical schema expectations

## `core.objects`
Expected minimum support:
- canonical governed entities
- stable object classing
- source reference mapping
- metadata support
- timestamps

## `core.obligations`
Expected minimum support:
- `id`
- `object_id`
- `obligation_type`
- `state`
- `opened_at`
- `due_at`
- `resolved_at`
- `closed_at`
- `idempotency_key`
- `metadata`

Notes:
- if legacy logic depends on `economic_ref_id` and it is not present as a column, store it in `metadata` unless there is a compelling reason to restore it structurally

## `receipts` or equivalent governed proof table
Expected minimum support:
- linkage to object and obligation
- deterministic hash
- sequence or ordering support
- proof artifact reference
- metadata
- timestamps

---

## Audit checklist

For each migration or affected migration group, verify:

- [x] builds from zero on clean database
- [x] no references to non-existent table/column/function
- [x] no duplicate canonical command RPCs
- [x] `idempotency_key` exists where required
- [ ] proof/receipt model supports closure semantics
- [ ] replay functions remain valid
- [ ] integrity projections still compute from real governed state
- [ ] seed data still works
- [ ] founder demo path still works

---

## Verification snapshot

As of 2026-03-26:

- `supabase db reset --no-seed` completes successfully through `20260326110000_canonicalize_obligation_schema_phase1.sql`
- the final `core.obligations` schema now includes `idempotency_key`, `due_at`, and `closed_at`
- `core.object_class_postures` now includes doctrinal rows for `subscription/direct_revenue` and `operator_access_subscription/direct_revenue` even on no-seed builds
- `supabase db lint` completes with one pre-existing warning on `api.run_signal_detector` dynamic SQL inspection, but no schema-lint failures
- `supabase/seed.sql` has been made idempotent for migration-seeded reference data, but the final seeded reset re-check was interrupted by a local Docker daemon failure before it could be re-run cleanly

---

## Example issue log format

## Issue
Short title

## Type
- ordering
- duplicate function
- schema drift
- replay mismatch
- other

## Affected migrations
- migration names here

## Symptom
What fails or becomes inconsistent?

## Root cause
Why does it happen?

## Decision
What is the canonical fix?

## Action
What should be changed?

## Status
- open
- in progress
- resolved

---

## Current known issues

## Issue
`0033_subscription_obligation_flow.sql` ordering conflict

## Type
ordering / schema drift

## Symptom
Migration logic assumes `core.objects` exists before the founder-console rebuild establishes the canonical object schema.

## Root cause
The migration is numbered before later timestamped migrations that create or reshape the required schema.

## Decision
Do not allow this migration to remain as an early dependency on future schema.
Refactor, move, or replace its safe logic in a later canonical migration.

## Action
- isolate logic that truly belongs after canonical object schema exists
- remove duplicated logic already superseded elsewhere
- preserve only genuinely unique behavior in a valid position

## Status
resolved

---

## Issue
Duplicate obligation command RPC logic

## Type
duplicate function

## Symptom
More than one migration path attempts to define command mutation functions.

## Root cause
Legacy and later migrations both introduce overlapping implementations.

## Decision
Keep one canonical implementation only.

## Action
- canonical command mutations now live in `20260316051500_govern_command_obligation_mutations.sql`
- `0033_subscription_obligation_flow.sql` no longer redefines command RPCs ahead of the founder-era schema rebuild
- later founder-era compatibility RPCs remain as legacy surfaces, but the duplicate command definitions are superseded

## Status
resolved

---

## Issue
`idempotency_key` doctrine drift in obligations schema

## Type
schema drift

## Symptom
Earlier idempotency work may be lost or weakened if the rebuilt obligations schema omits `idempotency_key`.

## Root cause
Table rebuild and later schema evolution are not fully harmonized.

## Decision
Restore `idempotency_key` as a required field in canonical obligations schema.

## Action
- add migration if missing
- backfill safely if needed
- update related functions and tests

## Status
resolved

---

## Issue
`economic_ref_id` storage mismatch

## Type
schema drift

## Symptom
Logic expects a dedicated field that may not exist in final canonical schema.

## Root cause
Historical schema assumptions no longer match rebuilt tables.

## Decision
Store this value in `metadata` unless there is a strong domain reason to restore a dedicated column.

## Action
- fold any drifted `core.obligations.economic_ref_id` column into `metadata`
- keep `economic_ref_id` canonical on obligations as metadata-backed storage
- preserve later query/view logic that already reads `economic_ref_id` from metadata first

## Status
resolved

---

## Recovery strategy

Preferred order:

1. stabilize migration order
2. remove duplicate canonical functions
3. restore required schema fields
4. align receipt/proof model
5. verify replay correctness
6. rebuild seed/demo path
7. add migration smoke tests

---

## Required test outcomes after recovery

- clean database build succeeds
- replay rebuild succeeds
- duplicate event ingestion is harmless
- close-without-proof fails when proof required
- integrity queries return traceable outputs
- founder demo seed runs cleanly

---

## Completion criteria

Migration audit is considered complete when:

- schema builds from zero without manual intervention
- final schema matches kernel doctrine
- there is one canonical command path
- replay works
- integrity works
- seeded demo works
- audit document is updated to resolved state
