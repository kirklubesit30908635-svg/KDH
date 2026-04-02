import Stripe from "stripe";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

type JsonRecord = Record<string, unknown>;

type OpenObligationRow = {
  id: string;
};

export type PaymentResolutionResult =
  | { status: "not_applicable" | "not_bound" | "missing_obligation"; obligation_id?: undefined }
  | { status: "already_resolved"; obligation_id: string }
  | {
      status: "resolved";
      obligation_id: string;
      transition_state: "closed_revenue";
      transition_id: string;
      ledger_event_id: string;
      receipt_id: string;
    };

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  return null;
}

async function findObligationBySubscriptionId(subscriptionId: string) {
  const { data: objectRow, error: objectError } = await supabaseAdmin
    .schema("core")
    .from("objects")
    .select("id")
    .eq("kernel_class", "subscription")
    .eq("source_ref", subscriptionId)
    .maybeSingle();

  if (objectError) {
    throw new Error(`Failed to load subscription object: ${objectError.message}`);
  }

  if (!objectRow?.id) {
    return null;
  }

  const { data: obligationRow, error: obligationError } = await supabaseAdmin
    .schema("core")
    .from("obligations")
    .select("id")
    .eq("object_id", objectRow.id)
    .neq("state", "resolved")
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (obligationError) {
    throw new Error(`Failed to load open obligation: ${obligationError.message}`);
  }

  return (obligationRow as OpenObligationRow | null) ?? null;
}

async function resolveBoundObligation(
  stripe: Stripe,
  paymentIntent: Stripe.PaymentIntent,
) {
  const paymentIntentRecord = asRecord(paymentIntent as unknown);
  const directObligationId = firstString(paymentIntent.metadata?.obligation_id);
  const directSubscriptionId = firstString(paymentIntent.metadata?.stripe_subscription_id);
  if (directObligationId) {
    return {
      obligationId: directObligationId,
      invoiceId: firstString(paymentIntentRecord.invoice),
      subscriptionId: directSubscriptionId,
    };
  }

  const invoiceId = firstString(paymentIntentRecord.invoice);

  if (!invoiceId) {
    return {
      obligationId: null,
      invoiceId: null,
      subscriptionId: directSubscriptionId,
    };
  }

  const invoice = await stripe.invoices.retrieve(invoiceId, {
    expand: ["subscription"],
  });

  const invoiceRecord = asRecord(invoice as unknown);
  const invoiceSubscriptionId =
    typeof invoiceRecord.subscription === "string"
      ? invoiceRecord.subscription
      : firstString(asRecord(invoiceRecord.subscription).id);
  const invoiceObligationId = firstString(invoice.metadata?.obligation_id);
  if (invoiceObligationId) {
    return {
      obligationId: invoiceObligationId,
      invoiceId,
      subscriptionId: firstString(directSubscriptionId, invoiceSubscriptionId),
    };
  }

  const subscriptionId = invoiceSubscriptionId;

  if (!subscriptionId) {
    return {
      obligationId: null,
      invoiceId,
      subscriptionId: directSubscriptionId,
    };
  }

  const obligationRow = await findObligationBySubscriptionId(subscriptionId);
  return {
    obligationId: obligationRow?.id ?? null,
    invoiceId,
    subscriptionId,
  };
}

export async function resolvePaymentIntentObligation(
  event: Stripe.Event,
  stripe: Stripe,
): Promise<PaymentResolutionResult> {
  if (event.type !== "payment_intent.succeeded") {
    return { status: "not_applicable" };
  }

  const paymentIntent = event.data.object as Stripe.PaymentIntent;
  const binding = await resolveBoundObligation(stripe, paymentIntent);
  const obligationId = binding.obligationId;

  if (!obligationId) {
    return { status: "not_bound" };
  }

  const { data, error } = await supabaseAdmin.schema("api").rpc("record_obligation_transition", {
    p_obligation_id: obligationId,
    p_next_state: "closed_revenue",
    p_actor_class: "stripe_webhook",
    p_actor_id: paymentIntent.id,
    p_reason_code: "action_completed",
    p_payload: {
      payment_intent_id: paymentIntent.id,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      invoice_id: binding.invoiceId,
      stripe_event_id: event.id,
      stripe_subscription_id: binding.subscriptionId,
      metadata: {
        stripe_event_id: event.id,
        stripe_payment_intent_id: paymentIntent.id,
        stripe_invoice_id: binding.invoiceId,
        stripe_subscription_id: binding.subscriptionId,
        payment_amount: paymentIntent.amount,
        payment_currency: paymentIntent.currency,
        closure_surface: "stripe_webhook",
      },
    },
    p_terminal_action: "closed",
    p_initial_state: "pending_payment",
  });

  if (error) {
    if (error.message.includes("already resolved")) {
      return { status: "already_resolved", obligation_id: obligationId };
    }

    if (error.message.includes("not found")) {
      return { status: "missing_obligation" };
    }

    throw new Error(`record_obligation_transition failed: ${error.message}`);
  }

  const result = asRecord(data);
  const transitionId = firstString(result.transition_id);
  const ledgerEventId = firstString(result.ledger_event_id);
  const receiptId = firstString(result.receipt_id);

  if (!transitionId || !ledgerEventId || !receiptId) {
    throw new Error("record_obligation_transition returned an invalid payload");
  }

  return {
    status: "resolved",
    obligation_id: obligationId,
    transition_state: "closed_revenue",
    transition_id: transitionId,
    ledger_event_id: ledgerEventId,
    receipt_id: receiptId,
  };
}
