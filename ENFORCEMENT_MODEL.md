# AutoKirk Enforcement Model

## Purpose

This document defines how AutoKirk governs business obligations.

The goal is simple:

> No economically meaningful follow-through should disappear without a governed trace.

---

## Canonical chain

```text
EVENT → OBJECT → OBLIGATION → RESOLUTION → RECEIPT → INTEGRITY
```

This chain is the foundation of the product.

---

## Enforcement doctrine

### 1. Events create governed consequences

An event is not merely recorded.
It may create or update an object, and may open or mutate obligations.

### 2. Objects are the anchor of responsibility

Every governed obligation must attach to a canonical object.

### 3. Obligations stay open until closure is proven

An obligation does not disappear because someone said it was handled.

### 4. Resolution is weaker than closure

Resolution means action has been taken.
Closure means the system has proof.

### 5. Proof requirements are explicit

If an obligation requires proof, closure must fail when proof is absent.

### 6. Integrity reflects enforcement reality

Integrity falls when obligations age, proof is missing, or system coverage is incomplete.

---

## Obligation lifecycle

```text
OPEN → TOUCHED → RESOLVED → CLOSED
```

## OPEN

The obligation exists and remains unfulfilled.

Triggers:

* incoming provider event
* internal system event
* command action that creates a new follow-through duty

Properties:

* may have due date
* may require proof
* may carry severity
* may affect integrity immediately

## TOUCHED

The obligation has been acknowledged or interacted with.

Purpose:

* show operator engagement
* distinguish ignored risk from active handling

TOUCHED does not mean safe.
TOUCHED does not mean complete.

## RESOLVED

A closing action has been taken.

Examples:

* operator claims subscription activation handled
* operator claims payment issue addressed
* refund action executed
* account access updated

RESOLVED does not imply proof is present.

## CLOSED

The obligation is complete under system rules.

Requirements:

* transition is valid
* required proof exists
* closure metadata is recorded

---

## Required enforcement rules

## Rule 1: No invalid transitions

Examples:

* CLOSED → OPEN is invalid unless explicitly reopened through a governed path
* OPEN → CLOSED is invalid when proof is required and missing
* RESOLVED → TOUCHED is invalid

All transitions must be explicit and validated.

---

## Rule 2: No closure without required proof

Proof-required obligations must fail closure until a valid receipt exists.

Examples of valid proof:

* provider-confirmed settlement event
* deterministic system receipt with backing evidence
* linked artifact or external proof reference
* signed or hashed event-backed receipt entry

---

## Rule 3: Idempotent commands

Repeated commands must not create duplicate outcomes.

Examples:

* repeated close attempt with same idempotency key
* repeated resolve action from retries
* duplicate provider webhook delivery

All mutation paths must be safe under retry.

---

## Rule 4: Audit metadata on every meaningful mutation

Every mutation should retain enough metadata to answer:

* who did it
* what changed
* why
* when
* based on what evidence
* under what idempotency key

---

## Rule 5: Severity must be explainable

Obligation severity cannot be arbitrary.

Severity should derive from factors such as:

* economic importance
* age
* breach state
* proof requirement
* revenue proximity
* customer-facing consequence

---

## Rule 6: Overdue obligations increase pressure

As obligations age past due dates, breach pressure should rise.

This affects:

* queues
* prioritization
* integrity

---

## Rule 7: Missing proof is first-class risk

Missing proof is not cosmetic.
It is a governed deficiency.

AutoKirk must surface:

* obligations resolved but not closed
* closures blocked by proof gaps
* objects whose lifecycle remains unverifiable

---

## Rule 8: Coverage matters

If important events are ingested but not linked to obligations, system integrity should reflect that gap.

The system should ask:

* Was an object created?
* Was the correct obligation opened?
* Is the chain complete?

---

## Closure model

Closure requires all of the following:

1. valid object
2. valid obligation
3. valid transition path
4. proof present if required
5. receipt record created or linked
6. audit metadata stored
7. idempotent mutation behavior

If any part fails, the obligation remains not closed.

---

## Reopening model

Reopening should be rare and governed.

Allowed reasons may include:

* proof invalidated
* reversal event received
* dispute opened after apparent completion
* projection repair after authoritative replay

Reopen actions must be explicit and auditable.

---

## Revenue-first obligation types

Examples of high-priority obligation types:

* activate_operator_access
* confirm_subscription_state
* confirm_invoice_payment
* resolve_payment_failure
* attach_dispute_evidence
* confirm_refund_completion
* justify_vendor_cost
* confirm_vendor_payment_proof

These should be built before broader operational obligation types.

---

## Operator command model

The command layer should support:

* touch obligation
* resolve obligation
* attach receipt
* close obligation

The UI must not mutate truth directly without going through governed command paths.

---

## Enforcement outcomes AutoKirk should surface

For each obligation, the system should answer:

* Why does this obligation exist?
* What event created the context?
* What action is expected?
* Is it overdue?
* Is proof required?
* Has proof been attached?
* Is it resolved?
* Is it closed?
* What happens to integrity if it stays open?

---

## Anti-patterns

Do not allow:

* “done” as an ambiguous state
* free-form closure without proof rules
* silent mutation from UI-only logic
* provider-specific state replacing canonical obligation state
* dashboards that hide unresolved proof gaps
* duplicate mutation paths that bypass command validation

---

## Product consequence

The enforcement model is the moat.

AutoKirk becomes valuable when it can say, with precision:

* this happened
* this obligation exists because of it
* this action was taken
* this proof exists or does not exist
* this risk remains open
* this is the integrity consequence
