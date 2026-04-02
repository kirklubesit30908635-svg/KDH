# Operator Autopilot

## Purpose

`/api/command/autopilot` is the server-side recommendation surface for the governed operator queue.

It does not mutate state. It reads:

- the authoritative operator summary contract
- the governed operator queue feed
- the Stripe first wedge contract and kernel rules

The result is a single recommendation contract that the UI can render without deriving status, escalation, or playbook logic locally.

## Rules

- Governance stays server-side.
- React renders the contract; it does not infer next actions.
- The autopilot may only recommend from the visible governed queue.
- If the authoritative summary is `access_required` or `unavailable`, the autopilot must not invent a recommendation.
- If the authoritative summary is `degraded`, the autopilot may still show visible recommendations, but it must preserve the degraded headline/message from the summary contract.

## Contract

```ts
{
  autopilot: {
    generated_at: string;
    mode:
      | "access_required"
      | "unavailable"
      | "degraded"
      | "action_required"
      | "proof_active"
      | "idle";
    headline: string;
    message: string;
    degraded_read_indicator: boolean;
    visible_queue_count: number;
    actionable_queue_count: number;
    monitor_queue_count: number;
    proof_activity_count: number;
    recommended_action: OperatorAutopilotRecommendation | null;
    watchlist: OperatorAutopilotRecommendation[];
  }
}
```

Each `OperatorAutopilotRecommendation` carries:

- the governed queue row identity
- escalation metadata derived from queue severity / breach state
- a `playbook` object derived from:
  1. Stripe first wedge contract rows
  2. kernel class rules
  3. generic governed fallback

## Playbook precedence

1. Supported Stripe first wedge obligation types use the contract row directly.
2. Non-wedge but known obligation types fall back to `CLASS_RULES`.
3. Unknown obligation types fall back to a generic governed playbook that still requires explicit closure proof.

## Consumers

- `/command`

The page must call [src/lib/operator-autopilot-client.ts](C:/Users/chase kirk/autokirk-kernel/src/lib/operator-autopilot-client.ts) and render the returned contract. It must not compute escalation or playbook text locally.
