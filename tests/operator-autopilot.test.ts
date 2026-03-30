import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAccessRequiredSummary,
  buildOperatorSummary,
  buildUnavailableSummary,
  type OperatorSummaryRow,
} from "../src/lib/operator-summary";
import { buildOperatorAutopilot } from "../src/lib/operator-autopilot";
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

test("autopilot maps supported billing duties to the stripe playbook", () => {
  const summary = buildOperatorSummary({
    openRows: [summaryRow()],
    rawOpenObligationsCount: 1,
    oldestUnresolvedObligationAt: "2026-03-28T12:00:00.000Z",
    recentReceiptsCount: 0,
    totalReceiptsCount: 0,
    latestReceiptAt: null,
    proofLagCount: 0,
  });

  const autopilot = buildOperatorAutopilot({
    summary,
    rows: [queueRow()],
    generatedAt: "2026-03-30T12:00:00.000Z",
  });

  assert.equal(autopilot.mode, "action_required");
  assert.equal(autopilot.recommended_action?.playbook.source, "stripe_first_wedge_contract");
  assert.equal(autopilot.recommended_action?.playbook.source_event, "stripe.invoice.paid");
  assert.equal(autopilot.recommended_action?.playbook.receipt_type, "obligation_resolution");
  assert.match(
    autopilot.recommended_action?.playbook.operator_goal ?? "",
    /Verify the paid invoice/i,
  );
  assert.equal(autopilot.recommended_action?.escalation_required, true);
});

test("autopilot keeps access failure distinct from actionable queue state", () => {
  const autopilot = buildOperatorAutopilot({
    summary: buildAccessRequiredSummary(),
    rows: [queueRow()],
    generatedAt: "2026-03-30T12:00:00.000Z",
  });

  assert.equal(autopilot.mode, "access_required");
  assert.equal(autopilot.visible_queue_count, 0);
  assert.equal(autopilot.recommended_action, null);
  assert.equal(autopilot.watchlist.length, 0);
});

test("autopilot keeps unavailable summary distinct from empty success", () => {
  const autopilot = buildOperatorAutopilot({
    summary: buildUnavailableSummary("Projection failed."),
    rows: [queueRow()],
    generatedAt: "2026-03-30T12:00:00.000Z",
  });

  assert.equal(autopilot.mode, "unavailable");
  assert.equal(autopilot.visible_queue_count, 0);
  assert.equal(autopilot.recommended_action, null);
  assert.equal(autopilot.message, "Projection failed.");
});

test("autopilot falls back to kernel rules for non-contract obligations", () => {
  const summary = buildOperatorSummary({
    openRows: [
      summaryRow({
        obligation_id: "campaign-1",
        title: "Track campaign",
        economic_ref_type: "campaign",
        economic_ref_id: "cmp_1",
      }),
    ],
    rawOpenObligationsCount: 1,
    oldestUnresolvedObligationAt: "2026-03-28T12:00:00.000Z",
    recentReceiptsCount: 0,
    totalReceiptsCount: 0,
    latestReceiptAt: null,
    proofLagCount: 0,
  });

  const autopilot = buildOperatorAutopilot({
    summary,
    rows: [
      queueRow({
        obligation_id: "campaign-1",
        kind: "track_campaign",
        title: "Track active campaign",
        why: "Campaign results need governed review.",
        severity: "queue",
        is_breach: false,
        economic_ref_type: "campaign",
        economic_ref_id: "cmp_1",
      }),
    ],
    generatedAt: "2026-03-30T12:00:00.000Z",
  });

  assert.equal(autopilot.recommended_action?.playbook.source, "kernel_rules");
  assert.equal(autopilot.recommended_action?.playbook.object_class, "campaign");
  assert.equal(autopilot.actionable_queue_count, 0);
  assert.equal(autopilot.monitor_queue_count, 1);
});

test("autopilot separates actionable and monitor queue counts", () => {
  const summary = buildOperatorSummary({
    openRows: [
      summaryRow({ obligation_id: "late", is_breach: true, severity: "critical" }),
      summaryRow({ obligation_id: "risk", severity: "at_risk", created_at: "2026-03-28T13:00:00.000Z" }),
      summaryRow({ obligation_id: "queue", severity: "queue", created_at: "2026-03-28T14:00:00.000Z" }),
    ],
    rawOpenObligationsCount: 3,
    oldestUnresolvedObligationAt: "2026-03-28T12:00:00.000Z",
    recentReceiptsCount: 2,
    totalReceiptsCount: 2,
    latestReceiptAt: "2026-03-30T09:00:00.000Z",
    proofLagCount: 0,
  });

  const autopilot = buildOperatorAutopilot({
    summary,
    rows: [
      queueRow({ obligation_id: "late", severity: "critical", is_breach: true }),
      queueRow({ obligation_id: "risk", severity: "at_risk", is_breach: false }),
      queueRow({ obligation_id: "queue", severity: "queue", is_breach: false }),
    ],
    generatedAt: "2026-03-30T12:00:00.000Z",
  });

  assert.equal(autopilot.visible_queue_count, 3);
  assert.equal(autopilot.actionable_queue_count, 2);
  assert.equal(autopilot.monitor_queue_count, 1);
  assert.equal(autopilot.proof_activity_count, 2);
});
