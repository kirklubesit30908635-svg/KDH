import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAccessRequiredSummary,
  buildOperatorSummary,
  buildUnavailableSummary,
  type OperatorSummaryRow,
} from "../src/lib/operator-summary";

function row(overrides: Partial<OperatorSummaryRow> = {}): OperatorSummaryRow {
  return {
    obligation_id: "obligation-1",
    title: "Open duty",
    face: "billing",
    severity: "queue",
    due_at: "2026-03-29T12:00:00.000Z",
    created_at: "2026-03-28T12:00:00.000Z",
    age_hours: 24,
    is_breach: false,
    economic_ref_type: "invoice",
    economic_ref_id: "inv_1",
    location: "/command",
    ...overrides,
  };
}

test("open obligations cannot render as clear", () => {
  const summary = buildOperatorSummary({
    openRows: [row()],
    rawOpenObligationsCount: 1,
    oldestUnresolvedObligationAt: "2026-03-28T12:00:00.000Z",
    recentReceiptsCount: 0,
    totalReceiptsCount: 0,
    latestReceiptAt: null,
    proofLagCount: 0,
  });

  assert.equal(summary.live_state_health, "action_required");
  assert.notEqual(summary.live_state_health, "idle");
});

test("needs_action_count only counts late and at-risk pressure", () => {
  const summary = buildOperatorSummary({
    openRows: [
      row({ obligation_id: "late", is_breach: true, severity: "critical" }),
      row({ obligation_id: "risk", severity: "at_risk", created_at: "2026-03-28T13:00:00.000Z" }),
      row({ obligation_id: "queue", severity: "queue", created_at: "2026-03-28T14:00:00.000Z" }),
    ],
    rawOpenObligationsCount: 3,
    oldestUnresolvedObligationAt: "2026-03-28T12:00:00.000Z",
    recentReceiptsCount: 0,
    totalReceiptsCount: 0,
    latestReceiptAt: null,
    proofLagCount: 0,
  });

  assert.equal(summary.total_open_obligations, 3);
  assert.equal(summary.late_count, 1);
  assert.equal(summary.at_risk_count, 1);
  assert.equal(summary.needs_action_count, 2);
});

test("breached obligations sort ahead of earlier non-breached duty", () => {
  const summary = buildOperatorSummary({
    openRows: [
      row({
        obligation_id: "non-breach",
        is_breach: false,
        due_at: "2026-03-27T12:00:00.000Z",
        created_at: "2026-03-27T12:00:00.000Z",
      }),
      row({
        obligation_id: "breach",
        is_breach: true,
        severity: "critical",
        due_at: "2026-03-30T12:00:00.000Z",
        created_at: "2026-03-29T08:00:00.000Z",
      }),
    ],
    rawOpenObligationsCount: 2,
    oldestUnresolvedObligationAt: "2026-03-27T12:00:00.000Z",
    recentReceiptsCount: 0,
    totalReceiptsCount: 0,
    latestReceiptAt: null,
    proofLagCount: 0,
  });

  assert.equal(summary.oldest_unresolved_obligation?.obligation_id, "breach");
});

test("receipts without open obligations render proof_active, not idle", () => {
  const summary = buildOperatorSummary({
    openRows: [],
    rawOpenObligationsCount: 0,
    oldestUnresolvedObligationAt: null,
    recentReceiptsCount: 1,
    totalReceiptsCount: 4,
    latestReceiptAt: "2026-03-29T12:00:00.000Z",
    proofLagCount: 0,
  });

  assert.equal(summary.live_state_health, "proof_active");
  assert.equal(summary.total_receipts_count, 4);
  assert.notEqual(summary.live_state_health, "idle");
});

test("hidden obligations force degraded state and inconsistency indicator", () => {
  const summary = buildOperatorSummary({
    openRows: [],
    rawOpenObligationsCount: 2,
    oldestUnresolvedObligationAt: "2026-03-28T11:00:00.000Z",
    recentReceiptsCount: 0,
    totalReceiptsCount: 1,
    latestReceiptAt: "2026-03-29T10:00:00.000Z",
    proofLagCount: 0,
  });

  assert.equal(summary.live_state_health, "degraded");
  assert.equal(summary.inconsistency_indicator?.hidden_open_obligations, 2);
  assert.equal(summary.degraded_read_indicator, false);
});

test("query failure renders unavailable, not empty success", () => {
  const summary = buildUnavailableSummary("Projection failed.");

  assert.equal(summary.live_state_health, "unavailable");
  assert.equal(summary.degraded_read_indicator, true);
  assert.equal(summary.status_message, "Projection failed.");
});

test("auth failure renders access_required, not clear", () => {
  const summary = buildAccessRequiredSummary();

  assert.equal(summary.live_state_health, "access_required");
  assert.equal(summary.degraded_read_indicator, true);
  assert.notEqual(summary.live_state_health, "idle");
});
