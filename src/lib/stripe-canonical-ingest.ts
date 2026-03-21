import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  classifyStripeFirstWedgeSourceEvent,
  type StripeFirstWedgeDisposition,
} from "@/lib/stripe_first_wedge_contract";

type StripeIngestRow = {
  event_id: string | null;
  receipt_id: string | null;
  seq: number | null;
  hash: string | null;
};

export type CanonicalStripeIngestResult = {
  providerAccountId: string;
  stripeType: string;
  canonicalType: string;
  wedgeDisposition: StripeFirstWedgeDisposition;
  movementType: string | null;
  obligationType: string | null;
  requiredReceiptType: string | null;
  eventId: string | null;
  receiptId: string | null;
  seq: number | null;
  hash: string | null;
  obligationId?: string | null;
};

export function canonicalStripeEventType(eventType: string) {
  return eventType.startsWith("stripe.") ? eventType : `stripe.${eventType}`;
}

export function resolveStripeProviderAccountId(event: Pick<Stripe.Event, "account">) {
  const providerAccountId =
    typeof event.account === "string" && event.account.length > 0
      ? event.account
      : process.env.STRIPE_ACCOUNT_ID;

  if (!providerAccountId) {
    throw new Error("Missing STRIPE_ACCOUNT_ID and Stripe event.account");
  }

  return providerAccountId;
}

function serializeStripeEvent(event: Stripe.Event): Record<string, unknown> {
  return JSON.parse(JSON.stringify(event)) as Record<string, unknown>;
}

/**
 * After ingesting a customer.subscription.created event, opens an
 * operationalize_subscription obligation via the governed RPC.
 * Errors are non-fatal — ingest success is not gated on this call.
 */
async function openSubscriptionObligation(
  event: Stripe.Event,
  providerAccountId: string
): Promise<string | null> {
  const sub = event.data.object as Stripe.Subscription;
  const subscriptionId = sub.id;
  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? "";

  const { data, error } = await supabaseAdmin
    .schema("api")
    .rpc("open_subscription_obligation", {
      p_provider_account_id:    providerAccountId,
      p_stripe_event_id:        event.id,
      p_stripe_subscription_id: subscriptionId,
      p_stripe_customer_id:     customerId,
      p_livemode:               event.livemode,
      p_metadata:               {},
    });

  if (error) {
    console.error(
      "[stripe-subscription-bridge] open_subscription_obligation failed:",
      error.message
    );
    return null;
  }

  return (data as string) ?? null;
}

export async function ingestStripeEventCanonical(
  event: Stripe.Event
): Promise<CanonicalStripeIngestResult> {
  const providerAccountId = resolveStripeProviderAccountId(event);
  const canonicalType = canonicalStripeEventType(event.type);
  const contract = classifyStripeFirstWedgeSourceEvent(canonicalType);

  const { data, error } = await supabaseAdmin.schema("api").rpc("ingest_stripe_event", {
    p_provider_account_id: providerAccountId,
    p_stripe_event_id: event.id,
    p_stripe_type: canonicalType,
    p_livemode: event.livemode,
    p_api_version: event.api_version ?? null,
    p_stripe_created_at: new Date(event.created * 1000).toISOString(),
    p_payload: serializeStripeEvent(event),
  });

  if (error) {
    throw new Error(`ingest_stripe_event failed: ${error.message}`);
  }

  const row = (Array.isArray(data) ? data[0] : data) as StripeIngestRow | null;
  if (!row) {
    throw new Error(`ingest_stripe_event returned no row for ${event.id}`);
  }

  // Bridge: open an obligation for new subscriptions.
  let obligationId: string | null = null;
  if (event.type === "customer.subscription.created") {
    obligationId = await openSubscriptionObligation(event, providerAccountId);
  }

  return {
    providerAccountId,
    stripeType: event.type,
    canonicalType,
    wedgeDisposition: contract.disposition,
    movementType: contract.row?.movement_type ?? null,
    obligationType: contract.row?.obligation_type ?? null,
    requiredReceiptType:
      contract.disposition === "supported" ? contract.row?.required_receipt_type ?? null : null,
    eventId: row.event_id,
    receiptId: row.receipt_id,
    seq: row.seq,
    hash: row.hash,
    obligationId,
  };
}
