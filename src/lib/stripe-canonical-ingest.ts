import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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
  eventId: string | null;
  receiptId: string | null;
  seq: number | null;
  hash: string | null;
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

export async function ingestStripeEventCanonical(
  event: Stripe.Event
): Promise<CanonicalStripeIngestResult> {
  const providerAccountId = resolveStripeProviderAccountId(event);
  const canonicalType = canonicalStripeEventType(event.type);

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

  return {
    providerAccountId,
    stripeType: event.type,
    canonicalType,
    eventId: row.event_id,
    receiptId: row.receipt_id,
    seq: row.seq,
    hash: row.hash,
  };
}
