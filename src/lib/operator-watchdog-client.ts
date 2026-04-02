import {
  buildAccessRequiredWatchdog,
  buildUnavailableWatchdog,
  normalizeWatchdogRun,
  type OperatorWatchdog,
  type OperatorWatchdogRun,
} from "@/lib/operator-watchdog";

function isOperatorWatchdog(value: unknown): value is OperatorWatchdog {
  if (!value || typeof value !== "object") {
    return false;
  }

  const watchdog = value as Partial<OperatorWatchdog>;
  return (
    typeof watchdog.generated_at === "string" &&
    typeof watchdog.mode === "string" &&
    typeof watchdog.headline === "string" &&
    typeof watchdog.message === "string" &&
    typeof watchdog.degraded_read_indicator === "boolean" &&
    typeof watchdog.trigger_count === "number" &&
    typeof watchdog.late_trigger_count === "number" &&
    typeof watchdog.at_risk_trigger_count === "number" &&
    typeof watchdog.proof_lag_trigger_count === "number" &&
    typeof watchdog.inconsistency_trigger_count === "number" &&
    Array.isArray(watchdog.triggers)
  );
}

export function unwrapOperatorWatchdog(payload: unknown, status = 200): OperatorWatchdog {
  if (payload && typeof payload === "object") {
    const wrapped = payload as { watchdog?: unknown };
    if (isOperatorWatchdog(wrapped.watchdog)) {
      return wrapped.watchdog;
    }
  }

  if (isOperatorWatchdog(payload)) {
    return payload;
  }

  if (status === 401 || status === 403) {
    return buildAccessRequiredWatchdog();
  }

  return buildUnavailableWatchdog(
    `Operator watchdog payload invalid (HTTP ${status}).`,
  );
}

function unwrapWatchdogRun(payload: unknown): OperatorWatchdogRun | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const wrapped = payload as { run?: unknown };
  if (wrapped.run) {
    return normalizeWatchdogRun(wrapped.run);
  }

  return normalizeWatchdogRun(payload);
}

export async function fetchOperatorWatchdog(): Promise<OperatorWatchdog> {
  const res = await fetch("/api/command/watchdog", { cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  return unwrapOperatorWatchdog(json, res.status);
}

export async function runOperatorWatchdog(): Promise<OperatorWatchdogRun> {
  const res = await fetch("/api/command/watchdog", {
    method: "POST",
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  const run = unwrapWatchdogRun(json);

  if (!run) {
    throw new Error(`Operator watchdog run payload invalid (HTTP ${res.status})`);
  }

  return run;
}
