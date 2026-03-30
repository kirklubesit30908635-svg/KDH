export const CLASS_RULES = {
  lead: {
    allowedPostures: ["revenue_candidate"],
    defaultObligation: "follow_up",
    allowedObligations: ["follow_up", "qualify", "close_lost"],
  },
  invoice: {
    allowedPostures: ["direct_revenue", "revenue_recovery", "cost_exposure"],
    defaultObligation: "collect_payment",
    allowedObligations: [
      "collect_payment",
      "collect_invoice",
      "record_revenue",
      "recover_payment",
      "review_invoice",
      "review_invoice_update",
      "track_finalized_invoice",
      "write_off_review",
      "fund_active_period",
      "justify_spend",
    ],
  },
  subscription: {
    allowedPostures: ["cost_exposure"],
    defaultObligation: "review_plan",
    allowedObligations: [
      "fund_active_period",
      "review_plan",
      "justify_spend",
      "downgrade_unused",
      "confirm_dependency",
    ],
  },
  operator_access_subscription: {
    allowedPostures: ["direct_revenue"],
    defaultObligation: "activate_operator_access",
    allowedObligations: ["activate_operator_access"],
  },
  job: {
    allowedPostures: ["direct_revenue", "cost_exposure"],
    defaultObligation: "schedule_job",
    allowedObligations: ["schedule_job", "complete_job", "review_cost"],
  },
  campaign: {
    allowedPostures: ["revenue_candidate"],
    defaultObligation: "track_campaign",
    allowedObligations: ["track_campaign", "evaluate_roi"],
  },
  inspection: {
    allowedPostures: ["cost_exposure"],
    defaultObligation: "complete_inspection",
    allowedObligations: ["complete_inspection", "review_findings"],
  },
  payment: {
    allowedPostures: ["direct_revenue", "revenue_recovery"],
    defaultObligation: "reconcile_payment",
    allowedObligations: [
      "reconcile_payment",
      "confirm_checkout",
      "confirm_charge",
      "confirm_payment_intent",
      "activate_subscription",
      "review_subscription_change",
      "handle_churn",
      "process_refund",
      "respond_to_dispute",
      "recover_failed_payment",
      "investigate_payment",
    ],
  },
  support_ticket: {
    allowedPostures: ["non_economic"],
    defaultObligation: "respond",
    allowedObligations: ["respond", "escalate"],
  },
} as const;

export type KernelClass = keyof typeof CLASS_RULES;
export type EconomicPosture =
  | "revenue_candidate"
  | "direct_revenue"
  | "cost_exposure"
  | "revenue_recovery"
  | "non_economic";

export function assertValidClassPosture(
  kernelClass: string,
  economicPosture: string
) {
  const rule = CLASS_RULES[kernelClass as KernelClass];
  if (!rule) {
    throw new Error(`unknown kernel_class: ${kernelClass}`);
  }

  if (!(rule.allowedPostures as readonly string[]).includes(economicPosture)) {
    throw new Error(
      `invalid kernel_class/economic_posture: ${kernelClass}/${economicPosture}`
    );
  }

  return rule;
}

export function assertValidObligationForClass(
  kernelClass: string,
  obligationType: string
) {
  const rule = CLASS_RULES[kernelClass as KernelClass];
  if (!rule) {
    throw new Error(`unknown kernel_class: ${kernelClass}`);
  }

  if (!(rule.allowedObligations as readonly string[]).includes(obligationType)) {
    throw new Error(
      `invalid obligation_type for ${kernelClass}: ${obligationType}`
    );
  }

  return true;
}
