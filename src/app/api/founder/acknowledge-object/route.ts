import { NextResponse } from "next/server"
import { ensureFounderRouteAccess } from "@/lib/founder-console/auth"
import { getFounderSupabase } from "@/lib/founder-console/server"
import { getFounderContext } from "@/lib/founder-console/context"

export async function POST(request: Request) {
  const access = await ensureFounderRouteAccess("/founder")
  if (!access.ok) {
    return access.response
  }

  try {
    const { workspaceId, actorId } = getFounderContext()
    const body = await request.json()
    const supabase = getFounderSupabase()

    const { kernelClass, economicPosture, sourceRef, metadata } = body || {}

    const { data, error } = await supabase.schema("api").rpc("acknowledge_object", {
      p_workspace_id: workspaceId,
      p_kernel_class: kernelClass,
      p_economic_posture: economicPosture,
      p_actor_class: "human",
      p_actor_id: actorId,
      p_metadata: {
        ...(metadata || {}),
        source_ref: sourceRef || null,
        surface: "founder_console",
      },
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true, objectId: data })
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to acknowledge object" },
      { status: 500 }
    )
  }
}
