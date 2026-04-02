import {
  CLASS_RULES,
  type KernelClass,
} from "@/lib/kernel/rules";
import type {
  OperatorSummary,
  OperatorSummaryHealth,
} from "@/lib/operator-summary";
import {
  stripe_first_wedge_contract,
  type StripeFirstWedgeContractRow,
} from "@/lib/stripe_first_wedge_contract";
import type { NextActionRow } from "@/lib/ui-models";

export type OperatorAutopilotPlaybookSource =
  | "stripe_first_wedge_contract"
  | "kernel_rules"
  | "generic";

export interface OperatorAutopilotPlaybook {
  source: OperatorAutopilotPlaybookSource;
  obligation_type: string | null;
  object_class: string | null;
  movement_type: string | null;
  source_event: string | null;
  action_label: string;
  operator_goal: string;
  proof_requirement: string;
  receipt_type: string;
  lag_signal: string;
  failure_signal: string;
  steps: string[];
}

export interface OperatorAutopilotRecommendation {
  obligation_id: string;
  title: string;
  why: string | null;
  obligation_type: string | null;
  face: string | null;
  severity: string | null;
  due_at: string | null;
  age_hours: number | null;
  is_breach: boolean;
  economic_ref_type: string | null;
  economic_ref_id: string | null;
  location: string | null;
  priority_bucket: "late" | "at_risk" | "queue";
  escalation_required: boolean;
  escalation_reason: string | null;
  playbook: OperatorAutopilotPlaybook;
}

