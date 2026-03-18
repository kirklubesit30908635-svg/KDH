import { NextResponse } from "next/server"
import { ensureFounderRouteAccess } from "@/lib/founder-console/auth"
import { getFounderSupabase } from "@/lib/founder-console/server"
import { getFounderContext } from "@/lib/founder-console/context"
import type { MachineHealth } from "@/lib/founder-console/types"

type ResolvedObligationRow = {
  terminal_action: string | null
  resolved_at: string | null
  resolved_by_actor_id: string | null
}

export async function GET() {
  const access = await ensureFounderRouteAccess("/founder")
  if (!access.ok) {
    return access.response
  }

  try {
    const { workspaceId } = getFounderContext()
    const supabase = getFounderSupabase()

    const [matrixRes, resolvedRes, eventsRes, receiptsRes] = await Promise.all([
      supabase.schema("core").from("object_class_postures")
        .select("kernel_class", { head: true, count: "exact" }),

      supabase.schema("core").from("obligations")
        .select("id,terminal_action,resolved_at,resolved_by_actor_id")
        .eq("workspace_id", workspaceId)
        .eq("state", "resolved")
        .limit(500),

      supabase.schema("ledger").from("events")
        .select("id", { head: true, count: "exact" })
        .eq("workspace_id", workspaceId),

      supabase.schema("ledger").from("receipts")
        .select("id", { head: true, count: "exact" })
        .eq("workspace_id", workspaceId),
    ])

    const firstError = matrixRes.error || resolvedRes.error || eventsRes.error || receiptsRes.error
    if (firstError) {
      return NextResponse.json({ error: firstError.message }, { status: 500 })
    }

    const resolved = (resolvedRes.data || []) as ResolvedObligationRow[]

    const payload: MachineHealth = {
      workspaceId,
      checks: {
        governedClassPostureMatrixPresent: (matrixRes.count || 0) > 0,
        resolvedObligationsCarryTerminalData: resolved.every((row) => !!row.terminal_action),
        receiptsDoNotExceedEvents: (receiptsRes.count || 0) <= (eventsRes.count || 0),
        noResolvedObligationWithoutActor: resolved.every((row) => !!row.resolved_by_actor_id),
        noResolvedObligationWithoutTimestamp: resolved.every((row) => !!row.resolved_at),
      },
    }

    return NextResponse.json(payload)
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load founder machine health" },
      { status: 500 }
    )
  }
}
