import crypto from "crypto";

export type TransitionState =
  | "created"
  | "in_progress"
  | "pending_proof"
  | "pending_payment"
  | "closed_revenue"
  | "closed_no_revenue";

export const VALID_TRANSITIONS: Record<TransitionState, TransitionState[]> = {
  created: ["in_progress"],
  in_progress: ["pending_proof", "pending_payment", "closed_no_revenue"],
  pending_proof: ["pending_payment", "closed_no_revenue"],
  pending_payment: ["closed_revenue"],
  closed_revenue: [],
  closed_no_revenue: [],
};

export function hash(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function assertValidTransition(
  current: TransitionState,
  next: TransitionState,
) {
  if (!VALID_TRANSITIONS[current].includes(next)) {
    throw new Error(`Invalid transition: ${current} -> ${next}`);
  }
}

export function buildIdempotencyKey(
  obligationId: string,
  nextState: TransitionState,
  payload: unknown,
) {
  return hash(obligationId + nextState + JSON.stringify(payload));
}

export function assertPaymentConfirmed(payload: unknown) {
  const record =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {};

  if (typeof record.payment_intent_id !== "string" || record.payment_intent_id.length === 0) {
    throw new Error("Payment confirmation required");
  }
}

export function assertOperatorResolution(payload: unknown) {
  const record =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {};

  if (typeof record.operator_id !== "string" || record.operator_id.length === 0) {
    throw new Error("Operator ID required");
  }

  if (typeof record.reason !== "string" || record.reason.length === 0) {
    throw new Error("Resolution reason required");
  }
}

export function isTransitionState(value: unknown): value is TransitionState {
  return (
    value === "created" ||
    value === "in_progress" ||
    value === "pending_proof" ||
    value === "pending_payment" ||
    value === "closed_revenue" ||
    value === "closed_no_revenue"
  );
}

export function buildTransitionEvent(input: {
  obligation_id: string;
  current_state: TransitionState;
  next_state: TransitionState;
  payload: unknown;
  prev_hash: string | null;
}) {
  assertValidTransition(input.current_state, input.next_state);

  if (input.next_state === "closed_revenue") {
    assertPaymentConfirmed(input.payload);
  }

  if (input.next_state === "closed_no_revenue") {
    assertOperatorResolution(input.payload);
  }

  const idempotency_key = buildIdempotencyKey(
    input.obligation_id,
    input.next_state,
    input.payload,
  );

  const record_hash = hash(
    (input.prev_hash ?? "") +
      input.obligation_id +
      input.next_state +
      JSON.stringify(input.payload),
  );

  return {
    obligation_id: input.obligation_id,
    state: input.next_state,
    payload: input.payload,
    prev_hash: input.prev_hash,
    record_hash,
    idempotency_key,
    created_at: Date.now(),
  };
}
