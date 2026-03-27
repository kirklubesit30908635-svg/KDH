import assert from "node:assert/strict";
import test from "node:test";
import { stripeEventToObligation } from "../src/lib/stripe-obligations";

// ── unsupported / deferred events ────────────────────────────────────────────

test("stripeEventToObligation: unsupported event has disposition unsupported and null obligation", () => {
  const result = stripeEventToObligation("payment_intent.created", {});
  assert.equal(result.disposition, "unsupported");
  assert.equal(result.obligation, null);
});

test("stripeEventToObligation: completely unknown event returns unsupported", () => {
  const result = stripeEventToObligation("not.a.real.event", { object: {} });
  assert.equal(result.disposition, "unsupported");
  assert.equal(result.obligation, null);
  assert.equal(result.row, null);
});

test("stripeEventToObligation: deferred event (subscription.created) returns deferred and null obligation", () => {
  const result = stripeEventToObligation("customer.subscription.created", {
    object: { id: "sub_123" },
  });
  assert.equal(result.disposition, "deferred");
  assert.equal(result.obligation, null);
  assert.notEqual(result.row, null);
});

test("stripeEventToObligation: deferred event (subscription.deleted) returns deferred and null obligation", () => {
  const result = stripeEventToObligation("customer.subscription.deleted", {
    object: { id: "sub_456" },
  });
  assert.equal(result.disposition, "deferred");
  assert.equal(result.obligation, null);
});

// ── invoice.paid → record_revenue ────────────────────────────────────────────

test("stripeEventToObligation: invoice.paid returns supported with obligation", () => {
  const result = stripeEventToObligation("invoice.paid", {
    object: { id: "in_001", number: "INV-001", amount_paid: 5000 },
  });
  assert.equal(result.disposition, "supported");
  assert.notEqual(result.obligation, null);
});

test("stripeEventToObligation: invoice.paid has face billing", () => {
  const result = stripeEventToObligation("invoice.paid", {
    object: { id: "in_001", number: "INV-001", amount_paid: 5000 },
  });
  assert.equal(result.obligation!.face, "billing");
});

test("stripeEventToObligation: invoice.paid sets severity queue", () => {
  const result = stripeEventToObligation("invoice.paid", {
    object: { id: "in_001", number: "INV-001", amount_paid: 5000 },
  });
  assert.equal(result.obligation!.severity, "queue");
});

test("stripeEventToObligation: invoice.paid sets non-null due_at", () => {
  const before = new Date();
  const result = stripeEventToObligation("invoice.paid", {
    object: { id: "in_001", number: "INV-001", amount_paid: 5000 },
  });
  assert.notEqual(result.obligation!.due_at, null);
  const due = new Date(result.obligation!.due_at!);
  assert.ok(due > before, "due_at should be in the future");
});

test("stripeEventToObligation: invoice.paid title includes invoice number", () => {
  const result = stripeEventToObligation("invoice.paid", {
    object: { id: "in_001", number: "INV-001", amount_paid: 5000 },
  });
  assert.match(result.obligation!.title, /INV-001/);
});

test("stripeEventToObligation: invoice.paid why message includes formatted amount", () => {
  const result = stripeEventToObligation("invoice.paid", {
    object: { id: "in_001", number: "INV-001", amount_paid: 5000 },
  });
  assert.match(result.obligation!.why, /\$50\.00/);
});

test("stripeEventToObligation: invoice.paid sets economic_ref_type invoice", () => {
  const result = stripeEventToObligation("invoice.paid", {
    object: { id: "in_001", number: "INV-001", amount_paid: 5000 },
  });
  assert.equal(result.obligation!.economic_ref_type, "invoice");
});

test("stripeEventToObligation: invoice.paid sets economic_ref_id from object id", () => {
  const result = stripeEventToObligation("invoice.paid", {
    object: { id: "in_001", number: "INV-001", amount_paid: 5000 },
  });
  assert.equal(result.obligation!.economic_ref_id, "in_001");
});

test("stripeEventToObligation: invoice.paid without amount_paid still creates obligation", () => {
  const result = stripeEventToObligation("invoice.paid", {
    object: { id: "in_002", number: "INV-002" },
  });
  assert.equal(result.disposition, "supported");
  assert.notEqual(result.obligation, null);
});

test("stripeEventToObligation: invoice.paid falls back to id when number absent", () => {
  const result = stripeEventToObligation("invoice.paid", {
    object: { id: "in_003" },
  });
  assert.match(result.obligation!.title, /in_003/);
});

// ── invoice.payment_failed → recover_payment ─────────────────────────────────

test("stripeEventToObligation: invoice.payment_failed returns supported", () => {
  const result = stripeEventToObligation("invoice.payment_failed", {
    object: { id: "in_004", number: "INV-004" },
  });
  assert.equal(result.disposition, "supported");
  assert.notEqual(result.obligation, null);
});

test("stripeEventToObligation: invoice.payment_failed sets severity critical", () => {
  const result = stripeEventToObligation("invoice.payment_failed", {
    object: { id: "in_004", number: "INV-004" },
  });
  assert.equal(result.obligation!.severity, "critical");
});

test("stripeEventToObligation: invoice.payment_failed title includes invoice number", () => {
  const result = stripeEventToObligation("invoice.payment_failed", {
    object: { id: "in_004", number: "INV-004" },
  });
  assert.match(result.obligation!.title, /INV-004/);
});

