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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function receiptMetadata(payload: unknown): Record<string, unknown> | null {
  const root = asRecord(payload);
  if (!root) return null;

  const direct = asRecord(root.metadata);
  if (direct) return direct;

  const nestedPayload = asRecord(root.payload);
  return nestedPayload ? asRecord(nestedPayload.metadata) : null;
}

export function fmtReceiptLabel(input: {
  payload: unknown;
  face: string | null | undefined;
  receiptType: string | null | undefined;
}): string {
  const metadata = receiptMetadata(input.payload);

  return (
    nonEmptyString(metadata?.proof_kind) ??
    nonEmptyString(metadata?.action) ??
    (input.face && input.face !== "unknown" ? input.face : null) ??
    input.receiptType ??
    "receipt"
  );
}

export function fmtReceiptReasonCode(payload: unknown): string | null {
  const root = asRecord(payload);
  if (!root) return null;

  return (
    nonEmptyString(root.reason_code) ??
    nonEmptyString(asRecord(root.payload)?.reason_code) ??
    null
  );
}

export function fmtReceiptSummary(payload: unknown): string {
  const metadata = receiptMetadata(payload);
  return (
    nonEmptyString(metadata?.insight) ??
    fmtReceiptReasonCode(payload) ??
    "Proof recorded"
  );
}

export function readReceiptMetadata(payload: unknown) {
  const metadata = receiptMetadata(payload);
  return {
    proofKind: nonEmptyString(metadata?.proof_kind),
    action: nonEmptyString(metadata?.action),
    insight: nonEmptyString(metadata?.insight),
    reasonCode: fmtReceiptReasonCode(payload),
  };
}

