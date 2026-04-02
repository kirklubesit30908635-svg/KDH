import assert from "node:assert/strict";
import test from "node:test";
import {
  stripe_first_wedge_contract,
  canonicalizeStripeFirstWedgeSourceEvent,
  getStripeFirstWedgeContractRow,
  classifyStripeFirstWedgeSourceEvent,
  supportedStripeFirstWedgeRows,
  deferredStripeFirstWedgeRows,
  supportedStripeFirstWedgeSourceEvents,
  supportedOrDeferredStripeFirstWedgeSourceEvents,
  supportedStripeFirstWedgeObligationTypes,
  isSupportedStripeFirstWedgeObligationType,
  stripStripeSourcePrefix,
} from "../src/lib/stripe_first_wedge_contract";

// ── canonicalizeStripeFirstWedgeSourceEvent ───────────────────────────────────

test("canonicalizeStripeFirstWedgeSourceEvent: adds stripe. prefix when missing", () => {
  assert.equal(
    canonicalizeStripeFirstWedgeSourceEvent("invoice.paid"),
    "stripe.invoice.paid",
  );
});

test("canonicalizeStripeFirstWedgeSourceEvent: keeps existing stripe. prefix unchanged", () => {
  assert.equal(
    canonicalizeStripeFirstWedgeSourceEvent("stripe.invoice.paid"),
    "stripe.invoice.paid",
  );
});

test("canonicalizeStripeFirstWedgeSourceEvent: handles empty string", () => {
  assert.equal(canonicalizeStripeFirstWedgeSourceEvent(""), "stripe.");
});

// ── getStripeFirstWedgeContractRow ────────────────────────────────────────────

test("getStripeFirstWedgeContractRow: returns null for unknown event", () => {
  assert.equal(getStripeFirstWedgeContractRow("payment_intent.created"), null);
});

test("getStripeFirstWedgeContractRow: returns row for stripe.invoice.paid", () => {
  const row = getStripeFirstWedgeContractRow("stripe.invoice.paid");
  assert.notEqual(row, null);
  assert.equal(row!.obligation_type, "record_revenue");
  assert.equal(row!.movement_type, "invoice_paid");
  assert.equal(row!.object_class, "invoice");
});

test("getStripeFirstWedgeContractRow: returns row for invoice.paid (without prefix)", () => {
  const row = getStripeFirstWedgeContractRow("invoice.paid");
  assert.notEqual(row, null);
  assert.equal(row!.obligation_type, "record_revenue");
});

test("getStripeFirstWedgeContractRow: returns row for stripe.invoice.payment_failed", () => {
  const row = getStripeFirstWedgeContractRow("stripe.invoice.payment_failed");
  assert.notEqual(row, null);
  assert.equal(row!.obligation_type, "recover_payment");
  assert.equal(row!.movement_type, "invoice_payment_failed");
});

test("getStripeFirstWedgeContractRow: returns row for stripe.charge.dispute.created", () => {
  const row = getStripeFirstWedgeContractRow("stripe.charge.dispute.created");
  assert.notEqual(row, null);
  assert.equal(row!.obligation_type, "respond_to_dispute");
  assert.equal(row!.movement_type, "charge_dispute_created");
  assert.equal(row!.object_class, "payment");
});

test("getStripeFirstWedgeContractRow: returns row for stripe.charge.refunded", () => {
  const row = getStripeFirstWedgeContractRow("stripe.charge.refunded");
  assert.notEqual(row, null);
  assert.equal(row!.obligation_type, "process_refund");
  assert.equal(row!.movement_type, "charge_refunded");
});

test("getStripeFirstWedgeContractRow: returns deferred row for stripe.customer.subscription.created", () => {
  const row = getStripeFirstWedgeContractRow("stripe.customer.subscription.created");
  assert.notEqual(row, null);
  assert.equal(row!.obligation_type, "deferred");
  assert.ok(row!.unsupported_or_deferred);
});

test("getStripeFirstWedgeContractRow: returns deferred row for stripe.customer.subscription.deleted", () => {
  const row = getStripeFirstWedgeContractRow("stripe.customer.subscription.deleted");
  assert.notEqual(row, null);
  assert.equal(row!.obligation_type, "deferred");
  assert.ok(row!.unsupported_or_deferred);
});

// ── classifyStripeFirstWedgeSourceEvent ───────────────────────────────────────

test("classifyStripeFirstWedgeSourceEvent: invoice.paid is supported", () => {
  const result = classifyStripeFirstWedgeSourceEvent("invoice.paid");
  assert.equal(result.disposition, "supported");
  assert.equal(result.canonicalSourceEvent, "stripe.invoice.paid");
  assert.notEqual(result.row, null);
});

