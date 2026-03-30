import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAccessRequiredSummary,
  buildOperatorSummary,
  buildUnavailableSummary,
  type OperatorSummaryRow,
} from "../src/lib/operator-summary";
import {
  buildOperatorWatchdog,
  normalizeWatchdogRun,
} from "../src/lib/operator-watchdog";
import type { NextActionRow } from "../src/lib/ui-models";

function summaryRow(overrides: Partial<OperatorSummaryRow> = {}): OperatorSummaryRow {
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

function queueRow(overrides: Partial<NextActionRow> = {}): NextActionRow {
  return {
    obligation_id: "obligation-1",
    object_id: "object-1",
    kind: "record_revenue",
    status: "open",
    priority: "critical",
    title: "Record paid invoice",
    why: "A verified invoice was paid and must be posted.",
    face: "billing",
    severity: "critical",
    due_at: "2026-03-29T12:00:00.000Z",
    created_at: "2026-03-28T12:00:00.000Z",
    age_hours: 24,
    is_breach: true,
    economic_ref_type: "invoice",
    economic_ref_id: "inv_1",
    location: "/command",
    ...overrides,
  };
}

test("watchdog surfaces late, proof-lag, and inconsistency triggers from governed state", () => {
  const summary = buildOperatorSummary({
    openRows: [summaryRow({ is_breach: true, severity: "critical" })],
    rawOpenObligationsCount: 2,
    oldestUnresolvedObligationAt: "2026-03-28T12:00:00.000Z",
    recentReceiptsCount: 0,
    totalReceiptsCount: 1,
    latestReceiptAt: "2026-03-30T09:00:00.000Z",
    proofLagCount: 1,
  });

  const watchdog = buildOperatorWatchdog({
    summary,
    rows: [queueRow({ is_breach: true, severity: "critical" })],
    generatedAt: "2026-03-30T12:00:00.000Z",
  });

  assert.equal(watchdog.headline, "Watchdog degraded");
  assert.equal(watchdog.trigger_count, 3);
  assert.equal(watchdog.late_trigger_count, 1);
  assert.equal(watchdog.proof_lag_trigger_count, 1);
  assert.equal(watchdog.inconsistency_trigger_count, 1);
});

test("watchdog reports nominal when there is no governed pressure", () => {
  const summary = buildOperatorSummary({
    openRows: [],
    rawOpenObligationsCount: 0,
    oldestUnresolvedObligationAt: null,
    recentReceiptsCount: 0,
    totalReceiptsCount: 0,
    latestReceiptAt: null,
    proofLagCount: 0,
  });

  const watchdog = buildOperatorWatchdog({
    summary,
    rows: [],
    generatedAt: "2026-03-30T12:00:00.000Z",
  });

  assert.equal(watchdog.headline, "Watchdog nominal");
  assert.equal(watchdog.trigger_count, 0);
});

test("watchdog access and unavailable states do not invent trigger sets", () => {
  const accessWatchdog = buildOperatorWatchdog({
    summary: buildAccessRequiredSummary(),
    rows: [queueRow()],
    generatedAt: "2026-03-30T12:00:00.000Z",
  });
  const unavailableWatchdog = buildOperatorWatchdog({
    summary: buildUnavailableSummary("Projection failed."),
    rows: [queueRow()],
    generatedAt: "2026-03-30T12:00:00.000Z",
  });

  assert.equal(accessWatchdog.mode, "access_required");
  assert.equal(accessWatchdog.trigger_count, 0);
  assert.equal(unavailableWatchdog.mode, "unavailable");
  assert.equal(unavailableWatchdog.trigger_count, 0);
});

test("normalizeWatchdogRun accepts the governed rpc payload", () => {
  const run = normalizeWatchdogRun({
    workspace_id: "workspace-1",
    run_at: "2026-03-30T12:00:00.000Z",
    evaluated_count: 4,
    emitted_signal_count: 2,
    late_count: 1,
    at_risk_count: 1,
    proof_lag_count: 0,
    visible_open_count: 4,
    raw_open_count: 4,
  });

  assert.deepEqual(run, {
    workspace_id: "workspace-1",
    run_at: "2026-03-30T12:00:00.000Z",
    evaluated_count: 4,
    emitted_signal_count: 2,
    late_count: 1,
    at_risk_count: 1,
    proof_lag_count: 0,
    visible_open_count: 4,
    raw_open_count: 4,
  });
});
