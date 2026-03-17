import { NextResponse } from "next/server"
import { getFounderSupabase } from "@/lib/founder-console/server"
import { getFounderContext } from "@/lib/founder-console/context"
import type { MachineState } from "@/lib/founder-console/types"

export async function GET() {
  try {
    const { workspaceId, actorId, mode } = getFounderContext()
    const supabase = getFounderSupabase()

    const [objectsRes, obligationsRes, eventsRes, receiptsRes] = await Promise.all([
      supabase.schema("core").from("objects")
        .select("id,kernel_class,economic_posture,status,source_ref,acknowledged_at")
        .eq("workspace_id", workspaceId)
        .order("acknowledged_at", { ascending: false })
        .limit(60),

      supabase.schema("core").from("obligations")
        .select("id,object_id,obligation_type,state,opened_at,terminal_action,terminal_reason_code,metadata")
        .eq("workspace_id", workspaceId)
        .order("opened_at", { ascending: true })
        .limit(80),

      supabase.schema("ledger").from("events")
        .select("id,chain_key,seq,event_type_id,payload,created_at")
        .eq("workspace_id", workspaceId)
        .order("seq", { ascending: false })
        .limit(80),

      supabase.schema("ledger").from("receipts")
        .select("id,event_id,receipt_type_id,chain_key,seq,created_at")
        .eq("workspace_id", workspaceId)
        .order("seq", { ascending: false })
        .limit(80),
    ])

    const firstError = objectsRes.error || obligationsRes.error || eventsRes.error || receiptsRes.error
    if (firstError) {
      return NextResponse.json({ error: firstError.message }, { status: 500 })
    }

    const objects = objectsRes.data || []
    const obligations = obligationsRes.data || []
    const events = eventsRes.data || []
    const receipts = receiptsRes.data || []

    const staleObligations = obligations.filter((row) => {
      if (row.state === "resolved") return false
      const ageMs = Date.now() - new Date(row.opened_at).getTime()
      return ageMs > 1000 * 60 * 60 * 8
    }).length

    const payload: MachineState = {
      workspaceId,
      actorId,
      mode,
      objects,
      obligations,
      events,
      receipts,
      metrics: {
        objects: objects.length,
        openObligations: obligations.filter((row) => row.state !== "resolved").length,
        resolvedObligations: obligations.filter((row) => row.state === "resolved").length,
        events: events.length,
        receipts: receipts.length,
        staleObligations,
      },
    }

    return NextResponse.json(payload)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load founder machine state"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
