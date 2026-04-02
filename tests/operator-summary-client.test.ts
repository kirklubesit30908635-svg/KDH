import assert from "node:assert/strict";
import test from "node:test";
import { unwrapOperatorSummary } from "../src/lib/operator-summary-client";
import { buildAccessRequiredSummary } from "../src/lib/operator-summary";

test("unwrapOperatorSummary returns the wrapped summary payload", () => {
  const summary = buildAccessRequiredSummary();
  const unwrapped = unwrapOperatorSummary({ summary }, 403);

  assert.deepEqual(unwrapped, summary);
});

test("unwrapOperatorSummary returns unavailable summary for invalid payload", () => {
  const summary = unwrapOperatorSummary({ nope: true }, 503);

  assert.equal(summary.live_state_health, "unavailable");
  assert.equal(summary.degraded_read_indicator, true);
});
