import type { OperatorSummary } from "@/lib/operator-summary";
import type { NextActionRow } from "@/lib/ui-models";

export type OperatorWatchdogTriggerKind =
  | "inconsistency"
  | "proof_lag"
  | "late_obligation"
  | "at_risk_obligation";

export interface OperatorWatchdogRun {
  workspace_id: string | null;
  run_at: string;
  evaluated_count: number;
  emitted_signal_count: number;
  late_count: number;
  at_risk_count: number;
  proof_lag_count: number;
  visible_open_count: number;
  raw_open_count: number;
}

export interface OperatorWatchdogTrigger {
  kind: OperatorWatchdogTriggerKind;
  headline: string;
  message: string;
  obligation_id: string | null;
  obligation_type: string | null;
  severity: string | null;
  face: string | null;
  due_at: string | null;
  location: string | null;
  escalation_required: boolean;
}

export interface OperatorWatchdog {
  generated_at: string;
  mode: OperatorSummary["live_state_health"];
  headline: string;
  message: string;
  degraded_read_indicator: boolean;
  trigger_count: number;
  late_trigger_count: number;
  at_risk_trigger_count: number;
  proof_lag_trigger_count: number;
  inconsistency_trigger_count: number;
  run: OperatorWatchdogRun | null;
  triggers: OperatorWatchdogTrigger[];
}

type BuildOperatorWatchdogInput = {
  summary: OperatorSummary;
  rows: NextActionRow[];
  run?: OperatorWatchdogRun | null;
  generatedAt?: string;
};

type RpcRunPayload = {
  workspace_id?: unknown;
  run_at?: unknown;
  evaluated_count?: unknown;
  emitted_signal_count?: unknown;
  late_count?: unknown;
  at_risk_count?: unknown;
  proof_lag_count?: unknown;
  visible_open_count?: unknown;
  raw_open_count?: unknown;
};

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function buildRowTrigger(row: NextActionRow): OperatorWatchdogTrigger | null {
  if (row.is_breach) {
    return {
      kind: "late_obligation",
      headline: row.title,
      message: row.why ?? "Late obligation requires governed operator action.",
      obligation_id: row.obligation_id,
      obligation_type: row.kind ?? null,
      severity: row.severity ?? null,
      face: row.face ?? null,
      due_at: row.due_at,
      location: row.location,
      escalation_required: true,
    };
  }

  if (row.severity === "critical" || row.severity === "at_risk") {
    return {
      kind: "at_risk_obligation",
      headline: row.title,
      message:
        row.why ??
        "At-risk obligation requires operator pressure before it breaches.",
      obligation_id: row.obligation_id,
      obligation_type: row.kind ?? null,
      severity: row.severity ?? null,
      face: row.face ?? null,
      due_at: row.due_at,
      location: row.location,
      escalation_required: true,
    };
  }

  return null;
}

export function buildUnavailableWatchdog(message = "Watchdog unavailable because the read surface degraded."): OperatorWatchdog {
  return {
    generated_at: new Date().toISOString(),
    mode: "unavailable",
    headline: "Watchdog unavailable",
    message,
    degraded_read_indicator: true,
    trigger_count: 0,
    late_trigger_count: 0,
    at_risk_trigger_count: 0,
    proof_lag_trigger_count: 0,
    inconsistency_trigger_count: 0,
    run: null,
    triggers: [],
  };
}

export function buildAccessRequiredWatchdog(message = "Sign in to evaluate watchdog state."): OperatorWatchdog {
  return {
    generated_at: new Date().toISOString(),
    mode: "access_required",
    headline: "Access required",
    message,
    degraded_read_indicator: true,
    trigger_count: 0,
    late_trigger_count: 0,
    at_risk_trigger_count: 0,
    proof_lag_trigger_count: 0,
    inconsistency_trigger_count: 0,
    run: null,
    triggers: [],
  };
}

