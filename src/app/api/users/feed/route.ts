import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type WorkspaceRef = {
  name: string | null;
  slug: string | null;
};

type MembershipRow = {
  operator_id: string;
  role: string;
  created_at: string;
  workspace_id: string;
  workspaces: WorkspaceRef | WorkspaceRef[] | null;
};

export async function GET() {
  const supabase = await supabaseServer();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { data: operators, error: opErr } = await supabaseAdmin
      .schema("core")
      .from("operators")
      .select("id, handle, auth_uid, created_at, stripe_customer_id, stripe_subscription_id, subscription_status")
      .order("created_at", { ascending: true });

    if (opErr) {
      return NextResponse.json({ error: opErr.message }, { status: 500 });
    }

    const { data: memberships, error: memErr } = await supabaseAdmin
      .schema("core")
      .from("memberships")
      .select("operator_id, role, created_at, workspace_id, workspaces(id, name, slug)");

    if (memErr) {
      return NextResponse.json({ error: memErr.message }, { status: 500 });
    }

    const { data: workspaces, error: wsErr } = await supabaseAdmin
      .schema("core")
      .from("workspaces")
      .select("id, name, slug");

    if (wsErr) {
      return NextResponse.json({ error: wsErr.message }, { status: 500 });
    }

    const membershipsByOperator: Record<string, { workspace_id: string; workspace_name: string; workspace_slug: string; role: string; joined_at: string }[]> = {};
    for (const m of (memberships ?? []) as MembershipRow[]) {
      if (!membershipsByOperator[m.operator_id]) {
        membershipsByOperator[m.operator_id] = [];
      }
      const ws = Array.isArray(m.workspaces) ? m.workspaces[0] ?? null : m.workspaces;
      membershipsByOperator[m.operator_id].push({
        workspace_id: m.workspace_id,
        workspace_name: ws?.name ?? m.workspace_id,
        workspace_slug: ws?.slug ?? "",
        role: m.role,
        joined_at: m.created_at,
      });
    }

    const rows = (operators ?? []).map((op) => ({
      id: op.id,
      handle: op.handle,
      auth_uid: op.auth_uid,
      created_at: op.created_at,
      stripe_customer_id: op.stripe_customer_id ?? null,
      stripe_subscription_id: op.stripe_subscription_id ?? null,
      subscription_status: op.subscription_status ?? "inactive",
      memberships: membershipsByOperator[op.id] ?? [],
    }));

    return NextResponse.json({
      rows,
      workspaces: (workspaces ?? []).map((w) => ({ id: w.id, name: w.name, slug: w.slug })),
      stats: {
        total_operators: rows.length,
        linked_operators: rows.filter((r) => r.auth_uid).length,
        total_workspaces: (workspaces ?? []).length,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
