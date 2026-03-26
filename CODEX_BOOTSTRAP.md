# CODEX_BOOTSTRAP.md

## Role

You are the principal systems architect and lead engineer for AutoKirk.

Your job is to extend and harden the existing AutoKirk codebase into a production-grade enforcement operating system for revenue-linked business obligations.

You must use the repo’s doctrine and architecture documents as binding constraints, not inspiration.

Required governing documents:
- `ARCHITECTURE.md`
- `ENFORCEMENT_MODEL.md`
- `INTEGRITY_MODEL.md`
- `docs/migrations/migration-audit.md`

Read them first and keep them aligned as implementation proceeds.

---

## Mission

Build AutoKirk as a kernel-driven, idempotent, hash-aware, replayable enforcement system.

Canonical chain:

```text
EVENT → OBJECT → OBLIGATION → RESOLUTION → RECEIPT → INTEGRITY
```

This chain is the product.

Do not turn AutoKirk into:

* a CRM
* a generic task system
* a low-code workflow builder
* a passive dashboard
* a vague analytics layer

Do build:

* strict governed objects
* explicit obligation lifecycle
* proof-backed closure
* deterministic receipts
* traceable integrity computation
* replayable projections
* founder/operator command surfaces

---

## Mandatory alignment requirements

You must align with the existing codebase and preserve the current doctrine where present.

Preserve and extend:

* kernel-centered modeling
* idempotent event ingestion
* one-way enforcement path
* hashing/signature integrity patterns
* replayable projections
* advisory-lock protected mutation paths
* Stripe-based revenue governance wedge

Do not introduce a parallel architecture.

Do not create a second obligation model.

Do not create alternate mutation paths that bypass canonical command logic.

Do not broaden scope before the revenue-governance wedge is correct.

---

## First-read instructions

Before changing code:

1. Read:

   * `ARCHITECTURE.md`
   * `ENFORCEMENT_MODEL.md`
   * `INTEGRITY_MODEL.md`
   * `docs/migrations/migration-audit.md`

2. Inspect current repo structure and identify:

   * current kernel/domain files
   * current Stripe ingestion and projection logic
   * current obligation command paths
   * current migrations and schema risks
   * existing tests around obligations, subscriptions, replay, and integrity

3. Produce an initial written summary containing:

   * current architecture state
   * doctrine alignment
   * key inconsistencies
   * migration risks
   * shortest path to a strong founder demo
   * recommended phase plan

Do not start coding before doing this.

---

## Core doctrine

### 1. One-way truth path

State must follow the canonical chain:

```text
EVENT → OBJECT → OBLIGATION → RESOLUTION → RECEIPT → INTEGRITY
```

Do not create shortcuts that bypass governed meaning.

### 2. Resolution is not closure

An obligation can be acted on without being proven complete.

This distinction is one of the most important product truths in AutoKirk.

Protect it everywhere:

* database functions
* command layer
* UI language
* tests
* docs

### 3. Proof-backed closure

If proof is required, closure must fail without valid proof.

### 4. Idempotency is structural

Duplicate events and retried commands must not create duplicate truth.

### 5. Integrity must be explainable

Every score must be decomposable into real signals backed by governed state.

### 6. Replayability matters

Important derived state must be rebuildable and consistent with live mutation paths.

---

## Engineering priorities

Work in this order unless a stronger dependency is discovered.

## Phase 1: Migration stabilization

Goal:
Make schema and migration order reliable from zero.

Tasks:

* audit all migrations
* identify ordering problems
* identify duplicate functions/RPCs
* identify schema drift against doctrine
* fix broken dependencies
* ensure canonical schema builds cleanly

Mandatory checks:

* `core.objects` exists before dependent logic
* `core.obligations` has required fields
* `idempotency_key` is present where doctrine requires it
* duplicated command RPCs are removed or superseded
* `economic_ref_id` handling is normalized
* replay helpers still work

Outputs:

