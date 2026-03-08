import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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

    const { data, error: ingestErr } = await supabaseAdmin
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
      return NextResponse.json(
        { env, received: { id: event.id, type: event.type }, ingest_error: ingestErr },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { ok: true, received: { id: event.id, type: event.type }, result: data },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json({ env, err: String(err?.message ?? err) }, { status: 500 });
  }
}