test("stripeEventToObligation: invoice.payment_failed economic_ref_type is invoice", () => {
  const result = stripeEventToObligation("invoice.payment_failed", {
    object: { id: "in_004", number: "INV-004" },
  });
  assert.equal(result.obligation!.economic_ref_type, "invoice");
});

test("stripeEventToObligation: invoice.payment_failed has non-null due_at", () => {
  const result = stripeEventToObligation("invoice.payment_failed", {
    object: { id: "in_004", number: "INV-004" },
  });
  assert.notEqual(result.obligation!.due_at, null);
});

// ── charge.dispute.created → respond_to_dispute ──────────────────────────────

test("stripeEventToObligation: charge.dispute.created returns supported", () => {
  const result = stripeEventToObligation("charge.dispute.created", {
    object: { id: "dp_001", charge: "ch_001", reason: "fraudulent" },
  });
  assert.equal(result.disposition, "supported");
  assert.notEqual(result.obligation, null);
});

test("stripeEventToObligation: charge.dispute.created sets severity critical", () => {
  const result = stripeEventToObligation("charge.dispute.created", {
    object: { id: "dp_001", charge: "ch_001", reason: "fraudulent" },
  });
  assert.equal(result.obligation!.severity, "critical");
});

test("stripeEventToObligation: charge.dispute.created title includes charge id", () => {
  const result = stripeEventToObligation("charge.dispute.created", {
    object: { id: "dp_001", charge: "ch_001", reason: "fraudulent" },
  });
  assert.match(result.obligation!.title, /ch_001/);
});

test("stripeEventToObligation: charge.dispute.created economic_ref_type is payment", () => {
  const result = stripeEventToObligation("charge.dispute.created", {
    object: { id: "dp_001", charge: "ch_001" },
  });
  assert.equal(result.obligation!.economic_ref_type, "payment");
});

test("stripeEventToObligation: charge.dispute.created why includes reason when present", () => {
  const result = stripeEventToObligation("charge.dispute.created", {
    object: { id: "dp_001", charge: "ch_001", reason: "fraudulent" },
  });
  assert.match(result.obligation!.why, /fraudulent/);
});

test("stripeEventToObligation: charge.dispute.created due_at is approximately 7 days from now", () => {
  const before = Date.now();
  const result = stripeEventToObligation("charge.dispute.created", {
    object: { id: "dp_001", charge: "ch_001" },
  });
  const due = new Date(result.obligation!.due_at!).getTime();
  const expectedMs = 7 * 24 * 60 * 60 * 1000;
  const tolerance = 5 * 60 * 1000; // 5 minutes
  assert.ok(
    due >= before + expectedMs - tolerance && due <= before + expectedMs + tolerance,
    `due_at should be ~7 days from now (within 5 minute tolerance)`,
  );
});

test("stripeEventToObligation: charge.dispute.created falls back to object id when charge absent", () => {
  const result = stripeEventToObligation("charge.dispute.created", {
    object: { id: "dp_002" },
  });
  assert.equal(result.obligation!.economic_ref_id, "dp_002");
});

// ── charge.refunded → process_refund ─────────────────────────────────────────

test("stripeEventToObligation: charge.refunded returns supported", () => {
  const result = stripeEventToObligation("charge.refunded", {
    object: { id: "ch_002", amount_refunded: 2000 },
  });
  assert.equal(result.disposition, "supported");
  assert.notEqual(result.obligation, null);
});

test("stripeEventToObligation: charge.refunded sets severity queue", () => {
  const result = stripeEventToObligation("charge.refunded", {
    object: { id: "ch_002", amount_refunded: 2000 },
  });
  assert.equal(result.obligation!.severity, "queue");
});

test("stripeEventToObligation: charge.refunded title includes charge id", () => {
  const result = stripeEventToObligation("charge.refunded", {
    object: { id: "ch_002", amount_refunded: 2000 },
  });
  assert.match(result.obligation!.title, /ch_002/);
});

test("stripeEventToObligation: charge.refunded why includes formatted refund amount", () => {
  const result = stripeEventToObligation("charge.refunded", {
    object: { id: "ch_002", amount_refunded: 2000 },
  });
  assert.match(result.obligation!.why, /\$20\.00/);
});

test("stripeEventToObligation: charge.refunded economic_ref_type is payment", () => {
  const result = stripeEventToObligation("charge.refunded", {
    object: { id: "ch_002" },
  });
  assert.equal(result.obligation!.economic_ref_type, "payment");
});

// ── flat payload (no object wrapper) ─────────────────────────────────────────

test("stripeEventToObligation: handles flat payload without object key for invoice.paid", () => {
  const result = stripeEventToObligation("invoice.paid", {
    id: "in_flat",
    number: "INV-FLAT",
    amount_paid: 10000,
  });
  assert.equal(result.disposition, "supported");
  assert.notEqual(result.obligation, null);
  assert.match(result.obligation!.title, /INV-FLAT/);
});

// ── row is returned on success ────────────────────────────────────────────────

test("stripeEventToObligation: supported result includes contract row", () => {
  const result = stripeEventToObligation("invoice.paid", {
    object: { id: "in_001", number: "INV-001", amount_paid: 5000 },
  });
  assert.notEqual(result.row, null);
  assert.equal(result.row!.movement_type, "invoice_paid");
});
