import { NextResponse } from "next/server"
import { getFounderSupabase } from "@/lib/founder-console/server"
import { getFounderContext } from "@/lib/founder-console/context"

export async function POST(request: Request) {
  try {
    const { workspaceId, actorId } = getFounderContext()
    const body = await request.json()
    const supabase = getFounderSupabase()

    const { objectId, obligationType, metadata } = body || {}

    const { data, error } = await supabase.schema("api").rpc("open_obligation", {
      p_workspace_id: workspaceId,
      p_object_id: objectId,
      p_obligation_type: obligationType,
      p_actor_class: "human",
      p_actor_id: actorId,
      p_metadata: {
        ...(metadata || {}),
        surface: "founder_console",
      },
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true, obligationId: data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to open obligation" }, { status: 500 })
  }
}
