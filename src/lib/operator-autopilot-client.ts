import {
  buildAccessRequiredAutopilot,
  buildUnavailableAutopilot,
  type OperatorAutopilot,
} from "@/lib/operator-autopilot";

function isOperatorAutopilot(value: unknown): value is OperatorAutopilot {
  if (!value || typeof value !== "object") {
    return false;
  }

  const autopilot = value as Partial<OperatorAutopilot>;
  return (
    typeof autopilot.generated_at === "string" &&
    typeof autopilot.mode === "string" &&
    typeof autopilot.headline === "string" &&
    typeof autopilot.message === "string" &&
    typeof autopilot.degraded_read_indicator === "boolean" &&
    typeof autopilot.visible_queue_count === "number" &&
    typeof autopilot.actionable_queue_count === "number" &&
    typeof autopilot.monitor_queue_count === "number" &&
    typeof autopilot.proof_activity_count === "number" &&
    Array.isArray(autopilot.watchlist)
  );
}

export function unwrapOperatorAutopilot(payload: unknown, status = 200): OperatorAutopilot {
  if (payload && typeof payload === "object") {
    const wrapped = payload as { autopilot?: unknown };
    if (isOperatorAutopilot(wrapped.autopilot)) {
      return wrapped.autopilot;
    }
  }

  if (isOperatorAutopilot(payload)) {
    return payload;
  }

  if (status === 401 || status === 403) {
    return buildAccessRequiredAutopilot();
  }

  return buildUnavailableAutopilot(
    `Operator autopilot payload invalid (HTTP ${status}).`,
  );
}

export async function fetchOperatorAutopilot(): Promise<OperatorAutopilot> {
  const res = await fetch("/api/command/autopilot", { cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  return unwrapOperatorAutopilot(json, res.status);
}
