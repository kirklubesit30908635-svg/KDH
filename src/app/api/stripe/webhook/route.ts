import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Missing Stripe env vars" }, { status: 500 });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: "2025-11-17.clover" as any,
  });

  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });

  const rawBody = await req.text();
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (e: any) {
    return NextResponse.json({ error: "Signature verification failed", detail: e?.message }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const authUid = session.metadata?.operator_auth_uid;
    if (authUid && session.customer && session.subscription) {
      await supabaseAdmin
        .schema("core")
        .from("operators")
        .update({
          stripe_customer_id:     String(session.customer),
          stripe_subscription_id: String(session.subscription),
          subscription_status:    "active",
        })
        .eq("auth_uid", authUid);
    }
  }

  if (event.type === "customer.subscription.deleted") {
    const sub = event.data.object as Stripe.Subscription;
    if (sub.customer) {
      await supabaseAdmin
        .schema("core")
        .from("operators")
        .update({ subscription_status: "inactive" })
        .eq("stripe_customer_id", String(sub.customer));
    }
  }

  return NextResponse.json({ ok: true, type: event.type });
}
