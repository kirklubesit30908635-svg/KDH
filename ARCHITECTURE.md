# AutoKirk Architecture

## Purpose

AutoKirk is an enforcement operating system for revenue-linked business obligations.

It exists to answer, with system-backed certainty:

- What happened?
- What object exists because of it?
- What obligation is now open?
- What action has been taken?
- What proof exists?
- What is still unresolved?
- What is the integrity impact?

AutoKirk is not a passive analytics layer. It is a governed truth system.

---

## Core chain

```text
EVENT → OBJECT → OBLIGATION → RESOLUTION → RECEIPT → INTEGRITY
```

This is the canonical one-way path.

### Definitions

#### Event

A timestamped, auditable occurrence from a source system or internal command.

Examples:

* Stripe checkout session completed
* Invoice paid
* Subscription deleted
* Operator resolved obligation
* Receipt attached

#### Object

A governed entity recognized by the kernel.

Examples:

* subscription
* invoice
* payment
* dispute
* refund
* vendor operating cost item

#### Obligation

A required follow-through condition attached to an object.

Examples:

* activate operator access
* confirm payment settlement
* attach proof of refund
* resolve failed payment
* justify operating cost

#### Resolution

An action taken toward closing an obligation.

Important:
Resolution is not the same as closure.

#### Receipt

The proof artifact or recorded evidence that allows an obligation to be closed.

Examples:

* payment confirmation
* provider event-backed closure
* uploaded proof artifact
* system-generated receipt record with deterministic hash

#### Integrity

A computed, explainable expression of operational truth quality.

Integrity reflects:

* what is closed
* what is overdue
* what lacks proof
* what remains unresolved
* how complete system coverage is

---

## Architectural principles

### 1. Kernel-first

The kernel owns the canonical meaning of objects, obligations, receipts, and integrity.

### 2. One-way truth path

State flows forward through governed stages. Do not invent side paths that bypass the chain.

### 3. Idempotent ingestion

Duplicate events must not create duplicate truth.

### 4. Proof-backed closure

Where proof is required, closure cannot occur without it.

### 5. Replayable projections

Derived state must be rebuildable from governed history.

### 6. Auditability

Every important state change must be attributable and explainable.

### 7. No fake metrics

All scoring and status views must trace back to actual objects, obligations, events, and receipts.

---

## System layers

## 1. Persistence and enforcement layer

Location:

* `supabase/migrations/`
* SQL functions / RPCs
* seed data
* replay helpers

Responsibilities:

* canonical schema
* constraints
* durable state
* mutation safety
* replay-safe database behavior

This layer must protect invariants that cannot be trusted to UI or app code alone.

---

## 2. Kernel domain layer

Location:

* `src/lib/kernel/`

Responsibilities:

* canonical types
* obligation lifecycle
* transition rules
* integrity computation
* idempotency helpers
* hashing helpers
* replay orchestration
* selectors for system truth

This is the core logic asset of AutoKirk.

---

## 3. Provider translation layer

Location:

* `src/lib/providers/stripe/`

Responsibilities:

* verify provider events
* map provider-specific payloads into AutoKirk semantics
* build objects, obligations, receipts
* project provider event sequences safely

Provider details should stop at this boundary.

---

## 4. Command layer

Location:

* `src/lib/command/`

Responsibilities:

* operator actions
* transition validation
* proof requirement enforcement
* idempotency guard usage
* orchestration of touch / resolve / close / attach receipt

This is where human action meets governed system logic.

---

## 5. Projection layer

Location:

* `src/lib/projections/`

Responsibilities:

* replayable read models
* summarized object state
* subscription status
* receipt ledgers
* integrity summaries
* revenue-risk summaries

Projection logic must be deterministic.

---

## 6. Query layer

Location:

* `src/lib/db/queries/`

Responsibilities:

* fetch lists and detail views
* queue views
* drill-down views
* integrity breakdown views
* revenue-linked summaries

This layer should not invent meaning. It should expose governed meaning.

---

## 7. Command UI

Location:

* `src/app/command/`

Responsibilities:

* founder/operator visibility
* obligation queues
* proof gaps
* revenue risk
* object detail
* receipt detail
* replay/admin controls when appropriate

The UI must feel like command and control for truth, not decorative analytics.

---

## Canonical domain entities

## Object

Minimum fields:

* `id`
* `workspace_id`
* `kernel_class`
* `source_system`
* `source_ref`
* `status`
* `metadata`
* timestamps

## Obligation

Minimum fields:

* `id`
* `object_id`
* `obligation_type`
* `state`
* `opened_at`
* `due_at`
* `resolved_at`
* `closed_at`
* `idempotency_key`
* `metadata`

## Receipt

Minimum fields:

* `id`
* `object_id`
* `obligation_id`
* `receipt_type`
* `receipt_hash`
* `seq`
* `proof_artifact_ref`
* `created_at`
* `metadata`

## Event

Minimum fields:

* `id`
* `workspace_id`
* `event_type`
* `payload`
* `idempotency_key`
* `source_system`
* `issued_at`
* timestamps

---

## Canonical lifecycle

```text
OPEN → TOUCHED → RESOLVED → CLOSED
```

### OPEN

Obligation exists and is active.

### TOUCHED

A human or system has acknowledged or interacted with it.

### RESOLVED

A closing action has been taken, but proof may still be absent.

### CLOSED

Proof-backed completion exists and all closure conditions are satisfied.

---

## Important distinctions

### Resolution is not closure

A person can say they handled something.
That does not mean the system can prove it is complete.

### Receipt is not arbitrary metadata

A receipt is governed evidence linked to an obligation and closure event.

### Integrity is not a vanity score

Integrity is an explainable output of real governed state.

---

## Data-flow examples

## Stripe checkout session completed

1. Event ingested
2. Event verified
3. Object identified or created
4. Obligation opened
5. Subscription projection updated
6. Integrity recalculated

## Refund proof flow

1. Refund event arrives
2. Refund object created/updated
3. Obligation opened for proof-backed confirmation
4. Operator resolves
5. Receipt attached
6. Obligation closed
7. Integrity improves

---

## Required guarantees

* No duplicate truth from duplicate events
* No closure without required proof
* No broken state transitions
* No projection dependency on non-canonical meaning
* No migration assumptions that violate schema order
* No duplicate command mutation paths

---

## What not to build

Do not turn AutoKirk into:

* a CRM
* a generic task app
* a broad no-code workflow tool
* a passive dashboard
* a vague “AI ops” surface without governed truth underneath

---

## Definition of success

AutoKirk succeeds when a founder or operator can open the command center and reliably see:

* what exists
* what happened
* what is owed
* what proof exists
* what is overdue
* what action closes the gap
* why the integrity score is what it is
