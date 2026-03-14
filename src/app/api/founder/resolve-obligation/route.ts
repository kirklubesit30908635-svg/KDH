import { NextResponse } from "next/server"
import { getFounderSupabase } from "@/lib/founder-console/server"
import { getFounderContext } from "@/lib/founder-console/context"

export async function POST(request: Request) {
  try {
    const { actorId } = getFounderContext()
    const body = await request.json()
    const supabase = getFounderSupabase()

    const { obligationId, terminalAction, reasonCode, metadata } = body || {}

    const { error } = await supabase.schema("api").rpc("resolve_obligation", {
      p_obligation_id: obligationId,
      p_terminal_action: terminalAction,
      p_reason_code: reasonCode,
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

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to resolve obligation" }, { status: 500 })
  }
}
