import type { ObligationInput } from "@/lib/obligation-store";
import {
  classifyStripeFirstWedgeSourceEvent,
  type StripeFirstWedgeContractRow,
  type StripeFirstWedgeDisposition,
} from "@/lib/stripe_first_wedge_contract";

export type StripeEventObligationResult = {
  disposition: StripeFirstWedgeDisposition;
  row: StripeFirstWedgeContractRow | null;
  obligation: ObligationInput | null;
};

function formatMoney(cents: unknown) {
  const numeric = Number(cents);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  return `$${(numeric / 100).toFixed(2)}`;
}

function dueAtFromHours(hours: number | null) {
  if (hours === null) {
    return null;
  }

  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function obligationShapeForRow(
  row: StripeFirstWedgeContractRow,
  payload: Record<string, unknown>,
) {
  const obj = (payload.object ?? payload) as Record<string, unknown>;
  const invoiceNumber = String(obj.number ?? obj.id ?? "unknown");
  const chargeRef = String(obj.charge ?? obj.id ?? "unknown");
  const amountPaid = formatMoney(obj.amount_paid);
  const amountRefunded = formatMoney(obj.amount_refunded);

  switch (row.obligation_type) {
    case "operationalize_subscription":
      return {
        title: `Operationalize subscription: ${String(obj.subscription ?? obj.id ?? "unknown")}`,
        why: "Paid subscription checkout completed and requires receipt-backed operational follow-through.",
        severity: "critical",
        dueAtHours: 1,
        economic_ref_type: "subscription",
        economic_ref_id: String(obj.subscription ?? obj.id ?? ""),
      };
    case "record_revenue":
      return {
        title: `Record revenue: ${invoiceNumber}`,
        why: `Invoice ${invoiceNumber} was paid${amountPaid ? ` (${amountPaid})` : ""}.`,
        severity: "queue",
        dueAtHours: 24,
        economic_ref_type: "invoice",
        economic_ref_id: String(obj.id ?? ""),
      };
    case "recover_payment":
      return {
        title: `Recover payment: ${invoiceNumber}`,
        why: `Invoice ${invoiceNumber} failed collection and requires a recovery outcome.`,
        severity: "critical",
        dueAtHours: 24,
        economic_ref_type: "invoice",
        economic_ref_id: String(obj.id ?? ""),
      };
    case "respond_to_dispute":
      return {
        title: `Respond to dispute: ${chargeRef}`,
        why: `A dispute was created for charge ${chargeRef}${obj.reason ? ` (${String(obj.reason)})` : ""}.`,
        severity: "critical",
        dueAtHours: 24 * 7,
        economic_ref_type: "payment",
        economic_ref_id: chargeRef,
      };
    case "process_refund":
      return {
        title: `Process refund: ${chargeRef}`,
        why: `Charge ${chargeRef} was refunded${amountRefunded ? ` (${amountRefunded})` : ""}.`,
        severity: "queue",
        dueAtHours: 24,
        economic_ref_type: "payment",
        economic_ref_id: chargeRef,
      };
    default:
      return null;
  }
}

export function stripeEventToObligation(
  stripeType: string,
  payload: Record<string, unknown>,
): StripeEventObligationResult {
  const contract = classifyStripeFirstWedgeSourceEvent(stripeType);

  if (!contract.row || contract.disposition !== "supported") {
    return {
      disposition: contract.disposition,
      row: contract.row,
      obligation: null,
    };
  }

  if (contract.canonicalSourceEvent === "stripe.customer.subscription.deleted") {
    return {
      disposition: contract.disposition,
      row: contract.row,
      obligation: null,
    };
  }

  const shape = obligationShapeForRow(contract.row, payload);
  if (!shape) {
    return {
      disposition: "unsupported",
      row: contract.row,
      obligation: null,
    };
  }

  return {
    disposition: "supported",
    row: contract.row,
    obligation: {
      title: shape.title,
      why: shape.why,
      face: "billing",
      severity: shape.severity,
      due_at: dueAtFromHours(shape.dueAtHours),
      economic_ref_type: shape.economic_ref_type,
      economic_ref_id: shape.economic_ref_id,
    },
  };
}
