import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// Stripe event → kernel class / economic posture mapping
// ---------------------------------------------------------------------------
type KernelMapping = {
  kernelClass: string;
  economicPosture: string;
  obligationType: string;
  autoResolve?: {
    terminalAction: "closed" | "terminated" | "eliminated";
    reasonCode: string;
  };
};

const EVENT_MAP: Record<string, KernelMapping> = {
  "checkout.session.completed": {
    kernelClass: "payment",
    economicPosture: "direct_revenue",
    obligationType: "confirm_checkout",
  },
  "invoice.paid": {
    kernelClass: "invoice",
    economicPosture: "direct_revenue",
    obligationType: "record_revenue",
    autoResolve: {
      terminalAction: "closed",
      reasonCode: "customer_declined", // stripe confirmed payment — closed
    },
  },
  "invoice.payment_failed": {
    kernelClass: "invoice",
    economicPosture: "revenue_recovery",
    obligationType: "recover_payment",
  },
  "customer.subscription.deleted": {
    kernelClass: "payment",
    economicPosture: "revenue_recovery",
    obligationType: "handle_churn",
    autoResolve: {
      terminalAction: "terminated",
      reasonCode: "customer_declined",
    },
  },
  "customer.subscription.updated": {
    kernelClass: "payment",
    economicPosture: "direct_revenue",
    obligationType: "review_subscription_change",
  },
  "charge.refunded": {
    kernelClass: "payment",
    economicPosture: "revenue_recovery",
    obligationType: "process_refund",
    autoResolve: {
      terminalAction: "closed",
      reasonCode: "customer_declined",
    },
  },
  "charge.dispute.created": {
    kernelClass: "payment",
    economicPosture: "revenue_recovery",
    obligationType: "respond_to_dispute",
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function extractSourceRef(event: Stripe.Event): string {
  const obj = event.data.object as Record<string, unknown>;
  return (obj.id as string) || event.id;
}

function extractMetadata(event: Stripe.Event): Record<string, unknown> {
  const obj = event.data.object as Record<string, unknown>;
  const meta: Record<string, unknown> = {
    stripe_event_id: event.id,
    stripe_type: event.type,
    stripe_created: event.created,
    surface: "stripe_webhook",
  };

  if (obj.customer) meta.stripe_customer_id = String(obj.customer);
  if (obj.subscription) meta.stripe_subscription_id = String(obj.subscription);
  if (obj.amount_total != null) meta.amount_total = obj.amount_total;
  if (obj.amount != null) meta.amount = obj.amount;
  if (obj.currency) meta.currency = obj.currency;
  if (obj.amount_paid != null) meta.amount_paid = obj.amount_paid;
  if (obj.amount_due != null) meta.amount_due = obj.amount_due;

  return meta;
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json(
      { error: "Missing Stripe env vars" },
      { status: 500 }
    );
  }

  const workspaceId = process.env.NEXT_PUBLIC_DEFAULT_WORKSPACE_ID;
  if (!workspaceId) {
    return NextResponse.json(
      { error: "Missing NEXT_PUBLIC_DEFAULT_WORKSPACE_ID" },
      { status: 500 }
    );
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: "2025-11-17.clover" as any,
  });

  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json(
      { error: "Missing stripe-signature" },
      { status: 400 }
    );
  }

  const rawBody = await req.text();
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "Signature verification failed", detail: msg },
      { status: 400 }
    );
  }

  const results: Record<string, unknown> = { type: event.type };

  // -----------------------------------------------------------------
  // Legacy operator updates (keep existing behaviour)
  // -----------------------------------------------------------------
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const authUid = session.metadata?.operator_auth_uid;
    if (authUid && session.customer && session.subscription) {
      await supabaseAdmin
        .schema("core")
        .from("operators")
        .update({
          stripe_customer_id: String(session.customer),
          stripe_subscription_id: String(session.subscription),
          subscription_status: "active",
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

  // -----------------------------------------------------------------
  // Kernel object/obligation pipeline
  // -----------------------------------------------------------------
  const mapping = EVENT_MAP[event.type];

  if (mapping) {
    const metadata = extractMetadata(event);
    const sourceRef = extractSourceRef(event);
    const actorId = `stripe:${event.id}`;
    const sb = supabaseAdmin;

    // 1. Acknowledge object
    const { data: objectId, error: ackErr } = await sb
      .schema("api")
      .rpc("acknowledge_object", {
        p_workspace_id: workspaceId,
        p_kernel_class: mapping.kernelClass,
        p_economic_posture: mapping.economicPosture,
        p_actor_class: "system",
        p_actor_id: actorId,
        p_metadata: { ...metadata, source_ref: sourceRef },
      });

    if (ackErr) {
      console.error("[stripe-webhook] acknowledge_object error:", ackErr);
      results.ack_error = ackErr.message;
    } else {
      results.object_id = objectId;

      // 2. Open obligation
      const { data: obligationId, error: oblErr } = await sb
        .schema("api")
        .rpc("open_obligation", {
          p_workspace_id: workspaceId,
          p_object_id: objectId,
          p_obligation_type: mapping.obligationType,
          p_actor_class: "system",
          p_actor_id: actorId,
          p_metadata: { ...metadata, surface: "stripe_webhook" },
        });

      if (oblErr) {
        console.error("[stripe-webhook] open_obligation error:", oblErr);
        results.obl_error = oblErr.message;
      } else {
        results.obligation_id = obligationId;

        // 3. Auto-resolve if mapping says so
        if (mapping.autoResolve && obligationId) {
          const { error: resErr } = await sb
            .schema("api")
            .rpc("resolve_obligation", {
              p_obligation_id: obligationId,
              p_terminal_action: mapping.autoResolve.terminalAction,
              p_reason_code: mapping.autoResolve.reasonCode,
              p_actor_class: "system",
              p_actor_id: actorId,
              p_metadata: {
                ...metadata,
                auto_resolved: true,
                surface: "stripe_webhook",
              },
            });

          if (resErr) {
            console.error("[stripe-webhook] resolve_obligation error:", resErr);
            results.resolve_error = resErr.message;
          } else {
            results.auto_resolved = true;
          }
        }
      }
    }
  }

  return NextResponse.json({ ok: true, ...results });
}
