# revenue_enforcement_vocabulary

AutoKirk is externally framed as **Revenue Enforcement Infrastructure**.

## Frozen core primitives

These remain the doctrine-level primitives:

1. Promise
2. Obligation
3. Closure
4. Ledger Event
5. Economic Outcome
6. Operator

No new primitive is introduced by this vocabulary guide.

## External operator vocabulary

- **Enforcement domain**: the operator-facing term for the internal `face` field.
- **Movement**: a revenue-relevant provider event that may open or advance governed work.
- **Command rail**: the operator queue for live governed obligations.
- **Closure receipt**: the immutable proof artifact emitted when closure is recorded.
- **Proof layer**: the operator-facing receipt surface.
- **Signal layer**: the operator-facing score and warning surface derived from committed truth.

## Internal-only compatibility terms

These may remain in schema, view, or route names, but should not leak into primary operator language when a clearer doctrine term exists:

- `face` -> enforcement domain
- `kind` -> obligation type
- `seal` -> record closure / resolve obligation
- `sealed_at` / `sealed_by` -> recorded at / recorded by

## Non-negotiable usage rules

- No surface labeled `legacy-readonly`, `dead`, or `deferred` may become operator-primary without explicit reclassification.
- Deferred movements may be ingested into the append-only ledger, but they may not mutate live operator, object, or obligation truth.
- UI copy should prefer obligation, closure, receipt, proof, enforcement domain, and signal layer over older internal labels.
