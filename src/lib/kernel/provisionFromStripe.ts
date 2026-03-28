// src/lib/kernel/provisionFromStripe.ts
// ============================================================
// Customer Provisioning — Stripe → Kernel Bridge
// ============================================================
// Called from the Stripe webhook handler when a subscription
// event arrives. Extracts customer/email/subscription from the
// Stripe event payload and calls the kernel provisioning RPC.
//
// This is the ONLY path for creating customer workspaces.
// ============================================================

import type Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export interface ProvisionResult {
  ok: boolean;
  action: "provisioned" | "already_provisioned" | "error";
  tenant_id?: string;
  workspace_id?: string;
  obligation_id?: string;
  receipt_id?: string;
  email?: string;
  slug?: string;
  error?: string;
}

/**
 * Extract provisioning-relevant fields from a Stripe event.
 * Handles checkout.session.completed and customer.subscription.created.
 */
function extractProvisioningData(event: Stripe.Event): {
  stripeCustomerId: string;
  email: string | null;
  subscriptionId: string | null;
  customerName: string | null;
} | null {
  const obj = event.data.object as Record<string, unknown>;

  switch (event.type) {
    case "checkout.session.completed": {
      const customerId = obj.customer as string | undefined;
      const customerDetails = obj.customer_details as Record<string, unknown> | undefined;
      const email =
        (customerDetails?.email as string) ||
        (obj.customer_email as string) ||
        null;
      const subscriptionId = (obj.subscription as string) || null;
      const customerName = (customerDetails?.name as string) || null;

      if (!customerId) return null;
      return { stripeCustomerId: customerId, email, subscriptionId, customerName };
    }

    case "customer.subscription.created": {
      const sub = obj as Record<string, unknown>;
      const customerId =
        typeof sub.customer === "string"
          ? sub.customer
          : (sub.customer as Record<string, unknown>)?.id as string | undefined;

      const customerObj = typeof sub.customer === "object" ? sub.customer as Record<string, unknown> : null;
      const email = (customerObj?.email as string) || null;
      const subscriptionId = (sub.id as string) || null;
      const customerName = (customerObj?.name as string) || null;

      if (!customerId) return null;
      return { stripeCustomerId: customerId, email, subscriptionId, customerName };
    }

    default:
      return null;
  }
}

/**
 * Provision a customer workspace from a Stripe event.
 * Idempotent — safe to call multiple times for the same customer.
 */
export async function provisionFromStripe(
  event: Stripe.Event
): Promise<ProvisionResult> {
  const data = extractProvisioningData(event);

  if (!data) {
    return {
      ok: false,
      action: "error",
      error: `Cannot extract provisioning data from ${event.type}. Missing customer ID.`,
    };
  }

  // If no email available (common with subscription.created),
  // use placeholder — real email links on first login via link_operator_on_login.
  const email = data.email || `pending-${data.stripeCustomerId}@autokirk.provision`;

  try {
    const { data: result, error } = await supabaseAdmin
      .schema("api")
      .rpc("provision_customer_workspace", {
        p_stripe_customer_id: data.stripeCustomerId,
        p_email: email,
        p_subscription_id: data.subscriptionId,
        p_customer_name: data.customerName,
      });

    if (error) {
      console.error("[provision] RPC error:", error.message);
      return { ok: false, action: "error", error: error.message };
    }

    const r = result as Record<string, unknown>;
    console.log(
      `[provision] ${r.action}: ${data.stripeCustomerId} → workspace ${r.workspace_id}`
    );

    return {
      ok: true,
      action: r.action as ProvisionResult["action"],
      tenant_id: r.tenant_id as string,
      workspace_id: r.workspace_id as string,
      obligation_id: r.obligation_id as string,
      receipt_id: r.receipt_id as string,
      email: r.email as string,
      slug: r.slug as string,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[provision] Unexpected error:", msg);
    return { ok: false, action: "error", error: msg };
  }
}
