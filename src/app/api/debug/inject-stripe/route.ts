import { NextResponse } from "next/server";
import { createObligation } from "@/lib/obligation-store";
import { stripeEventToObligation } from "@/lib/stripe-obligations";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const ALLOWED_TYPES = [
  "invoice.paid",
  "invoice.payment_failed",
  "customer.subscription.created",
  "customer.subscription.deleted",
  "charge.dispute.created",
  "charge.refunded",
];

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
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

  // 1. Try to bump the Stripe intake counter by inserting into ingest.stripe_events
  //    Requires a valid provider_connection — look up the first active one
  const { data: conn } = await supabaseAdmin
    .schema("core")
    .from("provider_connections")
    .select("id, workspace_id")
    .eq("provider", "stripe")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (conn) {
    await supabaseAdmin
      .schema("ingest")
      .from("stripe_events")
      .insert({
        provider_connection_id: conn.id,
        workspace_id: conn.workspace_id,
        stripe_event_id: fakeId,
        stripe_type: `stripe.${stripeType}`,
        livemode: false,
        stripe_created_at: new Date().toISOString(),
        payload: { id: fakeId, type: stripeType, data: { object: fakePayload } },
      });
  }

  // 2. Create obligation as OPEN — shows in queue, receipt created when sealed
  const oblInput = stripeEventToObligation(stripeType, fakePayload);
  oblInput.idempotency_key = `debug-inject-${fakeId}`;

  const obligation = await createObligation(oblInput);

  return NextResponse.json({
    ok: true,
    stripe_type: stripeType,
    obligation_id: obligation.id,
    title: obligation.title,
    stripe_intake_incremented: !!conn,
  });
}
