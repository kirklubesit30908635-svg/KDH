# AutoKirk Integrity Model

## Purpose

Integrity is AutoKirk’s measure of operational truth quality.

It is not a vanity KPI.
It is not a decorative health score.
It is a traceable result of governed state.

The integrity model exists to answer:

- How reliably is the system enforcing obligations?
- Where is proof missing?
- What is overdue?
- How complete is system coverage?
- Where is the business operationally leaking truth?

---

## Integrity definition

Integrity expresses the quality of closure, proof, timeliness, and coverage across governed business activity.

High integrity means:
- important events produce governed objects and obligations
- obligations are closed correctly
- required proof exists
- breaches are low
- closure latency is acceptable

Low integrity means:
- obligations remain open
- proof is missing
- events are not being governed
- closure is late
- operator behavior is inconsistent or unverifiable

---

## Core signals

The initial integrity model should be built from five canonical signals.

## 1. Closure
Measures the share of obligations that are properly closed.

Example question:
- Of obligations expected to be closed by now, how many are actually closed?

Signal meaning:
- strong closure means follow-through is happening
- weak closure means obligations are accumulating

---

## 2. Breach
Measures the share of obligations that are overdue or operationally breached.

Example question:
- How much governed work is now late beyond its allowed window?

Signal meaning:
- high breach pressure indicates real operational danger
- breach should hurt integrity significantly

---

## 3. Coverage
Measures the share of important events that successfully produced governed obligations where expected.

Example question:
- Are economically meaningful events actually entering the enforcement chain?

Signal meaning:
- low coverage means the system is missing truth
- a business cannot claim high integrity if large areas are unguided

---

## 4. Latency
Measures how long obligations take to move from open to closed.

Example question:
- How quickly does the organization complete and prove follow-through?

Signal meaning:
- slow closure creates risk even if eventual closure happens
- latency should degrade integrity progressively, not only at hard breach thresholds

---

## 5. Proof
Measures the share of closure-relevant obligations that have valid proof or receipts.

Example question:
- Of obligations that should be proven, how many actually have proof?

Signal meaning:
- missing proof is one of the strongest integrity failures
- “resolved without proof” should never score like “closed with proof”

---

## Example weighting

Initial default weighting:

- Closure: 30%
- Breach: 25%
- Coverage: 20%
- Latency: 15%
- Proof: 10%

These weights can evolve, but must remain explainable.

---

## Scoring principles

### 1. Explainability over complexity
Each score must be traceable to underlying governed records.

### 2. No fake precision
Do not imply false certainty.
If coverage is incomplete, the system should say so.

### 3. Missing proof is real damage
Proof gaps should explicitly lower integrity.

### 4. Overdue obligations matter more than mildly late work
Severity should increase with time and economic importance.

### 5. Revenue-linked obligations matter first
Revenue-facing truth should influence integrity strongly in the current product wedge.

---

## Traceability requirements

For every integrity score shown in UI, the system should be able to expose:

- total governed objects in scope
- total obligations in scope
- number open
- number overdue
- number resolved but not closed
- number closed
- number requiring proof
- number missing proof
- per-signal subscore
- recent changes that caused movement

The user should be able to drill from score → signal → object/obligation.

---

## Integrity states

Optional display bands:

- 90–100: strong
- 75–89: stable but exposed
- 60–74: degraded
- 40–59: high risk
- 0–39: failing

These bands are presentation layers only.
Underlying signal math matters more.

---

## Integrity movement

Integrity should move when governed truth changes.

Examples that lower integrity:
- new overdue obligation
- missing proof on a resolved obligation
- failed payment obligation unaddressed
- dispute opened without evidence path
- coverage drop from ungoverned events

Examples that improve integrity:
- obligation closed with valid proof
- overdue obligation resolved and closed
- replay rebuild restores missing governed chain
- proof attached to previously unresolved closure

---

## Minimum explainability payload

Every integrity response should be able to include something like:

- current score
- previous score
- delta
- signal breakdown
- top causes of degradation
- top recent improvements
- most severe open obligations
- most severe proof gaps

---

## Revenue-first integrity emphasis

Because AutoKirk’s first wedge is revenue governance, integrity should prioritize:
- subscriptions
- invoices
- payments
- disputes
- refunds
- vendor operating cost proof

Not every operational obligation should initially weigh equally.

---

## Important distinctions

### Resolved is not closed
A resolved obligation without proof should still damage proof quality and may still count against closure completeness.

### Covered is not healthy
An event that produced an obligation is covered.
That does not mean the obligation is being handled well.

### Closed is not equal across all obligations
Severity and economic relevance matter.

---

## Anti-patterns

Do not:
- compute integrity from UI states
- use hand-written overrides without audit trails
- invent “AI confidence” as a score input
- show a score that cannot be decomposed
- mask low coverage with high closure on a tiny subset

---

## Product meaning

Integrity is valuable when it becomes a trustworthy answer to:

> How much of the business is operationally real, closed, proven, and under control right now?
