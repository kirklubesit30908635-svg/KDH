import { NextResponse } from "next/server";
import { requireOperatorRouteContext } from "@/lib/operator-access";
import { loadOperatorQueueRows } from "@/lib/operator-queue";

export async function GET() {
  const access = await requireOperatorRouteContext();
  if (!access.ok) {
    return access.response;
  }

  try {
    const { workspaceIds } = access.context;
    const rows = await loadOperatorQueueRows(access.context);

    return NextResponse.json({
      rows,
      workspace_ids: workspaceIds,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
