import { NextRequest, NextResponse } from "next/server";
import { createObligation, createReceipt } from "@/lib/obligation-store";
import { stripeEventToObligation } from "@/lib/stripe-obligations";

export const runtime = "nodejs";

const ALLOWED_TYPES = [
  "invoice.paid",
  "invoice.payment_failed",
  "customer.subscription.created",
  "customer.subscription.deleted",
  "charge.dispute.created",
  "charge.refunded",
];

export async function POST(req: NextRequest) {
  const adminKey = req.headers.get("x-ak-admin-key");
  if (!adminKey || adminKey !== process.env.AK_ADMIN_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const stripeType: string = body.type ?? "invoice.paid";

  if (!ALLOWED_TYPES.includes(stripeType)) {
    return NextResponse.json(
      { error: `Unknown type. Allowed: ${ALLOWED_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  const fakeId = `test_${Date.now()}`;
  const fakePayload: Record<string, unknown> = {
    id: fakeId,
    object: stripeType.split(".")[0],
    amount_paid: 5000,
    amount_refunded: 5000,
    number: `INV-TEST-${Date.now()}`,
    customer: `cus_test_${Date.now()}`,
    ...((body.payload as Record<string, unknown>) ?? {}),
  };

  const oblInput = stripeEventToObligation(stripeType, fakePayload);
  oblInput.idempotency_key = `debug-inject-${fakeId}`;

  const obligation = await createObligation(oblInput);

  const receipt = await createReceipt({
    obligation_id: obligation.id,
    sealed_by: "system:debug-inject",
    face: obligation.face,
    economic_ref_type: obligation.economic_ref_type,
    economic_ref_id: obligation.economic_ref_id,
    payload: {
      injected: true,
      stripe_type: stripeType,
      fake_event_id: fakeId,
    },
  });

  return NextResponse.json({
    ok: true,
    stripe_type: stripeType,
    obligation_id: obligation.id,
    receipt_id: receipt.id,
    title: obligation.title,
  });
}
