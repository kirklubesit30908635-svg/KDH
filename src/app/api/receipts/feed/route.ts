import { NextResponse } from "next/server";
import { requireOperatorRouteContext } from "@/lib/operator-access";

export async function GET(request: Request) {
  const access = await requireOperatorRouteContext();
  if (!access.ok) {
    return access.response;
  }

  try {
    const { supabase, defaultWorkspaceId, workspaceIds } = access.context;
    const { searchParams } = new URL(request.url);
    const face = searchParams.get("face") ?? null;
    const limit = Number(searchParams.get("limit") ?? "0");

    let query = supabase
      .schema("core")
      .from("v_recent_receipts")
      .select("*")
      .in("workspace_id", workspaceIds)
      .order("created_at", { ascending: false });

    if (face) {
      query = query.eq("face", face);
    }

    if (Number.isFinite(limit) && limit > 0) {
      query = query.limit(limit);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      rows: data ?? [],
      workspace_id: defaultWorkspaceId,
      face_filter: face ?? "all",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