export interface OperatorAutopilot {
  generated_at: string;
  mode: OperatorSummaryHealth;
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

type BuildOperatorAutopilotInput = {
  summary: OperatorSummary;
  rows: NextActionRow[];
  generatedAt?: string;
};

type KernelPlaybookMatch = {
  kernelClass: KernelClass;
  defaultObligation: string;
};

function isActionableRow(row: NextActionRow) {
  return Boolean(row.is_breach) || row.severity === "critical" || row.severity === "at_risk";
}

function priorityBucket(row: NextActionRow): OperatorAutopilotRecommendation["priority_bucket"] {
  if (row.is_breach) {
    return "late";
  }

  if (row.severity === "critical" || row.severity === "at_risk") {
    return "at_risk";
  }

  return "queue";
}

function escalationReason(row: NextActionRow) {
  if (row.is_breach) {
    return "Past due in governed state. Treat as active escalation, not routine backlog.";
  }

  if (row.severity === "critical") {
    return "Critical queue severity detected. Handle before it hardens into breach.";
  }

  if (row.severity === "at_risk") {
    return "At-risk queue severity detected. Act before the duty breaches.";
  }

  return null;
}

function humanizeToken(value: string | null | undefined, fallback: string) {
  if (!value) {
    return fallback;
  }

  return value.replace(/_/g, " ");
}

function actionLabelForObligation(obligationType: string | null | undefined) {
  switch (obligationType) {
    case "activate_operator_access":
      return "Grant operator access";
    case "record_revenue":
      return "Record governed revenue";
    case "recover_payment":
      return "Recover failed payment";
    case "respond_to_dispute":
      return "Submit dispute response";
    case "process_refund":
      return "Finalize refund proof";
    default:
      return `Resolve ${humanizeToken(obligationType, "obligation")}`;
  }
}

function inferKernelPlaybook(obligationType: string | null | undefined): KernelPlaybookMatch | null {
  if (!obligationType) {
    return null;
  }

  for (const [kernelClass, rule] of Object.entries(CLASS_RULES) as Array<
    [KernelClass, (typeof CLASS_RULES)[KernelClass]]
  >) {
    if ((rule.allowedObligations as readonly string[]).includes(obligationType)) {
      return {
        kernelClass,
        defaultObligation: rule.defaultObligation,
      };
    }
  }

  return null;
}

function contractRowForObligation(
  obligationType: string | null | undefined,
): StripeFirstWedgeContractRow | null {
  if (!obligationType) {
    return null;
  }

  return (
    stripe_first_wedge_contract.contract_rows.find(
      (row) => !row.unsupported_or_deferred && row.obligation_type === obligationType,
    ) ?? null
  );
}

function buildProofRequirement(row: StripeFirstWedgeContractRow) {
  const minimumFields = row.receipt_minimum_fields;
  const mustInclude = minimumFields
    .filter((field) =>
      ["reason_code", "proof_ref", "occurred_at", "recorded_at"].includes(field),
    )
    .join(", ");

  const suffix = mustInclude
    ? ` Proof must carry ${mustInclude}.`
    : "";

  return `Emit ${row.required_receipt_type} proof for the governed transition.${suffix}`;
}

function buildGenericProofRequirement(obligationType: string | null | undefined) {
  return `Close ${humanizeToken(obligationType, "the governed duty")} through the governed command path so receipt proof is emitted.`;
}

function buildPlaybook(row: NextActionRow): OperatorAutopilotPlaybook {
  const obligationType = row.kind ?? null;
  const contractRow = contractRowForObligation(obligationType);

  if (contractRow) {
    return {
      source: "stripe_first_wedge_contract",
      obligation_type: contractRow.obligation_type,
      object_class: contractRow.object_class,
      movement_type: contractRow.movement_type,
      source_event: contractRow.source_event,
      action_label: actionLabelForObligation(contractRow.obligation_type),
      operator_goal: contractRow.required_operator_action,
      proof_requirement: buildProofRequirement(contractRow),
      receipt_type: contractRow.required_receipt_type,
      lag_signal: contractRow.signal_on_lag,
      failure_signal: contractRow.signal_on_failure,
      steps: [
        `Confirm the governed ${humanizeToken(contractRow.object_class, "object")} identity and supporting economic reference.`,
        contractRow.required_operator_action,
        `Emit ${contractRow.required_receipt_type} proof through the governed closure path.`,
      ],
    };
  }

  const kernelMatch = inferKernelPlaybook(obligationType);
  if (kernelMatch) {
    return {
      source: "kernel_rules",
      obligation_type: obligationType,
      object_class: kernelMatch.kernelClass,
      movement_type: null,
      source_event: null,
      action_label: actionLabelForObligation(obligationType),
      operator_goal: `Advance the governed ${humanizeToken(kernelMatch.kernelClass, "object")} duty and capture explicit closure proof.`,
      proof_requirement: buildGenericProofRequirement(obligationType),
      receipt_type: "obligation_resolution",
      lag_signal: `${humanizeToken(obligationType, "This obligation")} should escalate when it remains open past its governed due window.`,
      failure_signal: `${humanizeToken(obligationType, "This obligation")} must never resolve silently; record explicit reason and proof.`,
      steps: [
        `Review the governed ${humanizeToken(kernelMatch.kernelClass, "object")} and the open ${humanizeToken(obligationType, "obligation")}.`,
        `Perform the required operator action for ${humanizeToken(obligationType, "the duty")}.`,
        "Close through the governed command path so receipt proof is emitted.",
      ],
    };
  }

  return {
    source: "generic",
    obligation_type: obligationType,
    object_class: row.economic_ref_type ?? null,
    movement_type: null,
    source_event: null,
    action_label: actionLabelForObligation(obligationType),
    operator_goal: `Resolve ${humanizeToken(obligationType, "the governed obligation")} against the live economic reference and record closure proof.`,
    proof_requirement: buildGenericProofRequirement(obligationType),
    receipt_type: "obligation_resolution",
    lag_signal: "If this obligation ages without movement, escalate it as operator pressure rather than letting it disappear into backlog.",
    failure_signal: "If resolution cannot complete, record the blocker explicitly instead of implying a clear state.",
    steps: [
      "Confirm the governed reference and current duty.",
      `Resolve ${humanizeToken(obligationType, "the obligation")} or capture the blocker explicitly.`,
      "Close through the governed command path so receipt proof is emitted.",
    ],
  };
}

function buildRecommendation(row: NextActionRow): OperatorAutopilotRecommendation {
  return {
    obligation_id: row.obligation_id,
    title: row.title,
    why: row.why,
    obligation_type: row.kind ?? null,
    face: row.face ?? null,
    severity: row.severity ?? null,
    due_at: row.due_at,
    age_hours: row.age_hours,
    is_breach: Boolean(row.is_breach),
    economic_ref_type: row.economic_ref_type ?? null,
    economic_ref_id: row.economic_ref_id,
    location: row.location,
    priority_bucket: priorityBucket(row),
    escalation_required: isActionableRow(row),
    escalation_reason: escalationReason(row),
    playbook: buildPlaybook(row),
  };
}

export function buildAccessRequiredAutopilot(message = "Sign in to load governed recommendations."): OperatorAutopilot {
  return {
    generated_at: new Date().toISOString(),
    mode: "access_required",
    headline: "Access required",
    message,
    degraded_read_indicator: true,
    visible_queue_count: 0,
    actionable_queue_count: 0,
    monitor_queue_count: 0,
    proof_activity_count: 0,
    recommended_action: null,
    watchlist: [],
  };
}

export function buildUnavailableAutopilot(message = "Autopilot unavailable because the read surface degraded."): OperatorAutopilot {
  return {
    generated_at: new Date().toISOString(),
    mode: "unavailable",
    headline: "Autopilot unavailable",
    message,
    degraded_read_indicator: true,
    visible_queue_count: 0,
    actionable_queue_count: 0,
    monitor_queue_count: 0,
    proof_activity_count: 0,
    recommended_action: null,
    watchlist: [],
  };
}

export function buildOperatorAutopilot({
  summary,
  rows,
  generatedAt = new Date().toISOString(),
}: BuildOperatorAutopilotInput): OperatorAutopilot {
  const suppressQueue =
    summary.live_state_health === "access_required" || summary.live_state_health === "unavailable";
  const visibleRows = suppressQueue ? [] : rows;
  const actionableRows = visibleRows.filter(isActionableRow);
  const recommendations = visibleRows.map(buildRecommendation);

  return {
    generated_at: generatedAt,
    mode: summary.live_state_health,
    headline: summary.status_headline,
    message: summary.status_message,
    degraded_read_indicator: summary.degraded_read_indicator,
    visible_queue_count: visibleRows.length,
    actionable_queue_count: actionableRows.length,
    monitor_queue_count: Math.max(0, visibleRows.length - actionableRows.length),
    proof_activity_count: summary.recent_receipts_count,
    recommended_action: recommendations[0] ?? null,
    watchlist: recommendations.slice(0, 3),
  };
}
