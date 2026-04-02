"use client";

import type { OperatorWatchdog } from "@/lib/operator-watchdog";
import { fmtDue, fmtObligationType } from "@/lib/ui-fmt";
import {
  AkBadge,
  AkButton,
  AkMetricCard,
  AkMetricStrip,
  AkPanel,
  AkSectionHeader,
} from "@/components/ak/ak-ui";

function toneForMode(mode: OperatorWatchdog["mode"]): "danger" | "gold" | "muted" {
  if (mode === "degraded" || mode === "unavailable" || mode === "access_required") {
    return "danger";
  }

  if (mode === "action_required" || mode === "proof_active") {
    return "gold";
  }

  return "muted";
}

function toneForTrigger(kind: OperatorWatchdog["triggers"][number]["kind"]): "danger" | "gold" | "muted" {
  if (kind === "inconsistency" || kind === "proof_lag" || kind === "late_obligation") {
    return "danger";
  }

  if (kind === "at_risk_obligation") {
    return "gold";
  }

  return "muted";
}

export function OperatorWatchdogPanel({
  watchdog,
  running,
  onRun,
  className,
}: {
  watchdog: OperatorWatchdog;
  running?: boolean;
  onRun?: () => void;
  className?: string;
}) {
  return (
    <AkPanel className={className ? `p-6 sm:p-7 ${className}` : "p-6 sm:p-7"}>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-3xl">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <AkBadge tone={toneForMode(watchdog.mode)}>
              {watchdog.mode.replace(/_/g, " ")}
            </AkBadge>
            {watchdog.degraded_read_indicator ? (
              <AkBadge tone="danger">guarded read</AkBadge>
            ) : null}
          </div>
          <div className="text-2xl font-extrabold tracking-tight text-white">
            {watchdog.headline}
          </div>
          <div className="mt-2 text-sm leading-7 text-white/60">{watchdog.message}</div>
        </div>

        <div className="flex flex-wrap gap-3">
          {watchdog.run ? (
            <div className="rounded-[1.3rem] border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-white/45">
              Last run {new Date(watchdog.run.run_at).toLocaleString()}
            </div>
          ) : null}
          {onRun ? (
            <AkButton tone="gold" disabled={running} onClick={onRun}>
              {running ? "Running watchdog…" : "Run watchdog"}
            </AkButton>
          ) : null}
        </div>
      </div>

      <AkMetricStrip className="mt-6">
        <AkMetricCard
          label="Triggers"
          value={String(watchdog.trigger_count)}
          detail="Current watchdog conditions from governed summary and queue state."
        />
        <AkMetricCard
          label="Late"
          value={String(watchdog.late_trigger_count)}
          detail="Live obligations already late in governed state."
        />
        <AkMetricCard
          label="At Risk"
          value={String(watchdog.at_risk_trigger_count)}
          detail="Live obligations that should escalate before breach."
        />
        <AkMetricCard
          label="Proof / Drift"
          value={String(watchdog.proof_lag_trigger_count + watchdog.inconsistency_trigger_count)}
          detail="Proof lag and hidden-duty inconsistency signals."
        />
      </AkMetricStrip>

      {watchdog.run ? (
        <div className="mt-6 rounded-[1.35rem] border border-white/10 bg-white/[0.03] p-4">
          <div className="text-[11px] font-extrabold uppercase tracking-[0.28em] text-white/30">
            Latest watchdog run
          </div>
          <div className="mt-3 grid gap-3 text-sm text-white/65 md:grid-cols-4">
            <div>
              Evaluated <span className="font-extrabold text-white">{watchdog.run.evaluated_count}</span>
            </div>
            <div>
              Emitted <span className="font-extrabold text-white">{watchdog.run.emitted_signal_count}</span>
            </div>
            <div>
              Late <span className="font-extrabold text-white">{watchdog.run.late_count}</span>
            </div>
            <div>
              At risk <span className="font-extrabold text-white">{watchdog.run.at_risk_count}</span>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-8">
        <AkSectionHeader label="Watchdog trigger set" count={watchdog.triggers.length} />
        <div className="mt-4 grid gap-3">
          {watchdog.triggers.length === 0 ? (
            <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.03] p-4 text-sm leading-7 text-white/55">
              No active watchdog trigger set is visible in governed state.
            </div>
          ) : (
            watchdog.triggers.map((trigger) => (
              <div
                key={`${trigger.kind}:${trigger.obligation_id ?? trigger.headline}`}
                className="rounded-[1.25rem] border border-white/10 bg-white/[0.03] p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <AkBadge tone={toneForTrigger(trigger.kind)}>
                    {trigger.kind.replace(/_/g, " ")}
                  </AkBadge>
                  {trigger.obligation_type ? (
                    <AkBadge tone="muted">{fmtObligationType(trigger.obligation_type)}</AkBadge>
                  ) : null}
                </div>

                <div className="mt-3 text-sm font-extrabold text-white">{trigger.headline}</div>
                <div className="mt-1 text-sm leading-7 text-white/55">{trigger.message}</div>

                <div className="mt-3 flex flex-wrap gap-4 text-xs text-white/40">
                  {trigger.due_at ? <span>Due: {fmtDue(trigger.due_at)}</span> : null}
                  {trigger.location ? <span>Surface: {trigger.location}</span> : null}
                  {trigger.severity ? <span>Severity: {trigger.severity}</span> : null}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </AkPanel>
  );
}