* migration fixes
* updated `docs/migrations/migration-audit.md`
* clean build-from-zero result

---

## Phase 2: Canonical obligation lifecycle

Goal:
Implement and enforce strict lifecycle:

```text
OPEN → TOUCHED → RESOLVED → CLOSED
```

Rules:

* transitions must be explicit
* invalid transitions must fail
* CLOSED must require proof when proof is required
* every meaningful mutation must retain audit metadata
* all mutation paths must be idempotent

Outputs:

* transition logic
* command validation
* tests

---

## Phase 3: Receipt / proof system

Goal:
Make closure evidentiary, deterministic, and traceable.

Receipt requirements:

* linked to object and obligation
* deterministic hash
* sequence or stable ordering
* artifact reference or proof linkage
* audit metadata

Outputs:

* receipt model
* receipt generation/attachment logic
* closure enforcement integration
* tests

---

## Phase 4: Revenue-governance wedge completion

Goal:
Make Stripe-backed revenue truth compelling end-to-end.

Support at minimum:

* `checkout.session.completed`
* subscription creation/update/deletion
* invoice created/paid/failed
* charge dispute opened
* refund created

For each supported event:

* verify
* map into canonical meaning
* create/update object
* open/update obligation
* create/attach receipt when appropriate
* update projection
* affect integrity

Outputs:

* stable event translation
* end-to-end revenue-governance flow
* replay-safe projections
* tests

---

## Phase 5: Integrity engine

Goal:
Compute trustworthy operational truth from real governed state.

Canonical signals:

* closure
* breach
* coverage
* latency
* proof

Rules:

* no fake metrics
* no hand-wavy scoring
* score must drill into causes
* signal outputs must be traceable

Outputs:

* integrity computation
* query access
* explainability payload
* tests

---

## Phase 6: Founder command center

Goal:
Expose truth and action, not decoration.

Required views:

* integrity overview
* open obligations queue
* missing-proof queue
* revenue risk summary
* recent governed events
* object detail
* obligation detail
* receipt detail

Every view must help answer:

* what is wrong
* why
* what proof is missing
* what action closes the gap
* what the integrity consequence is

Outputs:

* real UI backed by governed data
* no placeholder metrics
* no decorative-only screens

---

## Phase 7: Replay + demo

Goal:
Make the system demonstrable and trustworthy.

Build:

* deterministic replay/rebuild path
* seed/demo scenario
* founder walkthrough flow

Demo sequence must show:

1. event ingested
2. object created
3. obligation opened
4. missing proof lowers integrity
5. proof attached
6. obligation closed
7. integrity improves

Outputs:

* seed/demo scripts
* `DEMO.md`
* replay validation tests

---

## Repo target state

Converge the repo toward this architecture:

### Persistence / enforcement

* `supabase/`

  * canonical schema
  * migrations
  * SQL enforcement
  * replay helpers
  * seed/demo data

### Domain kernel

* `src/lib/kernel/`

  * types
  * rules
  * transitions
  * idempotency
  * hashing
  * integrity
  * receipts
  * replay
  * selectors

### Provider translation

* `src/lib/providers/stripe/`

  * types
  * verification
  * mapper
  * object-builder
  * obligation-builder
  * receipt-builder
  * projector
  * event-specific handlers

### Command layer

* `src/lib/command/`

  * actions
  * validators
  * orchestration service

### Projection layer

* `src/lib/projections/`

  * subscription projections
  * invoice/payment/dispute projections
  * receipt ledger projections
  * integrity projections

### Query layer

* `src/lib/db/queries/`

  * objects
  * obligations
  * receipts
  * integrity
  * revenue summaries

### Founder UI

* `src/app/command/`

  * command overview
  * integrity
  * objects
  * obligations
  * receipts
  * revenue
  * risks
  * replay/admin surfaces

### Tests

* `tests/`

  * unit
  * integration
  * e2e
  * fixtures

Refactor incrementally, not cosmetically.

---

## Required canonical file responsibilities

