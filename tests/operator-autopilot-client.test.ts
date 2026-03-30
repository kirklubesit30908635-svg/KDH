import assert from "node:assert/strict";
import test from "node:test";
import {
  unwrapOperatorAutopilot,
} from "../src/lib/operator-autopilot-client";
import type { OperatorAutopilot } from "../src/lib/operator-autopilot";

function autopilot(overrides: Partial<OperatorAutopilot> = {}): OperatorAutopilot {
  return {
    generated_at: "2026-03-30T12:00:00.000Z",
    mode: "action_required",
    headline: "Action required",
    message: "A governed duty needs action.",
    degraded_read_indicator: false,
    visible_queue_count: 1,
    actionable_queue_count: 1,
    monitor_queue_count: 0,
    proof_activity_count: 0,
    recommended_action: null,
    watchlist: [],
    ...overrides,
  };
}

test("unwrapOperatorAutopilot returns the wrapped autopilot payload", () => {
  const unwrapped = unwrapOperatorAutopilot({ autopilot: autopilot() }, 200);
  assert.equal(unwrapped.mode, "action_required");
  assert.equal(unwrapped.visible_queue_count, 1);
});

test("unwrapOperatorAutopilot returns access fallback for auth failures", () => {
  const unwrapped = unwrapOperatorAutopilot({ nope: true }, 403);
  assert.equal(unwrapped.mode, "access_required");
  assert.equal(unwrapped.recommended_action, null);
});

test("unwrapOperatorAutopilot returns unavailable fallback for invalid payloads", () => {
  const unwrapped = unwrapOperatorAutopilot({ nope: true }, 503);
  assert.equal(unwrapped.mode, "unavailable");
  assert.match(unwrapped.message, /invalid/i);
});
