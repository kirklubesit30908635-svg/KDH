import assert from "node:assert/strict";
import test from "node:test";
import { buildTransitionEvent } from "../src/lib/kernel/transitions";

test("rejects invalid transition", () => {
  assert.throws(() =>
    buildTransitionEvent({
      obligation_id: "obligation-1",
      current_state: "created",
      next_state: "closed_revenue",
      payload: {},
      prev_hash: null,
    }),
  );
});

test("requires payment proof for revenue closure", () => {
  assert.throws(() =>
    buildTransitionEvent({
      obligation_id: "obligation-1",
      current_state: "pending_payment",
      next_state: "closed_revenue",
      payload: {},
      prev_hash: null,
    }),
  );
});

test("requires operator evidence for no-revenue closure", () => {
  assert.throws(() =>
    buildTransitionEvent({
      obligation_id: "obligation-1",
      current_state: "in_progress",
      next_state: "closed_no_revenue",
      payload: {},
      prev_hash: null,
    }),
  );
});