test("classifyStripeFirstWedgeSourceEvent: stripe.invoice.paid is supported (with prefix)", () => {
  const result = classifyStripeFirstWedgeSourceEvent("stripe.invoice.paid");
  assert.equal(result.disposition, "supported");
  assert.equal(result.canonicalSourceEvent, "stripe.invoice.paid");
});

test("classifyStripeFirstWedgeSourceEvent: invoice.payment_failed is supported", () => {
  const result = classifyStripeFirstWedgeSourceEvent("invoice.payment_failed");
  assert.equal(result.disposition, "supported");
  assert.equal(result.row!.obligation_type, "recover_payment");
});

test("classifyStripeFirstWedgeSourceEvent: charge.dispute.created is supported", () => {
  const result = classifyStripeFirstWedgeSourceEvent("charge.dispute.created");
  assert.equal(result.disposition, "supported");
  assert.equal(result.row!.obligation_type, "respond_to_dispute");
});

test("classifyStripeFirstWedgeSourceEvent: charge.refunded is supported", () => {
  const result = classifyStripeFirstWedgeSourceEvent("charge.refunded");
  assert.equal(result.disposition, "supported");
  assert.equal(result.row!.obligation_type, "process_refund");
});

test("classifyStripeFirstWedgeSourceEvent: customer.subscription.created is deferred", () => {
  const result = classifyStripeFirstWedgeSourceEvent("customer.subscription.created");
  assert.equal(result.disposition, "deferred");
  assert.notEqual(result.row, null);
});

test("classifyStripeFirstWedgeSourceEvent: customer.subscription.deleted is deferred", () => {
  const result = classifyStripeFirstWedgeSourceEvent("customer.subscription.deleted");
  assert.equal(result.disposition, "deferred");
  assert.notEqual(result.row, null);
});

test("classifyStripeFirstWedgeSourceEvent: unknown event is unsupported", () => {
  const result = classifyStripeFirstWedgeSourceEvent("payment_intent.created");
  assert.equal(result.disposition, "unsupported");
  assert.equal(result.row, null);
  assert.equal(result.canonicalSourceEvent, "stripe.payment_intent.created");
});

test("classifyStripeFirstWedgeSourceEvent: completely random event is unsupported", () => {
  const result = classifyStripeFirstWedgeSourceEvent("not.a.real.event");
  assert.equal(result.disposition, "unsupported");
  assert.equal(result.row, null);
});

// ── derived export lists ──────────────────────────────────────────────────────

test("supportedStripeFirstWedgeRows: contains exactly 5 supported rows", () => {
  assert.equal(supportedStripeFirstWedgeRows.length, 5);
});

test("supportedStripeFirstWedgeRows: all rows have null unsupported_or_deferred", () => {
  for (const row of supportedStripeFirstWedgeRows) {
    assert.equal(row.unsupported_or_deferred, null);
  }
});

test("supportedStripeFirstWedgeRows: includes invoice_paid row", () => {
  const found = supportedStripeFirstWedgeRows.find((r) => r.movement_type === "invoice_paid");
  assert.notEqual(found, undefined);
});

test("supportedStripeFirstWedgeRows: includes invoice_payment_failed row", () => {
  const found = supportedStripeFirstWedgeRows.find((r) => r.movement_type === "invoice_payment_failed");
  assert.notEqual(found, undefined);
});

test("supportedStripeFirstWedgeRows: includes charge_dispute_created row", () => {
  const found = supportedStripeFirstWedgeRows.find((r) => r.movement_type === "charge_dispute_created");
  assert.notEqual(found, undefined);
});

test("supportedStripeFirstWedgeRows: includes charge_refunded row", () => {
  const found = supportedStripeFirstWedgeRows.find((r) => r.movement_type === "charge_refunded");
  assert.notEqual(found, undefined);
});

test("deferredStripeFirstWedgeRows: contains exactly 2 deferred rows", () => {
  assert.equal(deferredStripeFirstWedgeRows.length, 2);
});

test("deferredStripeFirstWedgeRows: all rows have non-null unsupported_or_deferred", () => {
  for (const row of deferredStripeFirstWedgeRows) {
    assert.ok(row.unsupported_or_deferred, "deferred row must have a reason");
  }
});

test("supportedStripeFirstWedgeSourceEvents: contains 5 source events", () => {
  assert.equal(supportedStripeFirstWedgeSourceEvents.length, 5);
});

test("supportedStripeFirstWedgeSourceEvents: contains stripe.invoice.paid", () => {
  assert.ok(supportedStripeFirstWedgeSourceEvents.includes("stripe.invoice.paid"));
});

test("supportedStripeFirstWedgeSourceEvents: contains stripe.charge.dispute.created", () => {
  assert.ok(supportedStripeFirstWedgeSourceEvents.includes("stripe.charge.dispute.created"));
});

