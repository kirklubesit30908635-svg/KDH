import {
  buildUnavailableSummary,
  type OperatorSummary,
} from "@/lib/operator-summary";

function isOperatorSummary(value: unknown): value is OperatorSummary {
  if (!value || typeof value !== "object") {
    return false;
  }

  const summary = value as Partial<OperatorSummary>;
  return (
    typeof summary.total_open_obligations === "number" &&
    typeof summary.needs_action_count === "number" &&
    typeof summary.at_risk_count === "number" &&
    typeof summary.late_count === "number" &&
    typeof summary.recent_receipts_count === "number" &&
    typeof summary.total_receipts_count === "number" &&
    typeof summary.live_state_health === "string" &&
    typeof summary.degraded_read_indicator === "boolean" &&
    typeof summary.status_headline === "string" &&
    typeof summary.status_message === "string"
  );
}

export function unwrapOperatorSummary(payload: unknown, status = 200): OperatorSummary {
  if (payload && typeof payload === "object" && "summary" in payload) {
    const wrapped = payload as { summary?: unknown };
    if (isOperatorSummary(wrapped.summary)) {
      return wrapped.summary;
    }
  }

  if (isOperatorSummary(payload)) {
    return payload;
  }

  return buildUnavailableSummary(`Operator summary payload invalid (HTTP ${status}).`);
}

export async function fetchOperatorSummary(): Promise<OperatorSummary> {
  const res = await fetch("/api/operator/summary", { cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  return unwrapOperatorSummary(json, res.status);
}
