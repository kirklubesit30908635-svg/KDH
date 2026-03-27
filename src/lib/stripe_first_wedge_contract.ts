export type StripeResolutionState =
  | "open"
  | "acknowledged"
  | "blocked"
  | "completed"
  | "failed"
  | "canceled"
  | "disputed"
  | "aged_open";

export type StripeFirstWedgeContractRow = {
  movement_type: string;
  source_event: string;
  object_class: string;
  object_identity_rule: string;
  economic_ref_strategy: string;
  obligation_type: string;
  obligation_open_rule: string;
  allowed_resolution_states: StripeResolutionState[];
  required_operator_action: string;
  required_receipt_type: string;
  receipt_minimum_fields: string[];
  signal_on_lag: string;
  signal_on_failure: string;
  signal_on_unreceipted: string;
  unsupported_or_deferred: string | null;
};

export type StripeResolutionMatrixRow = {
  state: StripeResolutionState;
  terminal: boolean;
  receipt_required: boolean;
  operator_action_required: boolean;
  watchdog_escalation_required: boolean;
  notes: string;
};

export type StripeReceiptMinimumField = {
  field: string;
  requirement: string;
};

export type StripeFirstWedgeDisposition = "supported" | "deferred" | "unsupported";

export const stripe_first_wedge_contract = {
  name: "stripe_first_wedge_contract",
  wedge_decision:
    "The first wedge is frozen as Stripe billing movement governance for invoice collection, paid subscription operationalization, subscription termination closure, and payment exception handling. Formally supported movements in this pass are checkout.session.completed for canonical subscription activation, customer.subscription.deleted for governed subscription termination, invoice.paid, invoice.payment_failed, charge.dispute.created, and charge.refunded. customer.subscription.created remains deferred until broader subscription lifecycle semantics are formalized.",
  contract_rows: [
    {
      movement_type: "invoice_paid",
      source_event: "stripe.invoice.paid",
      object_class: "invoice",
      object_identity_rule:
        "One governed object per workspace_id + stripe invoice id. Replays must bind to the existing invoice object, never create a second object.",
      economic_ref_strategy:
        "Resolve economic_ref_id as ref_type=stripe_invoice and ref_key=invoice.id. If invoice.charge is present, attach stripe_charge as secondary metadata, not the primary economic ref.",
      obligation_type: "record_revenue",
      obligation_open_rule:
        "Open when a verified invoice.paid movement lands and no unresolved record_revenue obligation already exists for the same workspace_id + invoice.id + source_event_id.",
      allowed_resolution_states: ["open", "acknowledged", "blocked", "completed", "failed", "canceled", "aged_open"],
      required_operator_action:
        "Verify the paid invoice is posted to the correct customer/accounting path and close the revenue recording follow-through.",
      required_receipt_type: "obligation_resolution",
      receipt_minimum_fields: [
        "receipt_type",
        "workspace_id",
        "actor_id",
        "object_id",
        "economic_ref_id",
        "obligation_id",
        "movement_type",
        "source_event_id",
        "resolution_state",
        "reason_code",
        "proof_ref",
        "occurred_at",
        "recorded_at",
      ],
      signal_on_lag:
        "Fire when invoice_paid remains open or acknowledged past the configured recording SLA.",
      signal_on_failure:
        "Fire when invoice_paid is marked failed, blocked, or canceled with a reason_code outside the approved set.",
      signal_on_unreceipted:
        "Fire when the movement is resolved to completed/failed/canceled but no linked receipt exists.",
      unsupported_or_deferred: null,
    },
    {
      movement_type: "invoice_payment_failed",
      source_event: "stripe.invoice.payment_failed",
      object_class: "invoice",
      object_identity_rule:
        "Bind to the same governed invoice object keyed by workspace_id + stripe invoice id. Do not create a separate object for retries of the same invoice.",
      economic_ref_strategy:
        "Resolve economic_ref_id as ref_type=stripe_invoice and ref_key=invoice.id. If payment_intent or charge ids exist, record them as supporting metadata only.",
      obligation_type: "recover_payment",
      obligation_open_rule:
        "Open when a verified invoice.payment_failed movement lands and no unresolved recover_payment obligation exists for the same workspace_id + invoice.id.",
      allowed_resolution_states: ["open", "acknowledged", "blocked", "completed", "failed", "canceled", "aged_open"],
      required_operator_action:
        "Attempt collection recovery, document blocker or customer outcome, and close only after the recovery path is explicitly resolved.",
      required_receipt_type: "obligation_resolution",
      receipt_minimum_fields: [
        "receipt_type",
        "workspace_id",
        "actor_id",
        "object_id",
        "economic_ref_id",
        "obligation_id",
        "movement_type",
        "source_event_id",
        "resolution_state",
        "reason_code",
        "proof_ref",
        "occurred_at",
        "recorded_at",
      ],
      signal_on_lag:
        "Fire when recover_payment remains open, acknowledged, or blocked beyond the recovery SLA.",
      signal_on_failure:
        "Fire when recover_payment resolves failed or canceled without an approved reason_code.",
      signal_on_unreceipted:
        "Fire when recover_payment leaves open state through a terminal resolution but no receipt is linked.",
      unsupported_or_deferred: null,
    },
    {
      movement_type: "checkout_session_completed",
      source_event: "stripe.checkout.session.completed",
      object_class: "subscription",
      object_identity_rule:
        "One governed object per workspace_id + stripe subscription id. Replays of the same paid checkout must bind to the same canonical subscription object, never create a second governed duty.",
      economic_ref_strategy:
        "Resolve economic_ref_id as ref_type=stripe_subscription and ref_key=subscription.id. Record checkout session id, customer id, and invoice id as supporting metadata, not competing identities.",
      obligation_type: "operationalize_subscription",
      obligation_open_rule:
        "Open when a paid checkout.session.completed lands for a subscription and no operationalize_subscription obligation already exists for the same workspace_id + subscription.id.",
      allowed_resolution_states: ["open", "acknowledged", "blocked", "completed", "failed", "canceled", "aged_open"],
      required_operator_action:
        "Operationalize the canonical subscription, confirm downstream operator readiness, and close the governed activation follow-through.",
      required_receipt_type: "obligation_resolution",
      receipt_minimum_fields: [
        "receipt_type",
        "workspace_id",
        "actor_id",
        "object_id",
        "economic_ref_id",
        "obligation_id",
        "movement_type",
        "source_event_id",
        "resolution_state",
        "reason_code",
        "proof_ref",
        "occurred_at",
        "recorded_at",
      ],
      signal_on_lag:
        "Fire when a paid operator-access subscription remains open, acknowledged, or blocked beyond the access-activation SLA.",
      signal_on_failure:
        "Fire when activation resolves failed or canceled without explicit reason_code and operator identity reference.",
      signal_on_unreceipted:
        "Fire when activation reaches a terminal resolution but no linked receipt exists.",
      unsupported_or_deferred: null,
    },
    {
      movement_type: "subscription_created",
      source_event: "stripe.customer.subscription.created",
      object_class: "subscription",
      object_identity_rule:
        "Would bind one governed object per workspace_id + stripe subscription id if promoted into formal support.",
      economic_ref_strategy:
        "Would resolve economic_ref_id as ref_type=stripe_subscription and ref_key=subscription.id if promoted into formal support.",
      obligation_type: "deferred",
      obligation_open_rule:
        "No formal obligation may open from this movement in the frozen wedge until subscription activation semantics are ratified.",
      allowed_resolution_states: ["open"],
      required_operator_action:
        "Deferred. Do not create a governed operator queue item from this event in the frozen wedge.",
      required_receipt_type: "deferred",
      receipt_minimum_fields: [],
      signal_on_lag:
        "Emit unsupported movement signal if this event attempts to open a governed obligation before contract promotion.",
      signal_on_failure:
        "Emit contract breach signal if implementation logic mutates kernel truth for this movement outside the ratified contract.",
      signal_on_unreceipted:
        "Not applicable while deferred. The movement must be ignored or quarantined, not heuristically resolved.",
      unsupported_or_deferred:
        "Deferred. Subscription activation and onboarding semantics are not formalized enough for authoritative wedge support.",
    },
    {
      movement_type: "subscription_deleted",
      source_event: "stripe.customer.subscription.deleted",
      object_class: "subscription",
      object_identity_rule:
        "Bind to the existing canonical subscription object keyed by workspace_id + stripe subscription id. The deletion event must not create a second object.",
      economic_ref_strategy:
        "Resolve economic_ref_id as ref_type=stripe_subscription and ref_key=subscription.id. Use the same canonical subscription reference created by checkout.session.completed.",
      obligation_type: "operationalize_subscription",
      obligation_open_rule:
        "Do not open a second obligation. Resolve or terminate the existing operationalize_subscription obligation for the same workspace_id + subscription.id.",
      allowed_resolution_states: ["open", "acknowledged", "blocked", "completed", "failed", "canceled", "aged_open"],
      required_operator_action:
        "No new operator action opens from deletion. The kernel must retire the governed subscription follow-through cleanly with a receipted terminal state.",
      required_receipt_type: "obligation_resolution",
      receipt_minimum_fields: [
        "receipt_type",
        "workspace_id",
        "actor_id",
        "object_id",
        "economic_ref_id",
        "obligation_id",
        "movement_type",
        "source_event_id",
        "resolution_state",
        "reason_code",
        "proof_ref",
        "occurred_at",
        "recorded_at",
      ],
      signal_on_lag:
        "Fire when the subscription_deleted lifecycle event leaves an operationalize_subscription obligation open or blocked after Stripe has already terminated the subscription.",
      signal_on_failure:
        "Fire when deletion closure records a non-terminal or contradictory state against the canonical subscription object.",
      signal_on_unreceipted:
        "Fire when a subscription termination reaches its terminal obligation state but no governed receipt is linked.",
      unsupported_or_deferred: null,
    },
    {
      movement_type: "charge_dispute_created",
      source_event: "stripe.charge.dispute.created",
      object_class: "payment",
      object_identity_rule:
        "One governed object per workspace_id + stripe charge id or dispute id when charge id is absent. Replays must rebind to the same payment object.",
      economic_ref_strategy:
        "Resolve economic_ref_id as ref_type=stripe_charge and ref_key=charge.id when present; otherwise derive from dispute.id with charge linkage in metadata.",
      obligation_type: "respond_to_dispute",
      obligation_open_rule:
        "Open when a verified dispute movement lands and no unresolved respond_to_dispute obligation exists for the same workspace_id + charge/dispute reference.",
      allowed_resolution_states: ["open", "acknowledged", "blocked", "completed", "failed", "canceled", "disputed", "aged_open"],
      required_operator_action:
        "Prepare and submit the dispute response path or explicitly record why the business will not contest.",
      required_receipt_type: "obligation_resolution",
      receipt_minimum_fields: [
        "receipt_type",
        "workspace_id",
        "actor_id",
        "object_id",
        "economic_ref_id",
        "obligation_id",
        "movement_type",
        "source_event_id",
        "resolution_state",
        "reason_code",
        "proof_ref",
        "occurred_at",
        "recorded_at",
      ],
      signal_on_lag:
        "Fire when dispute response remains open, acknowledged, blocked, or disputed beyond the dispute-response SLA.",
      signal_on_failure:
        "Fire when dispute response resolves failed or canceled without an approved reason_code and proof_ref.",
      signal_on_unreceipted:
        "Fire when dispute response enters a terminal state but no linked receipt exists.",
      unsupported_or_deferred: null,
    },
    {
      movement_type: "charge_refunded",
      source_event: "stripe.charge.refunded",
      object_class: "payment",
      object_identity_rule:
        "One governed object per workspace_id + stripe charge id. Refund events for the same charge must attach to the existing payment object.",
      economic_ref_strategy:
        "Resolve economic_ref_id as ref_type=stripe_charge and ref_key=charge.id. Store refunded amount and partial/full indicator in metadata.",
      obligation_type: "process_refund",
      obligation_open_rule:
        "Open when a verified refund movement lands and no unresolved process_refund obligation exists for the same workspace_id + charge.id + source_event_id.",
      allowed_resolution_states: ["open", "acknowledged", "blocked", "completed", "failed", "canceled", "aged_open"],
      required_operator_action:
        "Verify refund posting, downstream accounting treatment, and customer-facing completion before closure.",
      required_receipt_type: "obligation_resolution",
      receipt_minimum_fields: [
        "receipt_type",
        "workspace_id",
        "actor_id",
        "object_id",
        "economic_ref_id",
        "obligation_id",
        "movement_type",
        "source_event_id",
        "resolution_state",
        "reason_code",
        "proof_ref",
        "occurred_at",
        "recorded_at",
      ],
      signal_on_lag:
        "Fire when process_refund remains open, acknowledged, or blocked beyond the refund-finalization SLA.",
      signal_on_failure:
        "Fire when process_refund resolves failed or canceled without an approved reason_code.",
      signal_on_unreceipted:
        "Fire when process_refund reaches a terminal resolution but no linked receipt exists.",
      unsupported_or_deferred: null,
    },
  ] satisfies StripeFirstWedgeContractRow[],
  resolution_matrix: [
    {
      state: "open",
      terminal: false,
      receipt_required: false,
      operator_action_required: true,
      watchdog_escalation_required: false,
      notes: "Authoritative live obligation state immediately after obligation open.",
    },
    {
      state: "acknowledged",
      terminal: false,
      receipt_required: true,
      operator_action_required: true,
      watchdog_escalation_required: false,
      notes: "Operator confirmed ownership or first touch; the state change must be receipted because silent state changes are forbidden.",
    },
    {
      state: "blocked",
      terminal: false,
      receipt_required: true,
      operator_action_required: true,
      watchdog_escalation_required: true,
      notes: "Explicit external or internal blocker recorded with reason_code and proof_ref.",
    },
    {
      state: "completed",
      terminal: true,
      receipt_required: true,
      operator_action_required: false,
      watchdog_escalation_required: false,
      notes: "The required wedge follow-through is complete and proven.",
    },
    {
      state: "failed",
      terminal: true,
      receipt_required: true,
      operator_action_required: false,
      watchdog_escalation_required: true,
      notes: "The operator path concluded unsuccessfully and must remain auditable with explicit reason_code.",
    },
    {
      state: "canceled",
      terminal: true,
      receipt_required: true,
      operator_action_required: false,
      watchdog_escalation_required: false,
      notes: "The obligation was intentionally stopped for an approved reason_code such as duplicate or invalid_object.",
    },
    {
      state: "disputed",
      terminal: false,
      receipt_required: true,
      operator_action_required: true,
      watchdog_escalation_required: true,
      notes: "Active contested state for dispute-handling movements. The movement is still live and escalated.",
    },
    {
      state: "aged_open",
      terminal: false,
      receipt_required: false,
      operator_action_required: true,
      watchdog_escalation_required: true,
      notes: "Derived watchdog condition, not a silent kernel mutation. It arises from open-state age crossing SLA.",
    },
  ] satisfies StripeResolutionMatrixRow[],
  receipt_minimum_contract: [
    {
      field: "receipt_type",
      requirement: "Must be a governed resolution receipt type for this wedge. Default: obligation_resolution.",
    },
    {
      field: "workspace_id",
      requirement: "Required. Must match the workspace that owns the movement, object, obligation, and receipt chain.",
    },
    {
      field: "actor_id",
      requirement: "Required. Operator or system actor that performed the governed state transition.",
    },
    {
      field: "object_id_or_locator",
      requirement: "Required. Prefer kernel object_id; if object_id is not yet materialized, include deterministic locator by workspace + object_class + provider identifier.",
    },
    {
      field: "economic_ref_id_or_derivation",
      requirement: "Required. Prefer economic_ref_id; if not yet present, include the exact derivation tuple used to resolve it.",
    },
    {
      field: "obligation_id",
      requirement: "Required. Must point to the governed obligation being resolved or updated.",
    },
    {
      field: "movement_type",
      requirement: "Required. Must match one of the rows in contract_rows.",
    },
    {
      field: "source_event_id",
      requirement: "Required. Canonical ledger event id or Stripe event id that opened/advanced the governed movement.",
    },
    {
      field: "resolution_state",
      requirement: "Required. Must be one of the enumerated wedge resolution states.",
    },
    {
      field: "reason_code",
      requirement: "Required. No silent closure. Every non-open transition must carry an explicit reason_code.",
    },
    {
      field: "proof_link_or_proof_ref",
      requirement: "Required for completed, failed, canceled, blocked, and disputed states. Must point to the supporting proof artifact or reference.",
    },
    {
      field: "occurred_at",
      requirement: "Required. When the business event or operator action actually occurred.",
    },
    {
      field: "recorded_at",
      requirement: "Required. When the kernel committed the receipt.",
    },
  ] satisfies StripeReceiptMinimumField[],
} as const;

