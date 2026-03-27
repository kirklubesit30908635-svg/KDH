import assert from "node:assert/strict";
import test from "node:test";
import {
  CLASS_RULES,
  assertValidClassPosture,
  assertValidObligationForClass,
} from "../src/lib/kernel/rules";

// ── CLASS_RULES data integrity ────────────────────────────────────────────────

test("CLASS_RULES: every class lists its defaultObligation inside allowedObligations", () => {
  for (const [cls, rule] of Object.entries(CLASS_RULES)) {
    assert.ok(
      (rule.allowedObligations as readonly string[]).includes(rule.defaultObligation),
      `${cls}.defaultObligation "${rule.defaultObligation}" must be in allowedObligations`,
    );
  }
});

test("CLASS_RULES: every class has at least one allowed posture", () => {
  for (const [cls, rule] of Object.entries(CLASS_RULES)) {
    assert.ok(rule.allowedPostures.length > 0, `${cls} must have at least one allowed posture`);
  }
});

test("CLASS_RULES: every class has at least one allowed obligation", () => {
  for (const [cls, rule] of Object.entries(CLASS_RULES)) {
    assert.ok(rule.allowedObligations.length > 0, `${cls} must have at least one allowed obligation`);
  }
});

// ── assertValidClassPosture ───────────────────────────────────────────────────

test("assertValidClassPosture: throws for unknown kernel class", () => {
  assert.throws(
    () => assertValidClassPosture("unknown_class", "direct_revenue"),
    /unknown kernel_class: unknown_class/,
  );
});

test("assertValidClassPosture: throws for invalid posture on a known class", () => {
  assert.throws(
    () => assertValidClassPosture("invoice", "revenue_candidate"),
    /invalid kernel_class\/economic_posture: invoice\/revenue_candidate/,
  );
});

test("assertValidClassPosture: throws for empty class string", () => {
  assert.throws(
    () => assertValidClassPosture("", "direct_revenue"),
    /unknown kernel_class/,
  );
});

test("assertValidClassPosture: returns rule for invoice + direct_revenue", () => {
  const rule = assertValidClassPosture("invoice", "direct_revenue");
  assert.equal(rule.defaultObligation, "collect_payment");
});

test("assertValidClassPosture: returns rule for invoice + revenue_recovery", () => {
  const rule = assertValidClassPosture("invoice", "revenue_recovery");
  assert.ok((rule.allowedPostures as readonly string[]).includes("revenue_recovery"));
});

test("assertValidClassPosture: returns rule for invoice + cost_exposure", () => {
  const rule = assertValidClassPosture("invoice", "cost_exposure");
  assert.ok((rule.allowedPostures as readonly string[]).includes("cost_exposure"));
});

test("assertValidClassPosture: returns rule for payment + direct_revenue", () => {
  const rule = assertValidClassPosture("payment", "direct_revenue");
  assert.equal(rule.defaultObligation, "reconcile_payment");
});

test("assertValidClassPosture: returns rule for payment + revenue_recovery", () => {
  const rule = assertValidClassPosture("payment", "revenue_recovery");
  assert.ok((rule.allowedPostures as readonly string[]).includes("revenue_recovery"));
});

test("assertValidClassPosture: returns rule for lead + revenue_candidate", () => {
  const rule = assertValidClassPosture("lead", "revenue_candidate");
  assert.equal(rule.defaultObligation, "follow_up");
});

test("assertValidClassPosture: returns rule for subscription + cost_exposure", () => {
  const rule = assertValidClassPosture("subscription", "cost_exposure");
  assert.equal(rule.defaultObligation, "review_plan");
});

test("assertValidClassPosture: returns rule for job + direct_revenue", () => {
  const rule = assertValidClassPosture("job", "direct_revenue");
  assert.equal(rule.defaultObligation, "schedule_job");
});

test("assertValidClassPosture: returns rule for job + cost_exposure", () => {
  const rule = assertValidClassPosture("job", "cost_exposure");
  assert.equal(rule.defaultObligation, "schedule_job");
});

test("assertValidClassPosture: returns rule for campaign + revenue_candidate", () => {
  const rule = assertValidClassPosture("campaign", "revenue_candidate");
  assert.equal(rule.defaultObligation, "track_campaign");
});

test("assertValidClassPosture: returns rule for inspection + cost_exposure", () => {
  const rule = assertValidClassPosture("inspection", "cost_exposure");
  assert.equal(rule.defaultObligation, "complete_inspection");
});

test("assertValidClassPosture: returns rule for support_ticket + non_economic", () => {
  const rule = assertValidClassPosture("support_ticket", "non_economic");
  assert.equal(rule.defaultObligation, "respond");
});

test("assertValidClassPosture: throws when payment receives cost_exposure (not allowed)", () => {
  assert.throws(
    () => assertValidClassPosture("payment", "cost_exposure"),
    /invalid kernel_class\/economic_posture: payment\/cost_exposure/,
  );
});

// ── assertValidObligationForClass ─────────────────────────────────────────────

test("assertValidObligationForClass: throws for unknown kernel class", () => {
  assert.throws(
    () => assertValidObligationForClass("unknown_class", "collect_payment"),
    /unknown kernel_class: unknown_class/,
  );
});

test("assertValidObligationForClass: throws for invalid obligation on known class", () => {
  assert.throws(
    () => assertValidObligationForClass("invoice", "respond"),
    /invalid obligation_type for invoice: respond/,
  );
});

test("assertValidObligationForClass: throws for empty class string", () => {
  assert.throws(
    () => assertValidObligationForClass("", "collect_payment"),
    /unknown kernel_class/,
  );
});

test("assertValidObligationForClass: returns true for invoice + collect_payment", () => {
  assert.equal(assertValidObligationForClass("invoice", "collect_payment"), true);
});

test("assertValidObligationForClass: returns true for invoice + recover_payment", () => {
  assert.equal(assertValidObligationForClass("invoice", "recover_payment"), true);
});

test("assertValidObligationForClass: returns true for invoice + record_revenue", () => {
  assert.equal(assertValidObligationForClass("invoice", "record_revenue"), true);
});

test("assertValidObligationForClass: returns true for payment + respond_to_dispute", () => {
  assert.equal(assertValidObligationForClass("payment", "respond_to_dispute"), true);
});

test("assertValidObligationForClass: returns true for payment + process_refund", () => {
  assert.equal(assertValidObligationForClass("payment", "process_refund"), true);
});

test("assertValidObligationForClass: returns true for payment + recover_failed_payment", () => {
  assert.equal(assertValidObligationForClass("payment", "recover_failed_payment"), true);
});

test("assertValidObligationForClass: returns true for lead + follow_up", () => {
  assert.equal(assertValidObligationForClass("lead", "follow_up"), true);
});

test("assertValidObligationForClass: returns true for support_ticket + escalate", () => {
  assert.equal(assertValidObligationForClass("support_ticket", "escalate"), true);
});

test("assertValidObligationForClass: throws when lead tries close_payment (cross-class leak)", () => {
  assert.throws(
    () => assertValidObligationForClass("lead", "collect_payment"),
    /invalid obligation_type for lead/,
  );
});
