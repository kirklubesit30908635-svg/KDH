import { NextResponse } from "next/server";
import {
  requireOperatorRouteContext,
  type OperatorRouteContext,
} from "@/lib/operator-access";
import {
  buildAccessRequiredWatchdog,
  buildOperatorWatchdog,
  buildUnavailableWatchdog,
} from "@/lib/operator-watchdog";
import { loadOperatorQueueRows } from "@/lib/operator-queue";
import { loadOperatorSummary } from "@/lib/operator-summary-read";
import { runWorkspaceWatchdog } from "@/lib/operator-watchdog-run";
import type { NextActionRow } from "@/lib/ui-models";

async function loadWatchdogSurface(context: OperatorRouteContext) {
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

  return {
    summary,
    status,
    queueResult,
  };
}

export async function GET() {
  const access = await requireOperatorRouteContext();
  if (!access.ok) {
    const watchdog =
      access.response.status >= 500
        ? buildUnavailableWatchdog("Operator watchdog access degraded.")
        : buildAccessRequiredWatchdog();

    return NextResponse.json({ watchdog }, { status: access.response.status });
  }

  const surface = await loadWatchdogSurface(access.context);
  if (surface.status !== 200) {
    return NextResponse.json(
      { watchdog: buildUnavailableWatchdog(surface.summary.status_message) },
      { status: surface.status },
    );
  }

  if (surface.queueResult.error) {
    return NextResponse.json(
      { watchdog: buildUnavailableWatchdog(surface.queueResult.error.message) },
      { status: 503 },
    );
  }

  return NextResponse.json({
    watchdog: buildOperatorWatchdog({
      summary: surface.summary,
      rows: surface.queueResult.rows,
    }),
  });
}

export async function POST() {
  const access = await requireOperatorRouteContext();
  if (!access.ok) {
    return access.response;
  }

  try {
    const run = await runWorkspaceWatchdog(
      access.context.supabase,
      access.context.defaultWorkspaceId,
      access.context.user.email ?? access.context.user.id,
    );

    const surface = await loadWatchdogSurface(access.context);
    if (surface.status !== 200) {
      return NextResponse.json(
        {
          run,
          watchdog: buildUnavailableWatchdog(surface.summary.status_message),
        },
        { status: surface.status },
      );
    }

    if (surface.queueResult.error) {
      return NextResponse.json(
        {
          run,
          watchdog: buildUnavailableWatchdog(surface.queueResult.error.message),
        },
        { status: 503 },
      );
    }

    return NextResponse.json({
      run,
      watchdog: buildOperatorWatchdog({
        summary: surface.summary,
        rows: surface.queueResult.rows,
        run,
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Watchdog run failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