export function canonicalizeStripeFirstWedgeSourceEvent(sourceEvent: string) {
  return sourceEvent.startsWith("stripe.") ? sourceEvent : `stripe.${sourceEvent}`;
}

export function getStripeFirstWedgeContractRow(sourceEvent: string) {
  const canonicalSourceEvent = canonicalizeStripeFirstWedgeSourceEvent(sourceEvent);
  return (
    stripe_first_wedge_contract.contract_rows.find(
      (row) => row.source_event === canonicalSourceEvent,
    ) ?? null
  );
}

export function classifyStripeFirstWedgeSourceEvent(sourceEvent: string): {
  disposition: StripeFirstWedgeDisposition;
  canonicalSourceEvent: string;
  row: StripeFirstWedgeContractRow | null;
} {
  const canonicalSourceEvent = canonicalizeStripeFirstWedgeSourceEvent(sourceEvent);
  const row = getStripeFirstWedgeContractRow(canonicalSourceEvent);

  if (!row) {
    return {
      disposition: "unsupported",
      canonicalSourceEvent,
      row: null,
    };
  }

  return {
    disposition: row.unsupported_or_deferred ? "deferred" : "supported",
    canonicalSourceEvent,
    row,
  };
}

export const supportedStripeFirstWedgeRows =
  stripe_first_wedge_contract.contract_rows.filter(
    (row) => !row.unsupported_or_deferred,
  );

export const deferredStripeFirstWedgeRows =
  stripe_first_wedge_contract.contract_rows.filter(
    (row) => !!row.unsupported_or_deferred,
  );

export const supportedStripeFirstWedgeSourceEvents =
  supportedStripeFirstWedgeRows.map((row) => row.source_event);

export const supportedOrDeferredStripeFirstWedgeSourceEvents =
  stripe_first_wedge_contract.contract_rows.map((row) => row.source_event);

export const supportedStripeFirstWedgeObligationTypes = [
  ...new Set(supportedStripeFirstWedgeRows.map((row) => row.obligation_type)),
];

export function isSupportedStripeFirstWedgeObligationType(obligationType: string | null | undefined) {
  return !!obligationType && supportedStripeFirstWedgeObligationTypes.includes(obligationType);
}

export function stripStripeSourcePrefix(sourceEvent: string) {
  return sourceEvent.replace(/^stripe\./, "");
}
