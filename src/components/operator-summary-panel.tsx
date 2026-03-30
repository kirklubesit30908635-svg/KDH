"use client";
import type { OperatorSummary } from "@/lib/operator-summary";
import {
  AkBadge,
  AkMetricCard,
  AkMetricStrip,
  AkPanel,
  AkUtilityLink,
} from "@/components/ak/ak-ui";

function healthMeta(summary: OperatorSummary) {
  switch (summary.live_state_health) {
    case "idle":
      return {
        label: "Authoritative clear",
        color: "#6ee7b7",
      };
    case "proof_active":
      return {
        label: "Proof active",
        color: "#7dd3fc",
      };
    case "action_required":
      return {
        label: "Action required",
        color: "#fbbf24",
      };
    case "degraded":
      return {
        label: "Degraded read",
        color: "#fb7185",
      };
    case "unavailable":
      return {
        label: "Unavailable",
        color: "#f87171",
      };
    default:
      return {
        label: "Access required",
        color: "#cbd5e1",
      };
  }
}

function fmtDate(value: string | null | undefined) {
  if (!value) return "No timestamp";
  try {
    return new Date(value).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
}

function fmtAge(hours: number | null | undefined) {
  if (hours == null) return "No age";
  if (hours < 1) return "< 1h old";
  if (hours < 24) return `${Math.round(hours)}h old`;
  return `${Math.round(hours / 24)}d old`;
}

export function OperatorSummaryPanel({
  summary,
  className = "",
}: {
  summary: OperatorSummary;
  className?: string;
}) {
  const health = healthMeta(summary);
  const oldest = summary.oldest_unresolved_obligation;
  const oldestTimestamp =
    summary.oldest_unresolved_obligation_at ??
    oldest?.due_at ??
    oldest?.created_at ??
    null;

  return (
    <div className={["space-y-4", className].filter(Boolean).join(" ")}>
      <AkPanel className="overflow-hidden">
        <div className="grid gap-6 border-b border-white/10 p-6 lg:grid-cols-[1.15fr_0.85fr] lg:p-7">
          <div>
            <div className="text-[10px] uppercase tracking-[0.26em] text-slate-500">
              Authoritative operator summary
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <div className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                {summary.status_headline}
              </div>
              <AkBadge color={health.color}>{health.label}</AkBadge>
              {summary.degraded_read_indicator ? (
                <AkBadge tone="danger">Degraded read indicator</AkBadge>
              ) : null}
            </div>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
              {summary.status_message}
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <AkUtilityLink href="/command">Open queue</AkUtilityLink>
              <AkUtilityLink href="/command/receipts">Open receipts</AkUtilityLink>
              <AkUtilityLink href="/command/integrity">Open integrity</AkUtilityLink>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <div className="rounded-[1.4rem] border border-white/10 bg-[#09111a]/85 p-5">
              <div className="text-[10px] uppercase tracking-[0.24em] text-slate-500">
                Oldest unresolved duty
              </div>
              <div className="mt-3 text-lg font-semibold text-white">
                {oldest?.title ?? "No unresolved obligation visible"}
              </div>
              <div className="mt-2 text-sm text-slate-400">
                {oldestTimestamp ? fmtDate(oldestTimestamp) : "No visible unresolved timestamp"}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {oldest?.face ? <AkBadge tone="muted">{oldest.face}</AkBadge> : null}
                {oldest?.severity ? <AkBadge tone="gold">{oldest.severity.replace(/_/g, " ")}</AkBadge> : null}
                <AkBadge tone="muted">{fmtAge(summary.oldest_unresolved_obligation_age)}</AkBadge>
              </div>
            </div>

            <div className="rounded-[1.4rem] border border-white/10 bg-[#09111a]/85 p-5">
              <div className="text-[10px] uppercase tracking-[0.24em] text-slate-500">
                Proof surface
              </div>
              <div className="mt-3 text-lg font-semibold text-white">
                {summary.total_receipts_count} total receipt{summary.total_receipts_count === 1 ? "" : "s"}
              </div>
              <div className="mt-2 text-sm text-slate-400">
                Latest proof observed at {fmtDate(summary.latest_receipt_at)}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <AkBadge color="#7dd3fc">
                  {summary.recent_receipts_count} recent
                </AkBadge>
                <AkBadge tone={summary.proof_lag_summary.count > 0 ? "danger" : "muted"}>
                  {summary.proof_lag_summary.count} lag
                </AkBadge>
              </div>
            </div>
          </div>
        </div>

        {(summary.proof_lag_summary.count > 0 ||
          summary.inconsistency_indicator ||
          summary.degraded_read_indicator) && (
          <div className="grid gap-3 border-b border-white/10 bg-white/[0.02] p-6 lg:grid-cols-3">
            {summary.proof_lag_summary.count > 0 ? (
              <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
                {summary.proof_lag_summary.label}
              </div>
            ) : null}

            {summary.inconsistency_indicator ? (
              <div className="rounded-2xl border border-rose-300/20 bg-rose-300/10 px-4 py-3 text-sm text-rose-100">
                {summary.inconsistency_indicator.label}
              </div>
            ) : null}

            {summary.degraded_read_indicator ? (
              <div className="rounded-2xl border border-rose-300/20 bg-rose-300/10 px-4 py-3 text-sm text-rose-100">
                The read surface is degraded. Do not interpret missing data as clear state.
              </div>
            ) : null}
          </div>
        )}

        <div className="p-6 lg:p-7">
          <AkMetricStrip className="xl:grid-cols-6">
            <AkMetricCard
              label="Open obligations"
              value={String(summary.total_open_obligations)}
              detail="Governed open duty across the operator surface."
            />
            <AkMetricCard
              label="Needs action"
              value={String(summary.needs_action_count)}
              detail="Late plus at-risk actionable pressure."
            />
            <AkMetricCard
              label="Late"
              value={String(summary.late_count)}
              detail="Obligations already past due."
            />
            <AkMetricCard
              label="At risk"
              value={String(summary.at_risk_count)}
              detail="Pressure building but not yet late."
            />
            <AkMetricCard
              label="Recent proof"
              value={String(summary.recent_receipts_count)}
              detail="Recent receipts visible in the proof layer."
            />
            <AkMetricCard
              label="Total proof"
              value={String(summary.total_receipts_count)}
              detail="All visible receipts in the governed read surface."
            />
          </AkMetricStrip>
        </div>
      </AkPanel>

      {summary.oldest_unresolved_obligation?.obligation_id ? (
        <div className="text-xs text-slate-500">
          Oldest visible obligation ID:{" "}
          <span className="font-mono text-slate-400">
            {summary.oldest_unresolved_obligation.obligation_id}
          </span>
        </div>
      ) : null}
    </div>
  );
}
