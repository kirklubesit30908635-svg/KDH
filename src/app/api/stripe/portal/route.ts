import { NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseServer } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function POST() {
  const supabase = await supabaseServer();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: "Missing STRIPE_SECRET_KEY" }, { status: 500 });
  }

  // Fetch operator's Stripe customer ID
  const { data: operator, error: opErr } = await supabaseAdmin
    .schema("core")
    .from("operators")
    .select("stripe_customer_id")
    .eq("auth_uid", user.id)
    .single();

  if (opErr || !operator?.stripe_customer_id) {
    return NextResponse.json({ error: "No Stripe customer found for this operator" }, { status: 404 });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: "2025-11-17.clover",
  });

  const session = await stripe.billingPortal.sessions.create({
    customer:   operator.stripe_customer_id,
    return_url: "https://autokirk.com/command",
  });

  return NextResponse.json({ url: session.url });
}
