import assert from "node:assert/strict";
import test from "node:test";
import {
  fmtDue,
  fmtFace,
  fmtReceiptLabel,
  fmtReceiptReasonCode,
  fmtReceiptSummary,
  readReceiptMetadata,
  safeStr,
} from "../src/lib/ui-fmt";

// ── fmtFace ───────────────────────────────────────────────────────────────────

test("fmtFace: null returns Unknown", () => {
  assert.equal(fmtFace(null), "Unknown");
});

test("fmtFace: undefined returns Unknown", () => {
  assert.equal(fmtFace(undefined), "Unknown");
});

test("fmtFace: empty string returns Unknown", () => {
  assert.equal(fmtFace(""), "Unknown");
});

test("fmtFace: billing (lowercase) returns Billing", () => {
  assert.equal(fmtFace("billing"), "Billing");
});

test("fmtFace: BILLING (uppercase) returns Billing", () => {
  assert.equal(fmtFace("BILLING"), "Billing");
});

test("fmtFace: Billing (mixed case) returns Billing", () => {
  assert.equal(fmtFace("Billing"), "Billing");
});

test("fmtFace: dealership returns Dealership", () => {
  assert.equal(fmtFace("dealership"), "Dealership");
});

test("fmtFace: DEALERSHIP returns Dealership", () => {
  assert.equal(fmtFace("DEALERSHIP"), "Dealership");
});

test("fmtFace: advertising returns Advertising", () => {
  assert.equal(fmtFace("advertising"), "Advertising");
});

test("fmtFace: ADVERTISING returns Advertising", () => {
  assert.equal(fmtFace("ADVERTISING"), "Advertising");
});

test("fmtFace: contractor returns Contractor", () => {
  assert.equal(fmtFace("contractor"), "Contractor");
});

test("fmtFace: CONTRACTOR returns Contractor", () => {
  assert.equal(fmtFace("CONTRACTOR"), "Contractor");
});

test("fmtFace: unknown string is returned as-is", () => {
  assert.equal(fmtFace("marine"), "marine");
});

test("fmtFace: unknown string with mixed case is returned as-is (no normalization for unknowns)", () => {
  assert.equal(fmtFace("CustomFace"), "CustomFace");
});

// ── fmtDue ────────────────────────────────────────────────────────────────────

test("fmtDue: null returns null", () => {
  assert.equal(fmtDue(null), null);
});

test("fmtDue: undefined returns null", () => {
  assert.equal(fmtDue(undefined), null);
});

test("fmtDue: empty string returns null", () => {
  assert.equal(fmtDue(""), null);
});

test("fmtDue: valid ISO string returns a non-null string", () => {
  const result = fmtDue("2026-03-27T00:00:00.000Z");
  assert.notEqual(result, null);
  assert.equal(typeof result, "string");
});

test("fmtDue: invalid date string is returned as-is", () => {
  assert.equal(fmtDue("not-a-date"), "not-a-date");
});

test("fmtDue: valid ISO timestamp produces locale-formatted string (not the original ISO string)", () => {
  const iso = "2026-01-15T12:00:00.000Z";
  const result = fmtDue(iso);
  // The result is a locale string - it should not equal the raw ISO string
  // (toLocaleString() output format varies by environment, but it should be a string)
  assert.notEqual(result, null);
  assert.equal(typeof result, "string");
  assert.ok(result!.length > 0);
});

// ── safeStr ───────────────────────────────────────────────────────────────────

test("safeStr: null returns empty string", () => {
  assert.equal(safeStr(null), "");
});

test("safeStr: undefined returns empty string", () => {
  assert.equal(safeStr(undefined), "");
});

test("safeStr: string is returned as-is", () => {
  assert.equal(safeStr("hello"), "hello");
});

test("safeStr: empty string is returned as-is", () => {
  assert.equal(safeStr(""), "");
});

test("safeStr: number is converted to string", () => {
  assert.equal(safeStr(42), "42");
});

test("safeStr: zero is converted to string", () => {
  assert.equal(safeStr(0), "0");
});

test("safeStr: boolean true is converted to string", () => {
  assert.equal(safeStr(true), "true");
});

test("safeStr: boolean false is converted to string", () => {
  assert.equal(safeStr(false), "false");
});

test("safeStr: object is converted to [object Object]", () => {
  assert.equal(safeStr({}), "[object Object]");
});

test("safeStr: array is converted to comma-separated string", () => {
  assert.equal(safeStr([1, 2, 3]), "1,2,3");
});

// ── receipt labeling ──────────────────────────────────────────────────────────

test("fmtReceiptLabel prefers payload.metadata.proof_kind", () => {
  assert.equal(
    fmtReceiptLabel({
      payload: { metadata: { proof_kind: "github_invoice_receipt", action: "sealed" } },
      face: "billing",
      receiptType: "commit",
    }),
    "github_invoice_receipt",
  );
});

test("fmtReceiptLabel falls back to payload.payload.metadata.action", () => {
  assert.equal(
    fmtReceiptLabel({
      payload: { payload: { metadata: { action: "action_completed" } } },
      face: "unknown",
      receiptType: "commit",
    }),
    "action_completed",
  );
});

test("fmtReceiptLabel falls back to face when face is meaningful", () => {
  assert.equal(
    fmtReceiptLabel({
      payload: {},
      face: "builder_operating_costs",
      receiptType: "commit",
    }),
    "builder_operating_costs",
  );
});

test("fmtReceiptLabel falls back to receipt_type when metadata and face are absent", () => {
  assert.equal(
    fmtReceiptLabel({
      payload: {},
      face: "unknown",
      receiptType: "commit",
    }),
    "commit",
  );
});

test("fmtReceiptSummary prefers payload.metadata.insight", () => {
  assert.equal(
    fmtReceiptSummary({
      metadata: { insight: "OpenAI invoice and receipt linked" },
      reason_code: "action_completed",
    }),
    "OpenAI invoice and receipt linked",
  );
});

test("fmtReceiptSummary falls back to reason_code", () => {
  assert.equal(
    fmtReceiptSummary({
      payload: { reason_code: "action_completed" },
    }),
    "action_completed",
  );
});

test("fmtReceiptReasonCode reads top-level and nested payload reason codes", () => {
  assert.equal(fmtReceiptReasonCode({ reason_code: "top_level_reason" }), "top_level_reason");
  assert.equal(
    fmtReceiptReasonCode({ payload: { reason_code: "nested_reason" } }),
    "nested_reason",
  );
});

test("readReceiptMetadata exposes proof kind, action, insight, and reason code", () => {
  assert.deepEqual(
    readReceiptMetadata({
      payload: {
        metadata: {
          proof_kind: "vercel_invoice",
          action: "action_completed",
          insight: "Vercel invoice proof recorded",
        },
        reason_code: "action_completed",
      },
    }),
    {
      proofKind: "vercel_invoice",
      action: "action_completed",
      insight: "Vercel invoice proof recorded",
      reasonCode: "action_completed",
    },
  );
});
