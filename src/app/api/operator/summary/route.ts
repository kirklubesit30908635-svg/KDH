import { NextResponse } from "next/server";
import { requireOperatorRouteContext } from "@/lib/operator-access";
import {
  buildAccessRequiredSummary,
  buildUnavailableSummary,
} from "@/lib/operator-summary";
import { loadOperatorSummary } from "@/lib/operator-summary-read";

export async function GET() {
  const access = await requireOperatorRouteContext();
  if (!access.ok) {
    const fallbackSummary =
      access.response.status >= 500
        ? buildUnavailableSummary("Operator summary access degraded.")
        : buildAccessRequiredSummary();

    return NextResponse.json(
      { summary: fallbackSummary },
      { status: access.response.status },
    );
  }

  const { summary, status } = await loadOperatorSummary(access.context);
  return NextResponse.json({ summary }, { status });
}
