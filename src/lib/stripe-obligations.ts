import type { ObligationInput } from "@/lib/obligation-store";

/**
 * Maps a Stripe event type + payload to obligation parameters.
 * Returns the fields needed to create a core.obligation row.
 */
export function stripeEventToObligation(
  stripeType: string,
  payload: Record<string, unknown>
): ObligationInput {
  const obj = (payload.object ?? payload) as Record<string, unknown>;

  switch (stripeType) {
    case "invoice.paid":
      return {
        title: `Record payment: ${obj.number ?? obj.id ?? "unknown"}`,
        why: `Invoice ${obj.number ?? "unknown"} paid${obj.amount_paid ? ` ($${(Number(obj.amount_paid) / 100).toFixed(2)})` : ""}`,
        face: "billing",
        severity: "queue",
        economic_ref_type: "invoice",
        economic_ref_id: String(obj.id ?? ""),
      };

    case "invoice.payment_failed":
      return {
        title: `Resolve failed payment: ${obj.number ?? obj.id ?? "unknown"}`,
        why: `Payment failed for invoice ${obj.number ?? "unknown"}`,
        face: "billing",
        severity: "critical",
        economic_ref_type: "invoice",
        economic_ref_id: String(obj.id ?? ""),
        due_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      };

    case "customer.subscription.created":
      return {
        title: "Onboard new subscriber",
        why: `New subscription created for customer ${obj.customer ?? "unknown"}`,
        face: "billing",
        severity: "due_today",
        economic_ref_type: "customer",
        economic_ref_id: String(obj.customer ?? ""),
        due_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      };

    case "customer.subscription.deleted":
      return {
        title: "Process subscription cancellation",
        why: `Subscription cancelled for customer ${obj.customer ?? "unknown"}`,
        face: "billing",
        severity: "at_risk",
        economic_ref_type: "customer",
        economic_ref_id: String(obj.customer ?? ""),
        due_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      };

    case "charge.dispute.created":
      return {
        title: "Respond to dispute",
        why: `Charge dispute filed: ${obj.reason ?? "unknown reason"}`,
        face: "billing",
        severity: "critical",
        economic_ref_type: "invoice",
        economic_ref_id: String(obj.charge ?? obj.id ?? ""),
        due_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      };

    case "charge.refunded":
      return {
        title: `Record refund: ${obj.id ?? "unknown"}`,
        why: `Charge ${obj.id ?? "unknown"} refunded${obj.amount_refunded ? ` ($${(Number(obj.amount_refunded) / 100).toFixed(2)})` : ""}`,
        face: "billing",
        severity: "queue",
        economic_ref_type: "invoice",
        economic_ref_id: String(obj.id ?? ""),
      };

    default:
      return {
        title: `Process Stripe event: ${stripeType}`,
        why: `Stripe event ${stripeType} received`,
        face: "billing",
        severity: "queue",
        economic_ref_type: "unknown",
        economic_ref_id: String(obj.id ?? ""),
      };
  }
}
