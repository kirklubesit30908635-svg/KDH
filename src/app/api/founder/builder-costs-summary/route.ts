import { NextResponse } from "next/server"
import { ensureFounderRouteAccess } from "@/lib/founder-console/auth"
import { getFounderSupabase } from "@/lib/founder-console/server"
import { getFounderContext } from "@/lib/founder-console/context"

type SummaryObjectRow = {
  id: string
  acknowledged_at: string
  metadata: Record<string, unknown> | null
}

type SummaryObligationRow = {
  id: string
  object_id: string
  obligation_type: string
  state: string
  opened_at: string
  terminal_action: string | null
  metadata: Record<string, unknown> | null
}

export async function GET() {
  const access = await ensureFounderRouteAccess("/founder/builder-costs")
  if (!access.ok) {
    return access.response
  }

  try {
    const { workspaceId } = getFounderContext()
    const supabase = getFounderSupabase()

    const [objectsRes, obligationsRes] = await Promise.all([
      supabase
        .schema("core")
        .from("objects")
        .select("id, acknowledged_at, metadata")
        .eq("workspace_id", workspaceId)
        .contains("metadata", { face: "builder_operating_costs", object_kind: "subscription" })
        .order("acknowledged_at", { ascending: false }),
      supabase
        .schema("core")
        .from("obligations")
        .select("id, object_id, obligation_type, state, opened_at, terminal_action, metadata")
        .eq("workspace_id", workspaceId)
        .contains("metadata", { face: "builder_operating_costs" })
        .order("opened_at", { ascending: false }),
    ])

    const firstError = objectsRes.error || obligationsRes.error
    if (firstError) {
      return NextResponse.json({ error: firstError.message }, { status: 500 })
    }

    const subscriptions = (objectsRes.data ?? []) as SummaryObjectRow[]
    const obligations = (obligationsRes.data ?? []) as SummaryObligationRow[]
    const unresolved = obligations.filter((row) => row.state !== "resolved")

    const knownBurn = subscriptions
      .map((row) => row.metadata?.monthly_burn_cents)
      .filter((value): value is number => typeof value === "number")

    const monthlyBurnCents =
      knownBurn.length === subscriptions.length && subscriptions.length > 0
        ? knownBurn.reduce((sum, value) => sum + value, 0)
        : null

    const vendorProofCount = subscriptions.filter((row) => {
      const kind = row.metadata?.proof_kind
      return typeof kind === "string" && kind !== "founder_attestation"
    }).length

    const recentSubscriptions = subscriptions.slice(0, 4).map((row) => ({
      id: row.id,
      acknowledged_at: row.acknowledged_at,
      subscription_name: typeof row.metadata?.subscription_name === "string" ? row.metadata.subscription_name : row.id,
      subscription_key: typeof row.metadata?.subscription_key === "string" ? row.metadata.subscription_key : null,
      vendor: typeof row.metadata?.vendor === "string" ? row.metadata.vendor : "Unknown vendor",
      monthly_burn_cents: typeof row.metadata?.monthly_burn_cents === "number" ? row.metadata.monthly_burn_cents : null,
      proof_kind: typeof row.metadata?.proof_kind === "string" ? row.metadata.proof_kind : "unknown",
      build_dependency: typeof row.metadata?.build_dependency === "string" ? row.metadata.build_dependency : null,
    }))

    return NextResponse.json({
      active_subscriptions: subscriptions.length,
      open_cost_obligations: unresolved.length,
      monthly_burn_cents: monthlyBurnCents,
      monthly_burn_status: monthlyBurnCents === null ? "pending_vendor_amounts" : "measured",
      vendor_proof_count: vendorProofCount,
      founder_attested_count: subscriptions.length - vendorProofCount,
      recent_subscriptions: recentSubscriptions,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load builder cost summary"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
