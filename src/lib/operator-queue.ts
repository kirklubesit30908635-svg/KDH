import type { OperatorRouteContext } from "@/lib/operator-access";
import type { NextActionRow } from "@/lib/ui-models";

type OperatorReadContext = Pick<OperatorRouteContext, "supabase" | "workspaceIds">;

export async function loadOperatorQueueRows(
  context: OperatorReadContext,
): Promise<NextActionRow[]> {
  const { data, error } = await context.supabase
    .schema("core")
    .from("v_operator_next_actions")
    .select("*")
    .in("workspace_id", context.workspaceIds)
    .order("is_overdue", { ascending: false })
    .order("due_at", { ascending: true, nullsFirst: false })
    .order("sort_key", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as NextActionRow[];
}