export function normalizeWatchdogRun(value: unknown): OperatorWatchdogRun | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const run = value as RpcRunPayload;
  if (typeof run.run_at !== "string") {
    return null;
  }

  return {
    workspace_id: typeof run.workspace_id === "string" ? run.workspace_id : null,
    run_at: run.run_at,
    evaluated_count: asNumber(run.evaluated_count),
    emitted_signal_count: asNumber(run.emitted_signal_count),
    late_count: asNumber(run.late_count),
    at_risk_count: asNumber(run.at_risk_count),
    proof_lag_count: asNumber(run.proof_lag_count),
    visible_open_count: asNumber(run.visible_open_count),
    raw_open_count: asNumber(run.raw_open_count),
  };
}

export function buildOperatorWatchdog({
  summary,
  rows,
  run = null,
  generatedAt = new Date().toISOString(),
}: BuildOperatorWatchdogInput): OperatorWatchdog {
  if (summary.live_state_health === "access_required") {
    return buildAccessRequiredWatchdog(summary.status_message);
  }

  if (summary.live_state_health === "unavailable") {
    return buildUnavailableWatchdog(summary.status_message);
  }

  const triggers: OperatorWatchdogTrigger[] = [];

  if (summary.inconsistency_indicator) {
    triggers.push({
      kind: "inconsistency",
      headline: "Inconsistent governed state",
      message: summary.inconsistency_indicator.label,
      obligation_id: null,
      obligation_type: null,
      severity: null,
      face: null,
      due_at: null,
      location: null,
      escalation_required: true,
    });
  }

  if (summary.proof_lag_summary.count > 0) {
    triggers.push({
      kind: "proof_lag",
      headline: "Proof lag detected",
      message: summary.proof_lag_summary.label,
      obligation_id: null,
      obligation_type: null,
      severity: null,
      face: null,
      due_at: null,
      location: "/command/receipts",
      escalation_required: true,
    });
  }

  for (const row of rows) {
    const trigger = buildRowTrigger(row);
    if (trigger) {
      triggers.push(trigger);
    }
  }

  const lateTriggerCount = triggers.filter((trigger) => trigger.kind === "late_obligation").length;
  const atRiskTriggerCount = triggers.filter((trigger) => trigger.kind === "at_risk_obligation").length;
  const proofLagTriggerCount = triggers.filter((trigger) => trigger.kind === "proof_lag").length;
  const inconsistencyTriggerCount = triggers.filter((trigger) => trigger.kind === "inconsistency").length;

  let headline = "Watchdog nominal";
  let message = "No late or at-risk obligations require watchdog escalation right now.";

  if (inconsistencyTriggerCount > 0 || proofLagTriggerCount > 0) {
    headline = "Watchdog degraded";
    message = summary.status_message;
  } else if (lateTriggerCount > 0) {
    headline = "Late obligation pressure";
    message = `${lateTriggerCount} late obligation${lateTriggerCount === 1 ? "" : "s"} need watchdog pressure.`;
  } else if (atRiskTriggerCount > 0) {
    headline = "At-risk obligation pressure";
    message = `${atRiskTriggerCount} at-risk obligation${atRiskTriggerCount === 1 ? "" : "s"} should be escalated before breach.`;
  } else if (summary.live_state_health === "proof_active") {
    headline = "Proof active";
    message = summary.status_message;
  } else if (summary.live_state_health === "idle") {
    headline = "Watchdog nominal";
    message = "No open obligations and no active watchdog pressure.";
  }

  return {
    generated_at: generatedAt,
    mode: summary.live_state_health,
    headline,
    message,
    degraded_read_indicator: summary.degraded_read_indicator,
    trigger_count: triggers.length,
    late_trigger_count: lateTriggerCount,
    at_risk_trigger_count: atRiskTriggerCount,
    proof_lag_trigger_count: proofLagTriggerCount,
    inconsistency_trigger_count: inconsistencyTriggerCount,
    run,
    triggers: triggers.slice(0, 8),
  };
}
