import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getFounderSupabase } from "@/lib/founder-console/server";

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
  "invoice.created": {
    kernelClass: "invoice",
    economicPosture: "direct_revenue",
    obligationType: "collect_invoice",
  },
  "invoice.paid": {
    kernelClass: "invoice",
    economicPosture: "direct_revenue",
    obligationType: "record_revenue",
    autoResolve: {
      terminalAction: "closed",
      reasonCode: "customer_declined",
    },
  },
  "invoice.payment_failed": {
    kernelClass: "invoice",
    economicPosture: "revenue_recovery",
    obligationType: "recover_payment",
  },
  "invoice.finalized": {
    kernelClass: "invoice",
    economicPosture: "direct_revenue",
    obligationType: "track_finalized_invoice",
  },
  "invoice.updated": {
    kernelClass: "invoice",
    economicPosture: "direct_revenue",
    obligationType: "review_invoice_update",
  },
  "customer.subscription.created": {
    kernelClass: "payment",
    economicPosture: "direct_revenue",
    obligationType: "activate_subscription",
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
  "charge.succeeded": {
    kernelClass: "payment",
    economicPosture: "direct_revenue",
    obligationType: "confirm_charge",
    autoResolve: {
      terminalAction: "closed",
      reasonCode: "customer_declined",
    },
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
  "payment_intent.succeeded": {
    kernelClass: "payment",
    economicPosture: "direct_revenue",
    obligationType: "confirm_payment_intent",
    autoResolve: {
      terminalAction: "closed",
      reasonCode: "customer_declined",
    },
  },
  "payment_intent.payment_failed": {
    kernelClass: "payment",
    economicPosture: "revenue_recovery",
    obligationType: "recover_failed_payment",
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
  // ---- env var guard (return 200 with error detail so Stripe doesn't retry) ----
  const missing: string[] = [];
  if (!process.env.STRIPE_SECRET_KEY) missing.push("STRIPE_SECRET_KEY");
  if (!process.env.STRIPE_WEBHOOK_SECRET) missing.push("STRIPE_WEBHOOK_SECRET");
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!process.env.NEXT_PUBLIC_DEFAULT_WORKSPACE_ID) missing.push("NEXT_PUBLIC_DEFAULT_WORKSPACE_ID");

  if (missing.length > 0) {
    console.error("[stripe-webhook] Missing env vars:", missing);
    // Return 200 so Stripe stops retrying — config issue, not transient
    return NextResponse.json({ error: "config", missing }, { status: 200 });
  }

  const workspaceId = process.env.NEXT_PUBLIC_DEFAULT_WORKSPACE_ID!;

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2025-11-17.clover" as any,
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
    const results: Record<string, unknown> = { type: event.type };
    const sb = getFounderSupabase();

    // -----------------------------------------------------------------
    // Legacy operator updates
    // -----------------------------------------------------------------
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const authUid = session.metadata?.operator_auth_uid;
      if (authUid && session.customer && session.subscription) {
        await sb
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
        await sb
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
    } else {
      results.skipped = true;
      results.reason = "no kernel mapping for this event type";
    }

    return NextResponse.json({ ok: true, ...results });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[stripe-webhook] Unhandled error:", msg);
    // Still return 200 — we verified the signature, so the event is real.
    // Returning non-200 would cause Stripe to retry endlessly.
    return NextResponse.json({ ok: false, error: msg });
  }
}
