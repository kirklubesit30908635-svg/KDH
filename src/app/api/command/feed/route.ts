import { NextResponse } from "next/server";
import { requireOperatorRouteContext } from "@/lib/operator-access";

export async function GET() {
  const access = await requireOperatorRouteContext();
  if (!access.ok) {
    return access.response;
  }

  try {
    const { supabase, defaultWorkspaceId } = access.context;

    const query = supabase
      .schema("core")
      .from("v_operator_next_actions")
      .select("*")
      .eq("workspace_id", defaultWorkspaceId)
      .order("is_overdue", { ascending: false })
      .order("due_at", { ascending: true, nullsFirst: false })
      .order("sort_key", { ascending: false });

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      rows: data ?? [],
      workspace_id: defaultWorkspaceId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
