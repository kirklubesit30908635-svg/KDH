// src/lib/kernel/linkOperatorOnLogin.ts
// ============================================================
// Auth Callback → Workspace Linking
// ============================================================
// Called after Supabase auth confirms a session.
// Looks up their email in registry.stripe_customer_map and
// auto-links them to any pre-provisioned workspaces.
//
// Flow:
//   1. Stripe fires → workspace provisioned (no auth user yet)
//   2. User clicks magic link → authenticated
//   3. THIS FUNCTION → links auth user to their workspace
//   4. Redirect → user lands in their workspace
// ============================================================

import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export interface LinkResult {
  ok: boolean;
  operator_id?: string;
  workspaces_linked?: number;
  error?: string;
}

/**
 * Link an authenticated user to their provisioned workspace(s).
 * Call from auth callback after confirming the session.
 * Idempotent — safe to call on every login.
 */
export async function linkOperatorOnLogin(
  authUid: string,
  email: string
): Promise<LinkResult> {
  try {
    const admin = getSupabaseAdmin();

    const { data: result, error } = await admin
      .rpc("link_operator_on_login", {
        p_auth_uid: authUid,
        p_email: email,
      });

    if (error) {
      console.error("[link-operator] RPC error:", error.message);
      return { ok: false, error: error.message };
    }

    const r = result as Record<string, unknown>;

    if ((r.workspaces_linked as number) > 0) {
      console.log(
        `[link-operator] Linked ${r.workspaces_linked} workspace(s) for ${email}`
      );
    }

    return {
      ok: true,
      operator_id: r.operator_id as string,
      workspaces_linked: r.workspaces_linked as number,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[link-operator] Unexpected error:", msg);
    return { ok: false, error: msg };
  }
}
