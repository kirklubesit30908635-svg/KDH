import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { ingestStripeEventCanonical } from "@/lib/stripe-canonical-ingest";
import { provisionFromStripe } from "@/lib/kernel/provisionFromStripe";

export const runtime = "nodejs";

// Stripe event types that trigger customer provisioning
const PROVISIONING_EVENTS = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
]);

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  // ---- env var guard (return 200 with error detail so Stripe doesn't retry) ----
  const missing: string[] = [];
  if (!process.env.STRIPE_SECRET_KEY) missing.push("STRIPE_SECRET_KEY");
  if (!process.env.STRIPE_WEBHOOK_SECRET) missing.push("STRIPE_WEBHOOK_SECRET");
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");

  if (missing.length > 0) {
    console.error("[stripe-webhook] Missing env vars:", missing);
    return NextResponse.json({ error: "config", missing }, { status: 200 });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2026-02-25.clover",
  });

  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
  }

  const rawBody = await req.text();
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[stripe-webhook] Signature verification failed:", msg);
    return NextResponse.json(
      { error: "Signature verification failed", detail: msg },
      { status: 400 }
    );
  }

  // ---- From here on, always return 200 so Stripe doesn't endlessly retry ----
  try {
    const ingest = await ingestStripeEventCanonical(event);

    // ----- PROVISIONING BRIDGE -----
    // For subscription events, provision customer workspace.
    // Non-fatal: ingest success is not gated on provisioning.
    let provisionResult = null;
    if (PROVISIONING_EVENTS.has(event.type)) {
      try {
        provisionResult = await provisionFromStripe(event);
        if (!provisionResult.ok) {
          console.error(
            "[stripe-webhook] Provisioning failed (non-fatal):",
            provisionResult.error
          );
        }
      } catch (provErr: unknown) {
        const provMsg = provErr instanceof Error ? provErr.message : String(provErr);
        console.error("[stripe-webhook] Provisioning error (non-fatal):", provMsg);
      }
    }

    return NextResponse.json({
      ok: true,
      type: event.type,
      provider_account_id: ingest.providerAccountId,
      canonical_type: ingest.canonicalType,
      wedge_disposition: ingest.wedgeDisposition,
      movement_type: ingest.movementType,
      obligation_type: ingest.obligationType,
      required_receipt_type: ingest.requiredReceiptType,
      ledger_event_id: ingest.eventId,
      receipt_id: ingest.receiptId,
      seq: ingest.seq,
      hash: ingest.hash,
      ...(ingest.obligationId != null && { obligation_id: ingest.obligationId }),
      ...(provisionResult != null && {
        provisioning: {
          action: provisionResult.action,
          workspace_id: provisionResult.workspace_id,
          tenant_id: provisionResult.tenant_id,
        },
      }),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[stripe-webhook] Unhandled error:", msg);
    return NextResponse.json({ ok: false, error: msg });
  }
}