test("supportedOrDeferredStripeFirstWedgeSourceEvents: has 7 total events", () => {
  assert.equal(supportedOrDeferredStripeFirstWedgeSourceEvents.length, 7);
});

test("supportedOrDeferredStripeFirstWedgeSourceEvents: includes deferred events", () => {
  assert.ok(
    supportedOrDeferredStripeFirstWedgeSourceEvents.includes("stripe.customer.subscription.created"),
  );
  assert.ok(
    supportedOrDeferredStripeFirstWedgeSourceEvents.includes("stripe.customer.subscription.deleted"),
  );
});

// ── isSupportedStripeFirstWedgeObligationType ─────────────────────────────────

test("isSupportedStripeFirstWedgeObligationType: returns true for record_revenue", () => {
  assert.equal(isSupportedStripeFirstWedgeObligationType("record_revenue"), true);
});

test("isSupportedStripeFirstWedgeObligationType: returns true for recover_payment", () => {
  assert.equal(isSupportedStripeFirstWedgeObligationType("recover_payment"), true);
});

test("isSupportedStripeFirstWedgeObligationType: returns true for respond_to_dispute", () => {
  assert.equal(isSupportedStripeFirstWedgeObligationType("respond_to_dispute"), true);
});

test("isSupportedStripeFirstWedgeObligationType: returns true for process_refund", () => {
  assert.equal(isSupportedStripeFirstWedgeObligationType("process_refund"), true);
});

test("isSupportedStripeFirstWedgeObligationType: returns false for null", () => {
  assert.equal(isSupportedStripeFirstWedgeObligationType(null), false);
});

test("isSupportedStripeFirstWedgeObligationType: returns false for undefined", () => {
  assert.equal(isSupportedStripeFirstWedgeObligationType(undefined), false);
});

test("isSupportedStripeFirstWedgeObligationType: returns false for empty string", () => {
  assert.equal(isSupportedStripeFirstWedgeObligationType(""), false);
});

test("isSupportedStripeFirstWedgeObligationType: returns false for deferred", () => {
  assert.equal(isSupportedStripeFirstWedgeObligationType("deferred"), false);
});

test("isSupportedStripeFirstWedgeObligationType: returns false for unknown obligation", () => {
  assert.equal(isSupportedStripeFirstWedgeObligationType("collect_payment"), false);
});

// ── supportedStripeFirstWedgeObligationTypes ──────────────────────────────────

test("supportedStripeFirstWedgeObligationTypes: all are unique (no duplicates)", () => {
  const set = new Set(supportedStripeFirstWedgeObligationTypes);
  assert.equal(set.size, supportedStripeFirstWedgeObligationTypes.length);
});

// ── stripStripeSourcePrefix ───────────────────────────────────────────────────

test("stripStripeSourcePrefix: removes stripe. prefix", () => {
  assert.equal(stripStripeSourcePrefix("stripe.invoice.paid"), "invoice.paid");
});

test("stripStripeSourcePrefix: no-op when prefix is absent", () => {
  assert.equal(stripStripeSourcePrefix("invoice.paid"), "invoice.paid");
});

test("stripStripeSourcePrefix: handles stripe. only", () => {
  assert.equal(stripStripeSourcePrefix("stripe."), "");
});

test("stripStripeSourcePrefix: does not strip embedded stripe. occurrences", () => {
  assert.equal(stripStripeSourcePrefix("stripe.charge.stripe.test"), "charge.stripe.test");
});

// ── stripe_first_wedge_contract structure ────────────────────────────────────

test("stripe_first_wedge_contract: has 7 contract rows total", () => {
  assert.equal(stripe_first_wedge_contract.contract_rows.length, 7);
});

test("stripe_first_wedge_contract: every row has required_receipt_type", () => {
  for (const row of stripe_first_wedge_contract.contract_rows) {
    assert.ok(row.required_receipt_type, `${row.movement_type} must have required_receipt_type`);
  }
});

test("stripe_first_wedge_contract: every supported row has non-empty receipt_minimum_fields", () => {
  const supportedRows = stripe_first_wedge_contract.contract_rows.filter(
    (r) => !r.unsupported_or_deferred,
  );
  for (const row of supportedRows) {
    assert.ok(
      row.receipt_minimum_fields.length > 0,
      `${row.movement_type} must have receipt_minimum_fields`,
    );
  }
});

test("stripe_first_wedge_contract: resolution_matrix has 8 states", () => {
  assert.equal(stripe_first_wedge_contract.resolution_matrix.length, 8);
});

test("stripe_first_wedge_contract: terminal states require receipts", () => {
  const terminalStates = stripe_first_wedge_contract.resolution_matrix.filter((s) => s.terminal);
  for (const state of terminalStates) {
    assert.ok(
      state.receipt_required,
      `terminal state "${state.state}" must require a receipt`,
    );
  }
});
