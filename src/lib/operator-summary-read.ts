import type { OperatorRouteContext } from "@/lib/operator-access";
import {
  buildOperatorSummary,
  buildUnavailableSummary,
  type OperatorSummary,
  type OperatorSummaryRow,
} from "@/lib/operator-summary";

const RECENT_RECEIPTS_WINDOW_HOURS = 24;

type OperatorReadContext = Pick<OperatorRouteContext, "supabase" | "workspaceIds">;

export async function loadOperatorSummary(
  context: OperatorReadContext,
): Promise<{ summary: OperatorSummary; status: number }> {
  try {
    const recentThreshold = new Date(
      Date.now() - RECENT_RECEIPTS_WINDOW_HOURS * 60 * 60 * 1000,
    ).toISOString();

    const [
      openRowsRes,
      recentReceiptsCountRes,
      totalReceiptsCountRes,
      latestReceiptRes,
      rawOpenObligationsRes,
      oldestOpenObligationRes,
      proofLagRes,
    ] = await Promise.all([
      context.supabase
        .schema("core")
        .from("v_operator_next_actions")
        .select(
          "obligation_id, title, face, severity, due_at, created_at, age_hours, is_breach, economic_ref_type, economic_ref_id, location",
        )
        .in("workspace_id", context.workspaceIds),
      context.supabase
        .schema("core")
        .from("v_recent_receipts")
        .select("receipt_id", { count: "exact", head: true })
        .in("workspace_id", context.workspaceIds)
        .gte("created_at", recentThreshold),
      context.supabase
        .schema("core")
        .from("v_recent_receipts")
        .select("receipt_id", { count: "exact", head: true })
        .in("workspace_id", context.workspaceIds),
      context.supabase
        .schema("core")
        .from("v_recent_receipts")
        .select("created_at")
        .in("workspace_id", context.workspaceIds)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      context.supabase
        .schema("core")
        .from("obligations")
        .select("id", { count: "exact", head: true })
        .in("workspace_id", context.workspaceIds)
        .eq("state", "open"),
      context.supabase
        .schema("core")
        .from("obligations")
        .select("created_at")
        .in("workspace_id", context.workspaceIds)
        .eq("state", "open")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
      context.supabase
        .schema("core")
        .from("obligations")
        .select("id", { count: "exact", head: true })
        .in("workspace_id", context.workspaceIds)
        .eq("state", "resolved")
        .is("receipt_id", null),
    ]);

    const errors = [
      openRowsRes.error,
      recentReceiptsCountRes.error,
      totalReceiptsCountRes.error,
      latestReceiptRes.error,
      rawOpenObligationsRes.error,
      oldestOpenObligationRes.error,
      proofLagRes.error,
    ].filter(Boolean);

    if (errors.length > 0) {
      const message = errors[0]?.message ?? "Live state unavailable.";
      return {
        summary: buildUnavailableSummary(message),
        status: 503,
      };
    }

    return {
      summary: buildOperatorSummary({
        openRows: (openRowsRes.data ?? []) as OperatorSummaryRow[],
        rawOpenObligationsCount: rawOpenObligationsRes.count ?? 0,
        oldestUnresolvedObligationAt: oldestOpenObligationRes.data?.created_at ?? null,
        recentReceiptsCount: recentReceiptsCountRes.count ?? 0,
        totalReceiptsCount: totalReceiptsCountRes.count ?? 0,
        latestReceiptAt: latestReceiptRes.data?.created_at ?? null,
        proofLagCount: proofLagRes.count ?? 0,
      }),
      status: 200,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Live state unavailable.";
    return {
      summary: buildUnavailableSummary(message),
      status: 503,
    };
  }
}
