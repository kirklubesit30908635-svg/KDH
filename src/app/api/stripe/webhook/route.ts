import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createObligation, createReceipt } from "@/lib/obligation-store";
import { stripeEventToObligation } from "@/lib/stripe-obligations";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const env = {
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY ? "set" : "missing",
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET ? "set" : "missing",
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ? "set" : "missing",
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? "set" : "missing",
  };

  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ env, error: "Missing STRIPE_SECRET_KEY" }, { status: 500 });
    }
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      return NextResponse.json({ env, error: "Missing STRIPE_WEBHOOK_SECRET" }, { status: 500 });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2025-11-17.clover" as any,
    });

    const sig = req.headers.get("stripe-signature");
    if (!sig) return NextResponse.json({ env, error: "Missing stripe-signature header" }, { status: 400 });

    const rawBody = await req.text();
    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (e: any) {
      return NextResponse.json(
        { env, error: "Signature verification failed", detail: String(e?.message ?? e) },
        { status: 400 }
      );
    }

    // Resolve provider_account_id: use event.account (Connect) or fall back to env
    const providerAccountId =
      (event as any).account ??
      process.env.STRIPE_ACCOUNT_ID ??
      "";

    if (!providerAccountId) {
      return NextResponse.json(
        { env, error: "Cannot resolve Stripe provider_account_id — set STRIPE_ACCOUNT_ID env var" },
        { status: 500 }
      );
    }

    // Ledger ingest — soft failure (api schema may not exist on all deployments)
    let ingestEventId: string | null = null;
    const { data: ingestData, error: ingestErr } = await supabaseAdmin
      .schema("api")
      .rpc("ingest_stripe_event", {
        p_provider_account_id: providerAccountId,
        p_stripe_event_id:     event.id,
        p_stripe_type:         `stripe.${event.type}`,
        p_livemode:            event.livemode,
        p_api_version:         (event as any).api_version ?? null,
        p_stripe_created_at:   new Date((event as any).created * 1000).toISOString(),
        p_payload:             event,
      });

    if (ingestErr) {
      console.warn("[stripe-webhook] ledger ingest skipped:", ingestErr.message);
    } else {
      const ingestResult = Array.isArray(ingestData) ? ingestData[0] : ingestData;
      ingestEventId = ingestResult?.event_id ?? null;
    }

    // --- Business layer: generate obligation + receipt ---
    let obligationId: string | null = null;
    let businessReceiptId: string | null = null;

    try {
      const eventId = ingestEventId;

      const oblInput = stripeEventToObligation(
        event.type,
        (event.data?.object as unknown as Record<string, unknown>) ?? {}
      );
      oblInput.source_event_id = eventId;
      oblInput.idempotency_key = event.id; // stripe_event_id — prevents duplicates on retry

      const obligation = await createObligation(oblInput);
      obligationId = obligation.id;

      const receipt = await createReceipt({
        obligation_id:     obligation.id,
        sealed_by:         "system:stripe-webhook",
        face:              obligation.face,
        economic_ref_type: obligation.economic_ref_type,
        economic_ref_id:   obligation.economic_ref_id,
        ledger_event_id:   eventId,
        payload: {
          stripe_event_id: event.id,
          stripe_type:     event.type,
          ingested:        true,
        },
      });
      businessReceiptId = receipt.id;
    } catch (oblErr: any) {
      // Log but don't fail — ledger ingest already succeeded
      console.error("[stripe-webhook] obligation/receipt creation failed:", oblErr?.message ?? oblErr);
    }

    // --- Subscription gate: update core.operators ---
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

    return NextResponse.json(
      {
        ok: true,
        received: { id: event.id, type: event.type },
        ingest_event_id: ingestEventId,
        obligation_id: obligationId,
        business_receipt_id: businessReceiptId,
      },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json({ env, err: String(err?.message ?? err) }, { status: 500 });
  }
}
