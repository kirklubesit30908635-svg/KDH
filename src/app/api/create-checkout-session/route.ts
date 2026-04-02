import { NextResponse } from "next/server";
import Stripe from "stripe";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

if (!stripeSecretKey) {
  throw new Error("Missing STRIPE_SECRET_KEY");
}

const stripe = new Stripe(stripeSecretKey, {
  apiVersion: "2026-02-25.clover",
});

type RequestBody = Record<string, unknown>;

async function readOptionalJsonBody(request: Request): Promise<RequestBody> {
  try {
    const raw = await request.text();
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as RequestBody)
      : {};
  } catch {
    return {};
  }
}

export async function POST(request: Request) {
  const priceId = process.env.STRIPE_PRICE_ID;

  if (!priceId) {
    return NextResponse.json(
      { error: "Missing STRIPE_PRICE_ID" },
      { status: 500 }
    );
  }

  try {
    const body = await readOptionalJsonBody(request);
    const obligationId =
      typeof body.obligation_id === "string" && body.obligation_id.length > 0
        ? body.obligation_id
        : null;
    const metadata = obligationId ? { obligation_id: obligationId } : null;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL ?? "https://autokirk.com"}/login`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL ?? "https://autokirk.com"}/subscribe`,
      ...(metadata
        ? {
            metadata,
            subscription_data: {
              metadata,
            },
          }
        : {}),
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("create-checkout-session failed", error);

    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