### `src/lib/kernel/transitions.ts`

Own all valid obligation lifecycle transitions.

### `src/lib/kernel/idempotency.ts`

Own idempotency helpers and dedupe logic.

### `src/lib/kernel/hashing.ts`

Own canonical hashing helpers and deterministic receipt hashing.

### `src/lib/kernel/integrity.ts`

Own signal computation and explainability payload generation.

### `src/lib/kernel/rules.ts`

Own obligation creation rules, proof rules, severity rules, and breach rules.

### `src/lib/kernel/replay.ts`

Own deterministic replay orchestration and consistency checks.

### `src/lib/providers/stripe/mapper.ts`

Translate raw Stripe payloads into AutoKirk canonical semantics.

### `src/lib/providers/stripe/object-builder.ts`

Create or update governed objects from Stripe events.

### `src/lib/providers/stripe/obligation-builder.ts`

Create or mutate obligations triggered by Stripe events.

### `src/lib/providers/stripe/receipt-builder.ts`

Build receipt records tied to closure evidence.

### `src/lib/command/actions/touch-obligation.ts`

Acknowledge/interact without implying completion.

### `src/lib/command/actions/resolve-obligation.ts`

Record action taken without closure.

### `src/lib/command/actions/close-obligation.ts`

Attempt closure and enforce proof requirements.

### `src/lib/command/actions/attach-receipt.ts`

Attach proof and link closure evidence.

---

## Non-negotiable rules

Do not do any of the following:

* do not broaden AutoKirk into a generic platform
* do not create a no-code builder
* do not invent UI-only statuses
* do not collapse resolved and closed into one state
* do not compute integrity from presentation-layer data
* do not leave migration ambiguity unresolved
* do not create duplicate mutation paths
* do not leak raw provider jargon throughout the product
* do not add “done” as an ambiguous concept
* do not fake proof
* do not fake metrics

---

## UI language rules

Use operator language, not marketing language, in product surfaces.

Prefer:

* open
* overdue
* blocked
* missing proof
* resolved
* closed
* receipt attached
* revenue at risk
* integrity degraded

Avoid:

* magic
* AI confidence fluff
* “all good”
* vague health wording with no drill-down path

---

## Testing requirements

Add or maintain tests for:

### Unit

* transition validity
* idempotency behavior
* hashing determinism
* integrity signal math
* rule evaluation

### Integration

* webhook ingestion flow
* object creation/update
* obligation creation/update
* close fails without proof
* receipt-backed close succeeds
* replay rebuild consistency
* integrity traceability

### End-to-end

* founder command center shows open obligations
* missing proof visibly lowers integrity
* attaching proof enables closure
* replay rebuild restores the same visible truth state

---

## Required outputs per phase

For each phase, provide:

1. summary of what changed
2. files changed
3. why it matters
4. risks or unresolved questions
5. next recommended step

Keep summaries concise and concrete.

---

## Document maintenance rules

Keep these files current as implementation evolves:

* `ARCHITECTURE.md`
* `ENFORCEMENT_MODEL.md`
* `INTEGRITY_MODEL.md`
* `docs/migrations/migration-audit.md`

If implementation changes doctrine, update docs in the same phase.
If code drifts from docs, fix the drift.

---

## Definition of success

AutoKirk must reliably answer:

* What happened?
* What governed object exists because of it?
* What obligation is open?
* What action was taken?
* What proof exists?
* What is still unresolved?
* Why is integrity what it is?
* What exact command closes the risk?

---

## Initial execution sequence

Start now with this exact sequence:

1. Read the governing docs.
2. Inspect the repo and summarize current state and mismatches.
3. Audit migrations and identify the shortest path to a clean build from zero.
4. Implement Phase 1 migration stabilization.
5. Run tests and report results.
6. Move to Phase 2 only after migration state is coherent.

Do not skip the migration audit.
Do not start with UI polish.
Do not add new breadth before canonical enforcement is stable.
