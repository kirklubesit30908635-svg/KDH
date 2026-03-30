import { NextResponse } from "next/server";
import { requireOperatorRouteContext } from "@/lib/operator-access";
import {
  buildAccessRequiredAutopilot,
  buildOperatorAutopilot,
  buildUnavailableAutopilot,
} from "@/lib/operator-autopilot";
import { loadOperatorQueueRows } from "@/lib/operator-queue";
import { loadOperatorSummary } from "@/lib/operator-summary-read";
import type { NextActionRow } from "@/lib/ui-models";

export async function GET() {
  const access = await requireOperatorRouteContext();
  if (!access.ok) {
    const autopilot =
      access.response.status >= 500
        ? buildUnavailableAutopilot("Operator autopilot access degraded.")
        : buildAccessRequiredAutopilot();

    return NextResponse.json(
      { autopilot },
      { status: access.response.status },
    );
  }

  const { context } = access;
  const [{ summary, status }, queueResult] = await Promise.all([
    loadOperatorSummary(context),
    loadOperatorQueueRows(context).then(
      (rows) => ({ rows, error: null as Error | null }),
      (error) => ({
        rows: [] as NextActionRow[],
        error: error instanceof Error ? error : new Error(String(error)),
      }),
    ),
  ]);

  if (status !== 200) {
    return NextResponse.json(
      { autopilot: buildUnavailableAutopilot(summary.status_message) },
      { status },
    );
  }

  if (queueResult.error) {
    return NextResponse.json(
      { autopilot: buildUnavailableAutopilot(queueResult.error.message) },
      { status: 503 },
    );
  }

  return NextResponse.json({
    autopilot: buildOperatorAutopilot({
      summary,
      rows: queueResult.rows,
    }),
  });
}
