import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

type OperatorRow = {
  id: string;
  handle: string;
};

type WorkspaceMemberRow = {
  workspace_id: string;
  role: string;
  status?: string | null;
};

export type OperatorRouteContext = {
  supabase: Awaited<ReturnType<typeof supabaseServer>>;
  user: {
    id: string;
    email?: string | null;
  };
  operator: OperatorRow;
  memberships: WorkspaceMemberRow[];
  workspaceIds: string[];
  defaultWorkspaceId: string;
};

function chooseDefaultWorkspaceId(workspaceIds: string[]) {
  const configured = process.env.NEXT_PUBLIC_DEFAULT_WORKSPACE_ID;
  if (configured && workspaceIds.includes(configured)) {
    return configured;
  }

  return workspaceIds[0] ?? null;
}

export async function requireOperatorRouteContext(): Promise<
  | { ok: true; context: OperatorRouteContext }
  | { ok: false; response: NextResponse }
> {
  const supabase = await supabaseServer();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const { data: operator, error: operatorErr } = await supabase
    .schema("core")
    .from("operators")
    .select("id, handle")
    .eq("auth_uid", user.id)
    .maybeSingle();

  if (operatorErr || !operator) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: operatorErr?.message ?? "Operator record not found" },
        { status: 403 },
      ),
    };
  }

  const { data: memberships, error: membershipErr } = await supabase
    .schema("core")
    .from("workspace_members")
    .select("workspace_id, role, status")
    .eq("operator_id", operator.id);

  if (membershipErr) {
    return {
      ok: false,
      response: NextResponse.json({ error: membershipErr.message }, { status: 500 }),
    };
  }

  const activeMemberships = ((memberships ?? []) as WorkspaceMemberRow[]).filter(
    (membership) => !membership.status || membership.status === "active",
  );
  const workspaceIds = activeMemberships.map((membership) => membership.workspace_id);
  const defaultWorkspaceId = chooseDefaultWorkspaceId(workspaceIds);

  if (!defaultWorkspaceId) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Operator has no active workspace membership" },
        { status: 403 },
      ),
    };
  }

  return {
    ok: true,
    context: {
      supabase,
      user: {
        id: user.id,
        email: user.email,
      },
      operator: operator as OperatorRow,
      memberships: activeMemberships,
      workspaceIds,
      defaultWorkspaceId,
    },
  };
}
