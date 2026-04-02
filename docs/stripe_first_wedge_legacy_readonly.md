# stripe_first_wedge_legacy_readonly

No legacy-readonly HTTP or projection surface remains inside the paying-operator runtime after the deployment boundary split.

## Remaining legacy-readonly paths

- none

## Rules

- No legacy-readonly path may mutate kernel truth.
- No legacy-readonly path may become operator-primary without explicit reclassification.
- If a removed or isolated surface needs live use later, it must re-enter through the wedge contract and closure manifest first.
