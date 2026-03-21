import type Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveStripeProviderAccountId } from "@/lib/stripe-canonical-ingest";

// ---------------------------------------------------------------------------
// Mapping: Stripe event type → obligation_type + display metadata.
// Only events that require operator action open an obligation.
// ---------------------------------------------------------------------------

type ObligationMapping = {
  obligationType: string;
  title: string;
  why: (sub: Stripe.Subscription) => string;
  severity: "critical" | "at_risk" | "due_today" | "queue";
};

const SUBSCRIPTION_OBLIGATION_MAP: Record<string, ObligationMapping> = {
  "customer.subscription.created": {
    obligationType: "operationalize_subscription",
    title: "Onboard new subscriber",
    why: (sub) =>
      `New subscription ${sub.id} created for customer ${typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? "unknown"}`,
    severity: "due_today",
  },
  "customer.subscription.deleted": {
    obligationType: "offboard_subscription",
    title: "Process subscription cancellation",
    why: (sub) =>
      `Subscription ${sub.id} cancelled for customer ${typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? "unknown"}`,
    severity: "at_risk",
  },
};

// ---------------------------------------------------------------------------
// openSubscriptionObligationFromEvent
//
// Called from the Stripe webhook handler after canonical ingest succeeds.
// Opens an idempotent obligation via the kernel RPC.
// Returns the obligation UUID or null if this event type has no mapping.
// Errors are logged but not thrown — ingest already succeeded.
// ---------------------------------------------------------------------------

export async function openSubscriptionObligationFromEvent(
  event: Stripe.Event
): Promise<string | null> {
  const mapping = SUBSCRIPTION_OBLIGATION_MAP[event.type];
  if (!mapping) return null;

  const sub = event.data.object as Stripe.Subscription;
  const customerId =
    typeof sub.customer === "string"
      ? sub.customer
      : (sub.customer as { id?: string })?.id ?? "";

  let providerAccountId: string;
  try {
    providerAccountId = resolveStripeProviderAccountId(event);
  } catch (err) {
    console.error("[subscription-bridge] could not resolve provider account:", err);
    return null;
  }

  const { data, error } = await supabaseAdmin.schema("api").rpc(
    "open_subscription_obligation",
    {
      p_provider_account_id: providerAccountId,
      p_stripe_event_id:     event.id,
      p_subscription_id:     sub.id,
      p_customer_id:         customerId,
      p_obligation_type:     mapping.obligationType,
      p_livemode:            event.livemode,
      p_metadata: {
        title:      mapping.title,
        why:        mapping.why(sub),
        severity:   mapping.severity,
        face:       "billing",
        source_ref: sub.id,
        stripe_type: event.type,
        surface:    "stripe_webhook",
      },
    }
  );

  if (error) {
    console.error(
      "[subscription-bridge] open_subscription_obligation failed:",
      error.message
    );
    return null;
  }

  return (data as string) ?? null;
}
