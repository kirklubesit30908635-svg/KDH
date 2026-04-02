# revenue_enforcement_operator_runbook

Use this when the goal is not feature work, but tuning the system into a sharper revenue-enforcement machine.

Backed by:

- [docs/revenue_enforcement_operating_loop.md](C:/Users/chase kirk/autokirk-kernel/docs/revenue_enforcement_operating_loop.md)
- [docs/revenue_enforcement_query_pack.sql](C:/Users/chase kirk/autokirk-kernel/docs/revenue_enforcement_query_pack.sql)

## Working rule

Run the same truth checks repeatedly.

1. Inspect DB truth
2. Inspect visible UI truth
3. Compare mismatch
4. Make one small product adjustment
5. Verify again

If the checks are empty after reset, treat that as `baseline empty`, not `healthy`.

## Daily loop

Run these in order every day:

1. obligation pressure audit
2. receipt integrity audit
3. UI truth audit

### Prompt 1: Obligation pressure audit

```text
Use the `local-postgres-ro` MCP server.

Run the obligation pressure section from:
C:/Users/chase kirk/autokirk-kernel/docs/revenue_enforcement_query_pack.sql

Return only:
- open_obligations
- overdue_obligations
- unowned_obligations
- metadata_blocked_obligations
- resolved_without_credible_proof

Then give:
- 3 short bullets on what these counts imply
- 1 short bullet naming the most important pressure problem

If all counts are zero, say `baseline empty after reset`, not `healthy`.
Do not suggest product changes yet.
```

### Prompt 2: Receipt integrity audit

```text
Use the `local-postgres-ro` MCP server.

Run the receipt integrity section from:
C:/Users/chase kirk/autokirk-kernel/docs/revenue_enforcement_query_pack.sql

Return only:
- resolved_obligations
- resolved_with_receipt_id
- resolved_with_credible_proof_state
- resolved_missing_receipt_trail
- orphan_obligation_chain_receipts
- obligation_chain_receipts_missing_direct_economic_ref

Then give:
- 3 short bullets on trustworthiness of closure
- 1 short bullet naming the worst receipt/proof weakness

If all counts are zero, say `no closure data yet`.
Do not suggest product changes yet.
```

### Prompt 3: UI truth audit

```text
Use the `local-playwright` MCP server.

Inspect the locally running app at http://127.0.0.1:3000 on these routes:
- /login
- /command
- /command/receipts
- /command/integrity

Answer directly:
- what does the operator see first
- what feels most emphasized
- what important pressure is hidden or requires digging
- whether overdue work is obvious
- whether owner visibility is strong or weak
- whether proof and receipt state are strong or weak
- whether the screens feel like command or passive reporting

Return:
- findings ordered by severity
- 1 short paragraph on whether the UI increases enforcement force or dilutes it

If the app is not running or auth blocks inspection, say exactly where the inspection stopped.
Do not suggest code changes yet.
```

## Every-change loop

After any product adjustment, rerun the loop in this order:

1. DB checks again
2. UI inspection again
3. compare mismatch
4. keep only the change if enforcement clarity improved

### Prompt 4: Compare mismatch

```text
Use the latest results from:
- obligation pressure audit
- receipt integrity audit
- UI truth audit

Compare them and answer:
- what is important in DB but weak or hidden in UI
- what is visible in UI but not trustworthy in DB
- whether proof/receipt state is too weak to support trusted closure
- what single mismatch matters most right now

Return only:
- top 5 mismatches ordered by enforcement risk
- 1 recommended small product adjustment
- 1 sentence on how to verify that adjustment worked

Keep the recommendation narrow: sort order, grouping, labels, severity logic, proof visibility, receipt visibility, owner visibility, or escalation cues.
```

### Prompt 5: Verify after one adjustment

```text
Use the same three checks again:
- obligation pressure audit
- receipt integrity audit
- UI truth audit

Compare before vs after and answer:
- did the important mismatch shrink
- did any new confusion appear
- should this change be kept, retuned, or reverted

Return:
- keep / retune / revert
- 3 bullets of evidence

Do not expand scope beyond the single adjustment under review.
```

## Weekly loop

Run these once a week:

1. runtime health audit
2. Stripe-to-obligation spot check
3. top mismatch review

### Prompt 6: Runtime health audit

```text
Use the `local-docker-ro` MCP server.

Inspect these containers first:
- supabase_db_autokirk-kernel
- supabase_kong_autokirk-kernel
- supabase_auth_autokirk-kernel
- supabase_storage_autokirk-kernel
- supabase_rest_autokirk-kernel

Answer directly:
- is the DB healthy
- is gateway/auth healthy
- is there restart churn
- is there any sign of service instability that could distort product judgment

Return:
- a short health summary
- any restart churn or instability findings
- whether product/UI issues should be trusted as real or treated as environment noise first

Ignore unrelated containers unless they are clearly interfering with autokirk-kernel.
```

### Prompt 7: Stripe-to-obligation spot check

```text
Use `local-postgres-ro` first and `local-playwright` second.

Run the Stripe-to-obligation section from:
C:/Users/chase kirk/autokirk-kernel/docs/revenue_enforcement_query_pack.sql

Then inspect the local UI at:
- http://127.0.0.1:3000/command
- http://127.0.0.1:3000/command/receipts
- http://127.0.0.1:3000/command/integrity

Answer directly for one real supported Stripe-linked case:
- does the Stripe event exist
- does a matching object exist
- does an obligation exist
- is it visible in the command UI
- is proof or receipt state visible enough to trust closure

Return:
- one numbered end-to-end trace
- every place the chain breaks
- the single highest-value next fix if money is entering without visible pressure

If there are no supported Stripe events, say `no Stripe sample available`.
```

### Prompt 8: Top mismatch review

```text
Use the latest results from all five audits:
- obligation pressure
- receipt integrity
- UI truth
- runtime health
- Stripe-to-obligation spot check

Return:
- the top 3 mismatches in the whole system
- which one is product-level vs environment-level
- which one should be tuned first this week
- what single small change has the best expected enforcement gain

Prefer concrete system mismatches over broad commentary.
```

## When to add a thin diagnostics layer

Do not add one yet.

Add it only when all three become true:

- the same probes are being repeated constantly
- raw SQL review is slowing iteration
- named business probes would materially speed decisions

If that happens, build named probes such as:

- `open_revenue_obligations`
- `receipt_integrity_check`
- `orphan_stripe_events`
- `unowned_overdue_obligations`
- `blocked_without_next_step`
- `resolved_without_credible_proof`
