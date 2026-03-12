import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request: NextRequest) {
  const supabase = await supabaseServer();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { operator_id: string; workspace_id: string; role: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { operator_id, workspace_id, role } = body;
  if (!operator_id || !workspace_id || !role) {
    return NextResponse.json({ error: "operator_id, workspace_id, and role are required" }, { status: 400 });
  }

  const validRoles = ["owner", "admin", "member", "viewer"];
  if (!validRoles.includes(role)) {
    return NextResponse.json({ error: `role must be one of: ${validRoles.join(", ")}` }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .schema("core")
    .from("memberships")
    .upsert(
      { operator_id, workspace_id, role, status: "active" },
      { onConflict: "operator_id,workspace_id" }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
