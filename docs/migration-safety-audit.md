# Migration Safety Audit

## What is true

- The repo contains a long settled migration chain, including numeric base migrations and timestamped forward migrations through late March 2026.
- This is not a low-stakes reset-only scratch chain. It has production-facing route handlers and multiple timestamped forward migrations that depend on earlier state.
- During this audit, two historical migrations were found modified in the working tree:
  - `supabase/migrations/0018_washbay_jobs.sql`
  - `supabase/migrations/0033_subscription_obligation_flow.sql`
- Those two files have been restored locally to `HEAD` during this audit.
- One new forward migration exists in the working tree:
  - `supabase/migrations/20260329053000_repair_recent_receipts_projection.sql`

## What is broken

- `0033_subscription_obligation_flow.sql` had been edited away from its settled historical contract into a compatibility-safe/dynamic-SQL variant.
- That edit was not comment-only. It changed replay semantics, broadened search paths, added conditional existence checks, and weakened deterministic failure behavior in a settled historical migration.
- `0018_washbay_jobs.sql` had lower-risk historical churn (`IF EXISTS` / `DROP IF EXISTS` / policy recreation), but it was still an unnecessary rewrite of settled history.
- Feature work should not continue on top of a dirty historical migration chain, because later forward migrations become impossible to trust.

## Files inspected

- `supabase/migrations/20260328060000_align_provisioning_to_autokirk_doctrine.sql`
- `supabase/migrations/20260328120000_customer_activation_spine.sql`
- `supabase/migrations/0033_subscription_obligation_flow.sql`
- `supabase/migrations/0018_washbay_jobs.sql`
- `supabase/migrations/20260329053000_repair_recent_receipts_projection.sql`
- migration list under `supabase/migrations/*`
- `git diff` and `git show HEAD:<path>` for the historical files above

## Classification per migration

| Migration | Current status | Classification | Evidence |
|---|---|---|---|
| `20260328060000_align_provisioning_to_autokirk_doctrine.sql` | matches `HEAD` | `safe` | Intact forward doctrine-alignment migration. Renames provisioning nouns and preserves governed object → obligation → event → receipt path. No working-tree drift detected. |
| `20260328120000_customer_activation_spine.sql` | matches `HEAD` | `safe` | Read-only forward view/function for activation status. No working-tree drift detected. |
| `0018_washbay_jobs.sql` | was modified, restored locally | `idempotency-safe` | Working-tree edit only added rerun guards and policy/trigger drops. Semantics were close to original, but this is still historical churn with no business justification in a settled file. |
| `0033_subscription_obligation_flow.sql` | was modified, restored locally | `production-dangerous` | Working-tree edit replaced deterministic historical behavior with compatibility fallbacks, dynamic SQL, existence checks, and changed search-path assumptions. It could silently mask missing doctrine surfaces during replay and materially alter the chain. |
| `20260329053000_repair_recent_receipts_projection.sql` | new untracked forward migration | `safe` | Forward additive projection repair. It does not rewrite settled history. However it is not part of the migration-drift quarantine itself and should be reviewed separately from the historical restore. |

## Exact recommended file actions

- `supabase/migrations/20260328060000_align_provisioning_to_autokirk_doctrine.sql`
  - Action: `keep as-is`
  - Rationale: current file is intact and matches the settled chain; do not rewrite it.

- `supabase/migrations/20260328120000_customer_activation_spine.sql`
  - Action: `keep as-is`
  - Rationale: forward additive read surface; no drift detected.

- `supabase/migrations/0018_washbay_jobs.sql`
  - Action: `restore from HEAD`
  - Rationale: historical file had unnecessary churn. Even safe-looking idempotency edits should not be committed into settled history without a replay-chain reason.

- `supabase/migrations/0033_subscription_obligation_flow.sql`
  - Action: `restore from HEAD`
  - Rationale: the working copy was materially dangerous. It changed historical semantics and could hide missing schema/function expectations instead of failing loudly.

- `supabase/migrations/20260329053000_repair_recent_receipts_projection.sql`
  - Action: `do not commit current working copy`
  - Rationale: it is a forward additive migration, but it is not part of the safety restore itself. Land it only as a separate intentional read-surface repair after the historical chain is confirmed clean.

## Forward migrations that appear to compensate for altered history

- No forward migration in the inspected set conclusively compensates for the dirty `0033` rewrite.
- The new untracked `20260329053000_repair_recent_receipts_projection.sql` is a projection repair, not a historical-chain compensation.
- The correct sequence is:
  1. restore dirty historical migrations,
  2. re-establish chain trust,
  3. then land forward additive repairs intentionally.

## Validation steps

1. Confirm historical migration drift is gone:
   - `git status --short supabase/migrations`
   - expected result after this audit: only the new forward migration remains untracked.
2. Confirm the restored historical files match `HEAD`:
   - `git diff -- supabase/migrations/0018_washbay_jobs.sql`
   - `git diff -- supabase/migrations/0033_subscription_obligation_flow.sql`
   - expected result: no diff.
3. Before feature work resumes, re-run migration-chain checks in the normal repo workflow:
   - migration replay/reset path
   - schema lint
   - any provisioning smoke test that exercises subscription obligation opening and governed resolution

## Should feature work pause?

- Yes. Feature work should have paused while the dirty `0033_subscription_obligation_flow.sql` working copy existed.
- After this audit’s local restore of `0018` and `0033`, the immediate migration-integrity blocker is removed.
- Do not proceed by committing the previously modified historical copies. Resume feature work only from the restored chain.

## Risks if left unfixed

- Dirty historical migrations destroy confidence in every later forward migration.
- The modified `0033` could allow replay to “succeed” while silently omitting required doctrine surfaces such as object/economic anchors or deterministic resolve behavior.
- That kind of silent compatibility fallback is worse than a loud failure in a settled production-oriented chain.
- Continuing feature work on top of that drift would turn later bugs into chain-origin ambiguity instead of isolated defects.
