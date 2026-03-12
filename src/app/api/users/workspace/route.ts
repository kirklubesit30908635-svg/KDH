import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Creates a tenant + workspace in one shot.
// If a tenant with the given slug already exists, reuses it.
export async function POST(request: NextRequest) {
  const supabase = await supabaseServer();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { tenant_name: string; tenant_slug: string; workspace_name: string; workspace_slug: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { tenant_name, tenant_slug, workspace_name, workspace_slug } = body;
  if (!tenant_name || !tenant_slug || !workspace_name || !workspace_slug) {
    return NextResponse.json(
      { error: "tenant_name, tenant_slug, workspace_name, workspace_slug are required" },
      { status: 400 }
    );
  }

  // Upsert tenant
  const { data: tenant, error: tenantErr } = await supabaseAdmin
    .schema("core")
    .from("tenants")
    .upsert({ slug: tenant_slug, name: tenant_name }, { onConflict: "slug" })
    .select("id")
    .single();

  if (tenantErr || !tenant) {
    return NextResponse.json({ error: tenantErr?.message ?? "Failed to upsert tenant" }, { status: 500 });
  }

  // Insert workspace
  const { data: workspace, error: wsErr } = await supabaseAdmin
    .schema("core")
    .from("workspaces")
    .upsert(
      { tenant_id: tenant.id, slug: workspace_slug, name: workspace_name },
      { onConflict: "tenant_id,slug" }
    )
    .select("id, name, slug")
    .single();

  if (wsErr || !workspace) {
    return NextResponse.json({ error: wsErr?.message ?? "Failed to upsert workspace" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, workspace });
}
