import assert from "node:assert/strict";
import test from "node:test";
import {
  unwrapOperatorWatchdog,
} from "../src/lib/operator-watchdog-client";

test("unwrapOperatorWatchdog returns the wrapped watchdog payload", () => {
  const watchdog = unwrapOperatorWatchdog(
    {
      watchdog: {
        generated_at: "2026-03-30T12:00:00.000Z",
        mode: "action_required",
        headline: "Late obligation pressure",
        message: "1 late obligation needs watchdog pressure.",
        degraded_read_indicator: false,
        trigger_count: 1,
        late_trigger_count: 1,
        at_risk_trigger_count: 0,
        proof_lag_trigger_count: 0,
        inconsistency_trigger_count: 0,
        run: null,
        triggers: [],
      },
    },
    200,
  );

  assert.equal(watchdog.mode, "action_required");
  assert.equal(watchdog.trigger_count, 1);
});

test("unwrapOperatorWatchdog returns access fallback for auth failures", () => {
  const watchdog = unwrapOperatorWatchdog({ nope: true }, 403);
  assert.equal(watchdog.mode, "access_required");
  assert.equal(watchdog.trigger_count, 0);
});

test("unwrapOperatorWatchdog returns unavailable fallback for invalid payloads", () => {
  const watchdog = unwrapOperatorWatchdog({ nope: true }, 503);
  assert.equal(watchdog.mode, "unavailable");
  assert.match(watchdog.message, /invalid/i);
});
