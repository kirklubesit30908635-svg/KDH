# Operator Summary Contract

## Purpose

`/api/operator/summary` is the single authoritative operator summary read surface for AutoKirk.

Operator-facing routes may present detail from their own feeds, but they must not derive their own clear, degraded, proof-active, or access state. Those states come from this contract only.

## Contract

The response body is:

```ts
{
  summary: {
    total_open_obligations: number;
    needs_action_count: number;
    at_risk_count: number;
    late_count: number;
    oldest_unresolved_obligation: OperatorSummaryRow | null;
    oldest_unresolved_obligation_at: string | null;
    oldest_unresolved_obligation_age: number | null;
    recent_receipts_count: number;
    total_receipts_count: number;
    latest_receipt_at: string | null;
    live_state_health:
      | "access_required"
      | "unavailable"
      | "degraded"
      | "action_required"
      | "proof_active"
      | "idle";
    proof_lag_summary: {
      count: number;
      label: string;
    };
    degraded_read_indicator: boolean;
    inconsistency_indicator: {
      kind: "hidden_open_obligations";
      label: string;
      hidden_open_obligations: number;
      visible_open_obligations: number;
    } | null;
    status_headline: string;
    status_message: string;
  }
}
```

## Required semantics

- `needs_action_count` is actionable pressure only: `late_count + at_risk_count`.
- `total_open_obligations` is the governed open count, including hidden open obligations detected outside the visible queue projection.
- Breached obligations sort first, then earlier `due_at`, then earlier `created_at`.
- If `raw open > visible open`, `inconsistency_indicator` must be populated and `live_state_health` must be `degraded`.
- If `total_open_obligations = 0` and `total_receipts_count > 0`, `live_state_health` must be `proof_active`.
- Query/auth/read failures must not collapse into empty success.
- `idle` is only valid when there are no open obligations, no proof lag, no proof history, and no inconsistency.

## Consumers

The following operator-facing surfaces consume this contract:

- `/login`
- `/command`
- `/command/receipts`
- `/command/integrity`

The legacy `/receipts` route is redirected to `/command/receipts` so it cannot drift from the shared proof/state contract.

## Helper boundary

UI code must call `fetchOperatorSummary()` from [src/lib/operator-summary-client.ts](C:/Users/chase kirk/autokirk-kernel/src/lib/operator-summary-client.ts).

- UI must not inspect the API envelope shape directly.
- `unwrapOperatorSummary()` owns payload validation and safe fallback behavior.
