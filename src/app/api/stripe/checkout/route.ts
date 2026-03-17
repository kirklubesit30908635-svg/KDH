import { NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseServer } from "@/lib/supabase-server";

export const runtime = "nodejs";

const PRICE_ID = "price_1SdgqaK4umi7Rlgd15vT8eNQ";

function normalizeNextPath(value: unknown) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return "/command";
  }

  return value;
}

export async function POST(request: Request) {
  const supabase = await supabaseServer();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: "Missing STRIPE_SECRET_KEY" }, { status: 500 });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: "2025-11-17.clover",
  });

  const body = await request.json().catch(() => ({}));
  const nextPath = normalizeNextPath(body?.next);
  const origin = new URL(request.url).origin;
  const cancelPath = `/subscribe?redirect=${encodeURIComponent(nextPath)}`;

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: PRICE_ID, quantity: 1 }],
    customer_email: user.email,
    success_url: new URL(nextPath, origin).toString(),
    cancel_url: new URL(cancelPath, origin).toString(),
    metadata: { operator_auth_uid: user.id },
  });

  return NextResponse.json({ url: session.url });
}
