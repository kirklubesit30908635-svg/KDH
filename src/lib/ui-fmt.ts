export const REVENUE_ENFORCEMENT_CATEGORY = "Revenue Enforcement Infrastructure";

export function fmtEnforcementDomain(face: string | null | undefined): string {
  if (!face) return "Unknown";
  const f = face.toLowerCase();
  if (f === "billing") return "Billing";
  if (f === "dealership") return "Dealership";
  if (f === "advertising") return "Advertising";
  if (f === "contractor") return "Contractor";
  return face;
}

export function fmtFace(face: string | null | undefined): string {
  return fmtEnforcementDomain(face);
}

export function fmtObligationType(kind: string | null | undefined): string {
  if (!kind) return "Unknown obligation";

  switch (kind) {
    case "operationalize_subscription":
      return "Subscription operationalization";
    case "activate_operator_access":
      return "Access activation";
    case "record_revenue":
      return "Revenue recording";
    case "recover_payment":
      return "Payment recovery";
    case "respond_to_dispute":
      return "Dispute response";
    case "process_refund":
      return "Refund completion";
    default:
      return kind.replace(/_/g, " ");
  }
}

export function fmtResolutionAction(kind: string | null | undefined): string {
  switch (kind) {
    case "operationalize_subscription":
      return "Resolve subscription operationalization";
    case "activate_operator_access":
      return "Resolve access activation";
    case "record_revenue":
      return "Resolve revenue recording";
    case "recover_payment":
      return "Resolve payment recovery";
    case "respond_to_dispute":
      return "Resolve dispute response";
    case "process_refund":
      return "Resolve refund completion";
    default:
      return "Record closure";
  }
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
