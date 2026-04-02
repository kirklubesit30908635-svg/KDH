"use client";

import type { OperatorAutopilot } from "@/lib/operator-autopilot";
import { fmtDue, fmtFace, fmtObligationType } from "@/lib/ui-fmt";
import {
  AkBadge,
  AkMetricCard,
  AkMetricStrip,
  AkPanel,
  AkSectionHeader,
} from "@/components/ak/ak-ui";

function toneForMode(mode: OperatorAutopilot["mode"]): "danger" | "gold" | "muted" {
  if (mode === "degraded" || mode === "unavailable" || mode === "access_required") {
    return "danger";
  }

  if (mode === "action_required" || mode === "proof_active") {
    return "gold";
  }

  return "muted";
}

function toneForPriority(bucket: "late" | "at_risk" | "queue"): "danger" | "gold" | "muted" {
  if (bucket === "late") {
    return "danger";
  }

  if (bucket === "at_risk") {
    return "gold";
  }

  return "muted";
}

function fmtAge(ageHours: number | null) {
  if (ageHours == null) {
    return "Age unavailable";
  }

  if (ageHours < 24) {
    return `${Math.round(ageHours)}h old`;
  }

  return `${Math.round(ageHours / 24)}d old`;
}

export function OperatorAutopilotPanel({
  autopilot,
  className,
}: {
  autopilot: OperatorAutopilot;
  className?: string;
}) {
  const recommendation = autopilot.recommended_action;

  return (
    <div className={className}>
      <AkPanel className="overflow-hidden p-6 sm:p-7">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <AkBadge tone={toneForMode(autopilot.mode)}>{autopilot.mode.replace(/_/g, " ")}</AkBadge>
              {autopilot.degraded_read_indicator ? (
                <AkBadge tone="danger">guarded read</AkBadge>
              ) : null}
            </div>
            <div className="text-2xl font-extrabold tracking-tight text-white">
              {autopilot.headline}
            </div>
            <div className="mt-2 max-w-2xl text-sm leading-7 text-white/60">
              {autopilot.message}
            </div>
          </div>

          <div className="rounded-[1.4rem] border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-white/45">
            Generated {new Date(autopilot.generated_at).toLocaleString()}
          </div>
        </div>

        <AkMetricStrip className="mt-6">
          <AkMetricCard
            label="Visible Queue"
            value={String(autopilot.visible_queue_count)}
            detail="Rows currently visible in the governed operator queue."
          />
          <AkMetricCard
            label="Actionable"
            value={String(autopilot.actionable_queue_count)}
            detail="Late or at-risk duties that need operator pressure now."
          />
          <AkMetricCard
            label="Monitor"
            value={String(autopilot.monitor_queue_count)}
            detail="Visible backlog that is not yet late or at-risk."
          />
          <AkMetricCard
            label="Recent Proof"
            value={String(autopilot.proof_activity_count)}
            detail="Receipts emitted in the recent proof window."
          />
        </AkMetricStrip>

        {recommendation ? (
          <div className="mt-8 grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,0.95fr)]">
            <AkPanel className="p-5">
              <AkSectionHeader
                label="Recommended Action"
                right={
                  <AkBadge tone={toneForPriority(recommendation.priority_bucket)}>
                    {recommendation.priority_bucket.replace(/_/g, " ")}
                  </AkBadge>
                }
              />

              <div className="mt-5 flex flex-wrap items-center gap-2">
                {recommendation.obligation_type ? (
                  <AkBadge tone="muted">{fmtObligationType(recommendation.obligation_type)}</AkBadge>
                ) : null}
                {recommendation.face ? (
                  <AkBadge tone="muted">{fmtFace(recommendation.face)}</AkBadge>
                ) : null}
                {recommendation.economic_ref_type ? (
                  <AkBadge tone="gold">{recommendation.economic_ref_type}</AkBadge>
                ) : null}
                {recommendation.escalation_required ? (
                  <AkBadge tone="danger">watchdog pressure</AkBadge>
                ) : null}
              </div>

              <div className="mt-4 text-lg font-extrabold text-white">{recommendation.title}</div>
              {recommendation.why ? (
                <div className="mt-2 text-sm leading-7 text-white/55">{recommendation.why}</div>
              ) : null}

              <div className="mt-4 rounded-[1.35rem] border border-white/10 bg-white/[0.03] p-4">
                <div className="text-[11px] font-extrabold uppercase tracking-[0.28em] text-white/30">
                  Operator Goal
                </div>
                <div className="mt-2 text-sm leading-7 text-white/75">
                  {recommendation.playbook.operator_goal}
                </div>
              </div>

              <div className="mt-4 rounded-[1.35rem] border border-white/10 bg-white/[0.03] p-4">
                <div className="text-[11px] font-extrabold uppercase tracking-[0.28em] text-white/30">
                  Proof Requirement
                </div>
                <div className="mt-2 text-sm leading-7 text-white/75">
                  {recommendation.playbook.proof_requirement}
                </div>
              </div>

              <div className="mt-4 grid gap-3 text-sm text-white/55 sm:grid-cols-2">
                <div className="rounded-[1.2rem] border border-white/10 bg-white/[0.03] p-4">
                  <div className="text-[11px] font-extrabold uppercase tracking-[0.24em] text-white/30">
                    Due
                  </div>
                  <div className="mt-2 text-white/75">
                    {recommendation.due_at ? fmtDue(recommendation.due_at) : "No due time recorded"}
                  </div>
                </div>
                <div className="rounded-[1.2rem] border border-white/10 bg-white/[0.03] p-4">
                  <div className="text-[11px] font-extrabold uppercase tracking-[0.24em] text-white/30">
                    Age
                  </div>
                  <div className="mt-2 text-white/75">{fmtAge(recommendation.age_hours)}</div>
                </div>
              </div>
            </AkPanel>

            <AkPanel className="p-5">
              <AkSectionHeader label="Playbook" />

              <div className="mt-5 text-sm font-extrabold text-white">
                {recommendation.playbook.action_label}
              </div>
              <div className="mt-2 text-xs uppercase tracking-[0.24em] text-white/30">
                {recommendation.playbook.source.replace(/_/g, " ")}
              </div>

              <div className="mt-5 space-y-3">
                {recommendation.playbook.steps.map((step) => (
                  <div
                    key={step}
                    className="rounded-[1.2rem] border border-white/10 bg-white/[0.03] p-4 text-sm leading-7 text-white/75"
                  >
                    {step}
                  </div>
                ))}
              </div>

              {recommendation.escalation_reason ? (
                <div className="mt-5 rounded-[1.2rem] border border-rose-300/18 bg-rose-300/8 p-4">
                  <div className="text-[11px] font-extrabold uppercase tracking-[0.24em] text-rose-100/80">
                    Escalation
                  </div>
                  <div className="mt-2 text-sm leading-7 text-rose-50/80">
                    {recommendation.escalation_reason}
                  </div>
                </div>
              ) : null}

              <div className="mt-5 space-y-3">
                <div className="rounded-[1.2rem] border border-white/10 bg-white/[0.03] p-4">
                  <div className="text-[11px] font-extrabold uppercase tracking-[0.24em] text-white/30">
                    Lag Signal
                  </div>
                  <div className="mt-2 text-sm leading-7 text-white/70">
                    {recommendation.playbook.lag_signal}
                  </div>
                </div>
                <div className="rounded-[1.2rem] border border-white/10 bg-white/[0.03] p-4">
                  <div className="text-[11px] font-extrabold uppercase tracking-[0.24em] text-white/30">
                    Failure Signal
                  </div>
                  <div className="mt-2 text-sm leading-7 text-white/70">
                    {recommendation.playbook.failure_signal}
                  </div>
                </div>
              </div>
            </AkPanel>
          </div>
        ) : (
          <div className="mt-8 rounded-[1.4rem] border border-white/10 bg-white/[0.03] p-5 text-sm leading-7 text-white/55">
            No governed recommendation is available while the read surface is guarded or the queue is empty.
          </div>
        )}

        {autopilot.watchlist.length > 1 ? (
          <div className="mt-8">
            <AkSectionHeader label="Watchlist" count={autopilot.watchlist.length} />
            <div className="mt-4 grid gap-3">
              {autopilot.watchlist.slice(1).map((item) => (
                <div
                  key={item.obligation_id}
                  className="rounded-[1.3rem] border border-white/10 bg-white/[0.03] p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <AkBadge tone={toneForPriority(item.priority_bucket)}>
                      {item.priority_bucket.replace(/_/g, " ")}
                    </AkBadge>
                    {item.obligation_type ? (
                      <AkBadge tone="muted">{fmtObligationType(item.obligation_type)}</AkBadge>
                    ) : null}
                  </div>
                  <div className="mt-3 text-sm font-extrabold text-white">{item.title}</div>
                  <div className="mt-1 text-sm text-white/50">
                    {item.playbook.action_label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </AkPanel>
    </div>
  );
}
