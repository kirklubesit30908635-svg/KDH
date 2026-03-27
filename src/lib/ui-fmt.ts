export function fmtFace(face: string | null | undefined): string {
  if (!face) return "Unknown";
  const f = face.toLowerCase();
  if (f === "billing") return "Billing";
  if (f === "dealership") return "Dealership";
  if (f === "advertising") return "Advertising";
  if (f === "contractor") return "Contractor";
  return face;
}

export function fmtDue(dueAtIso: string | null | undefined): string | null {
  if (!dueAtIso) return null;
  const d = new Date(dueAtIso);
  if (Number.isNaN(d.getTime())) return dueAtIso;
  return d.toLocaleString();
}

export function safeStr(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

const OBLIGATION_TYPE_LABELS: Record<string, string> = {
  record_revenue: "Record Revenue",
  recover_payment: "Recover Payment",
  respond_to_dispute: "Respond to Dispute",
  process_refund: "Process Refund",
  collect_payment: "Collect Payment",
  collect_invoice: "Collect Invoice",
  review_invoice: "Review Invoice",
  review_invoice_update: "Review Invoice Update",
  track_finalized_invoice: "Track Finalized Invoice",
  write_off_review: "Write-Off Review",
  fund_active_period: "Fund Active Period",
  justify_spend: "Justify Spend",
  follow_up: "Follow Up",
  qualify: "Qualify",
  close_lost: "Close Lost",
  review_plan: "Review Plan",
  downgrade_unused: "Downgrade Unused",
  confirm_dependency: "Confirm Dependency",
  schedule_job: "Schedule Job",
  complete_job: "Complete Job",
  review_cost: "Review Cost",
  track_campaign: "Track Campaign",
  evaluate_roi: "Evaluate ROI",
  complete_inspection: "Complete Inspection",
  review_findings: "Review Findings",
  reconcile_payment: "Reconcile Payment",
  confirm_checkout: "Confirm Checkout",
  confirm_charge: "Confirm Charge",
  confirm_payment_intent: "Confirm Payment Intent",
  activate_subscription: "Activate Subscription",
  review_subscription_change: "Review Subscription Change",
  handle_churn: "Handle Churn",
  recover_failed_payment: "Recover Failed Payment",
  investigate_payment: "Investigate Payment",
  respond: "Respond",
  escalate: "Escalate",
};

export function fmtObligationType(kind: string | null | undefined): string {
  if (!kind) return "Unknown";
  return (
    OBLIGATION_TYPE_LABELS[kind] ??
    kind.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase())
  );
}

const RESOLUTION_ACTION_LABELS: Record<string, string> = {
  record_revenue: "Record Revenue",
  recover_payment: "Recover Payment",
  respond_to_dispute: "Respond to Dispute",
  process_refund: "Process Refund",
  collect_payment: "Mark Collected",
  collect_invoice: "Mark Collected",
  review_invoice: "Mark Reviewed",
  write_off_review: "Mark Reviewed",
  review_invoice_update: "Mark Reviewed",
  track_finalized_invoice: "Mark Tracked",
  fund_active_period: "Confirm Funded",
  justify_spend: "Justify",
  follow_up: "Mark Followed Up",
  qualify: "Qualify",
  close_lost: "Close Lost",
  review_plan: "Mark Reviewed",
  downgrade_unused: "Downgrade",
  confirm_dependency: "Confirm",
  schedule_job: "Schedule",
  complete_job: "Mark Complete",
  review_cost: "Mark Reviewed",
  track_campaign: "Mark Tracked",
  evaluate_roi: "Evaluate ROI",
  complete_inspection: "Mark Complete",
  review_findings: "Mark Reviewed",
  reconcile_payment: "Reconcile",
  confirm_checkout: "Confirm",
  confirm_charge: "Confirm",
  confirm_payment_intent: "Confirm",
  activate_subscription: "Activate",
  review_subscription_change: "Mark Reviewed",
  handle_churn: "Handle",
  recover_failed_payment: "Recover",
  investigate_payment: "Investigate",
  respond: "Respond",
  escalate: "Escalate",
};

export function fmtResolutionAction(kind: string | null | undefined): string {
  if (!kind) return "Seal Obligation";
  return RESOLUTION_ACTION_LABELS[kind] ?? `Seal — ${fmtObligationType(kind)}`;
}

export function fmtEnforcementDomain(face: string | null | undefined): string {
  if (!face) return "Unknown Domain";
  const f = face.toLowerCase();
  if (f === "billing") return "Billing Enforcement";
  if (f === "dealership") return "Dealership Operations";
  if (f === "advertising") return "Advertising Domain";
  if (f === "contractor") return "Contractor Domain";
  return face.replace(/[_-]/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}
