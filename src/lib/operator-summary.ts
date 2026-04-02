export type OperatorSummaryHealth =
  | "access_required"
  | "unavailable"
  | "degraded"
  | "action_required"
  | "proof_active"
  | "idle";

export interface OperatorSummaryRow {
  obligation_id: string;
  title: string;
  face: string | null;
  severity: string | null;
  due_at: string | null;
  created_at: string | null;
  age_hours: number | null;
  is_breach: boolean | null;
  economic_ref_type: string | null;
  economic_ref_id: string | null;
  location: string | null;
}

export interface OperatorSummary {
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
  live_state_health: OperatorSummaryHealth;
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

export function buildAccessRequiredSummary(): OperatorSummary {
  return {
    total_open_obligations: 0,
    needs_action_count: 0,
    at_risk_count: 0,
    late_count: 0,
    oldest_unresolved_obligation: null,
    oldest_unresolved_obligation_at: null,
    oldest_unresolved_obligation_age: null,
    recent_receipts_count: 0,
    total_receipts_count: 0,
    latest_receipt_at: null,
    live_state_health: "access_required",
    proof_lag_summary: {
      count: 0,
      label: "Access required to verify proof state.",
    },
    degraded_read_indicator: true,
    inconsistency_indicator: null,
    status_headline: "Access required",
    status_message: "Sign in to verify governed state.",
  };
}

export function buildUnavailableSummary(message = "Live state unavailable."): OperatorSummary {
  return {
    total_open_obligations: 0,
    needs_action_count: 0,
    at_risk_count: 0,
    late_count: 0,
    oldest_unresolved_obligation: null,
    oldest_unresolved_obligation_at: null,
    oldest_unresolved_obligation_age: null,
    recent_receipts_count: 0,
    total_receipts_count: 0,
    latest_receipt_at: null,
    live_state_health: "unavailable",
    proof_lag_summary: {
      count: 0,
      label: "Proof state unavailable because the read surface degraded.",
    },
    degraded_read_indicator: true,
    inconsistency_indicator: null,
    status_headline: "Live state unavailable",
    status_message: message,
  };
}

function sortOpenRows(rows: OperatorSummaryRow[]) {
  return [...rows].sort((a, b) => {
    const breachA = Boolean(a.is_breach);
    const breachB = Boolean(b.is_breach);
    if (breachA !== breachB) {
      return breachA ? -1 : 1;
    }

    const dueA = a.due_at ? new Date(a.due_at).getTime() : Number.MAX_SAFE_INTEGER;
    const dueB = b.due_at ? new Date(b.due_at).getTime() : Number.MAX_SAFE_INTEGER;

    if (dueA !== dueB) {
      return dueA - dueB;
    }

    const createdA = a.created_at ? new Date(a.created_at).getTime() : Number.MAX_SAFE_INTEGER;
    const createdB = b.created_at ? new Date(b.created_at).getTime() : Number.MAX_SAFE_INTEGER;
    return createdA - createdB;
  });
}

function buildProofLagLabel(proofLagCount: number) {
  if (proofLagCount === 0) {
    return "No proof lag detected.";
  }

  return `${proofLagCount} resolved obligation${proofLagCount === 1 ? "" : "s"} missing receipt proof.`;
}

function isAtRiskSeverity(severity: string | null) {
  return severity === "critical" || severity === "at_risk";
}

function buildHiddenOpenObligationLabel(hiddenOpenCount: number, visibleOpenCount: number) {
  const hiddenLabel = `${hiddenOpenCount} open obligation${hiddenOpenCount === 1 ? "" : "s"}`;

  if (visibleOpenCount === 0) {
    return `Visible queue is empty, but ${hiddenLabel} still exist in governed state.`;
  }

  return `${hiddenLabel} are missing from the visible operator queue.`;
}

export function buildOperatorSummary(input: {
  openRows: OperatorSummaryRow[];
  rawOpenObligationsCount: number;
  oldestUnresolvedObligationAt: string | null;
  recentReceiptsCount: number;
  totalReceiptsCount: number;
  latestReceiptAt: string | null;
  proofLagCount: number;
}): OperatorSummary {
  const orderedRows = sortOpenRows(input.openRows);
  const visibleOpenCount = orderedRows.length;
  const totalOpen = Math.max(input.rawOpenObligationsCount, visibleOpenCount);
  const hiddenOpenCount = Math.max(0, input.rawOpenObligationsCount - visibleOpenCount);
  const oldestUnresolved = orderedRows[0] ?? null;
  const lateCount = orderedRows.filter((row) => Boolean(row.is_breach)).length;
  const atRiskCount = orderedRows.filter(
    (row) => !row.is_breach && isAtRiskSeverity(row.severity),
  ).length;
  const needsActionCount = lateCount + atRiskCount;
  const inconsistencyIndicator =
    hiddenOpenCount > 0
      ? {
          kind: "hidden_open_obligations" as const,
          label: buildHiddenOpenObligationLabel(hiddenOpenCount, visibleOpenCount),
          hidden_open_obligations: hiddenOpenCount,
          visible_open_obligations: visibleOpenCount,
        }
      : null;

  let liveStateHealth: OperatorSummaryHealth;
  let statusHeadline: string;
  let statusMessage: string;

  if (inconsistencyIndicator) {
    liveStateHealth = "degraded";
    statusHeadline = "Inconsistent governed state";
    statusMessage = inconsistencyIndicator.label;
  } else if (input.proofLagCount > 0) {
    liveStateHealth = "degraded";
    statusHeadline = "Proof lag detected";
    statusMessage = buildProofLagLabel(input.proofLagCount);
  } else if (totalOpen > 0) {
    liveStateHealth = "action_required";
    if (lateCount > 0) {
      statusHeadline = "Late obligations";
      statusMessage = `${lateCount} late obligation${lateCount === 1 ? "" : "s"} require attention.`;
    } else if (atRiskCount > 0) {
      statusHeadline = "At-risk obligations";
      statusMessage = `${atRiskCount} at-risk obligation${atRiskCount === 1 ? "" : "s"} require attention.`;
    } else {
      statusHeadline = "Action required";
      statusMessage = `${totalOpen} open obligation${totalOpen === 1 ? "" : "s"} require action.`;
    }
  } else if (input.totalReceiptsCount > 0) {
    liveStateHealth = "proof_active";
    statusHeadline = "Proof activity visible";
    statusMessage =
      input.recentReceiptsCount > 0
        ? "No open obligations. Recent proof activity is visible."
        : "No open obligations. Proof history is visible in the receipt layer.";
  } else {
    liveStateHealth = "idle";
    statusHeadline = "No active duty";
    statusMessage = "No open obligations and no visible proof activity.";
  }

  return {
    total_open_obligations: totalOpen,
    needs_action_count: needsActionCount,
    at_risk_count: atRiskCount,
    late_count: lateCount,
    oldest_unresolved_obligation: oldestUnresolved,
    oldest_unresolved_obligation_at:
      input.oldestUnresolvedObligationAt ?? oldestUnresolved?.created_at ?? oldestUnresolved?.due_at ?? null,
    oldest_unresolved_obligation_age: oldestUnresolved?.age_hours ?? null,
    recent_receipts_count: input.recentReceiptsCount,
    total_receipts_count: input.totalReceiptsCount,
    latest_receipt_at: input.latestReceiptAt,
    live_state_health: liveStateHealth,
    proof_lag_summary: {
      count: input.proofLagCount,
      label: buildProofLagLabel(input.proofLagCount),
    },
    degraded_read_indicator: false,
    inconsistency_indicator: inconsistencyIndicator,
    status_headline: statusHeadline,
    status_message: statusMessage,
  };
}
