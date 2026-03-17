import Stripe from "stripe";
import { NextResponse } from "next/server";
import { debugRoutesEnabled } from "@/lib/debug-access";
import { ingestStripeEventCanonical } from "@/lib/stripe-canonical-ingest";

export const runtime = "nodejs";

const ALLOWED_TYPES = [
  "invoice.paid",
  "invoice.payment_failed",
  "customer.subscription.created",
  "customer.subscription.deleted",
  "charge.dispute.created",
  "charge.refunded",
  "invoice.updated",
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "charge.succeeded",
];

type DebugStripeInjectRequest = {
  type?: string;
  payload?: Record<string, unknown>;
};

export async function POST(req: Request) {
  if (!debugRoutesEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as DebugStripeInjectRequest;
  const stripeType: string = body.type ?? "invoice.payment_failed";

  if (!ALLOWED_TYPES.includes(stripeType)) {
    return NextResponse.json(
      { error: `Unknown type. Allowed: ${ALLOWED_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  const fakeId = `evt_test_${Date.now()}`;
  const invoiceNum = `INV-TEST-${Date.now()}`;
  const fakePayload: Record<string, unknown> = {
    id: fakeId,
    object: stripeType.split(".")[0],
    amount_paid: 25000,
    amount_refunded: 0,
    number: invoiceNum,
    customer: `cus_test_${Date.now()}`,
    ...((body.payload as Record<string, unknown>) ?? {}),
  };

  const fakeEvent = {
    id: fakeId,
    object: "event",
    api_version: "2026-02-25.clover",
    created: Math.floor(Date.now() / 1000),
    data: { object: fakePayload },
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    type: stripeType,
  } as unknown as Stripe.Event;

  const ingest = await ingestStripeEventCanonical(fakeEvent);

  return NextResponse.json({
    ok: true,
    stripe_type: stripeType,
    canonical_type: ingest.canonicalType,
    provider_account_id: ingest.providerAccountId,
    ledger_event_id: ingest.eventId,
    receipt_id: ingest.receiptId,
    seq: ingest.seq,
    hash: ingest.hash,
  });
}
