"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { OperatorAutopilotPanel } from "@/components/operator-autopilot-panel";
import { OperatorSummaryPanel } from "@/components/operator-summary-panel";
import { fetchOperatorAutopilot } from "@/lib/operator-autopilot-client";
import type { OperatorAutopilot } from "@/lib/operator-autopilot";
import { fetchOperatorSummary } from "@/lib/operator-summary-client";
import type { OperatorSummary } from "@/lib/operator-summary";
import type { NextActionRow } from "@/lib/ui-models";
import { fmtDue, fmtObligationType, fmtResolutionAction, safeStr } from "@/lib/ui-fmt";
import { AkBadge, AkButton, AkPanel, AkSectionHeader, AkShell } from "@/components/ak/ak-ui";

class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

interface ClosureReceipt {
  receipt_id: string;
  obligation_id: string;
  label: string;
}

function fmtAge(ageHours: number | null): string {
  if (ageHours == null) return "";
  if (ageHours < 24) return `${Math.round(ageHours)}h old`;
  return `${Math.round(ageHours / 24)}d old`;
}

function riskTone(row: NextActionRow): "danger" | "gold" | "muted" {
  if (row.is_breach || row.severity === "critical") return "danger";
  if (row.severity === "at_risk" || row.severity === "due_today") return "gold";
  return "muted";
}

export default function CommandPage() {
  const [rows, setRows] = useState<NextActionRow[]>([]);
  const [summary, setSummary] = useState<OperatorSummary | null>(null);
  const [autopilot, setAutopilot] = useState<OperatorAutopilot | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [authLocked, setAuthLocked] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [closureReceipt, setClosureReceipt] = useState<ClosureReceipt | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setErr(null);
    setAuthLocked(false);
    try {
      const [summaryRes, autopilotRes, queueRes] = await Promise.allSettled([
        fetchOperatorSummary(),
        fetchOperatorAutopilot(),
        fetch("/api/command/feed", { cache: "no-store" }),
      ]);

      if (summaryRes.status === "fulfilled") {
        setSummary(summaryRes.value);
        setAuthLocked(summaryRes.value.live_state_health === "access_required");
      } else {
        setSummary(null);
      }

      if (autopilotRes.status === "fulfilled") {
        setAutopilot(autopilotRes.value);
      } else {
        setAutopilot(null);
      }

      if (queueRes.status === "rejected") {
        throw queueRes.reason;
      }

      const j = await queueRes.value.json().catch(() => ({}));
      if (!queueRes.value.ok) {
        throw new ApiError(queueRes.value.status, j.error ?? `HTTP ${queueRes.value.status}`);
      }
      setRows((j.rows ?? []) as NextActionRow[]);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setAuthLocked(true);
        setErr(null);
      } else {
        setErr(`Load failed: ${e instanceof Error ? e.message : String(e)}`);
      }
      setRows([]);
      setAutopilot(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function handleSeal(row: NextActionRow) {
    setActingId(row.obligation_id);
    try {
      const res = await fetch("/api/command/seal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ obligation_id: row.obligation_id, action: "seal" }),
      });
      const json = await res.json();
      if (!res.ok) {
        alert(`Failed: ${json.error ?? "Unknown error"}`);
      } else {
        setClosureReceipt({
          receipt_id: json.receipt_id,
          obligation_id: row.obligation_id,
          label: fmtResolutionAction(row.kind),
        });
        setRows((prev) => prev.filter((item) => item.obligation_id !== row.obligation_id));
        await loadData();
      }
    } catch (e) {
      alert(`Failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setActingId(null);
    }
  }

  return (
    <AkShell
      title="Command"
      subtitle="Resolve governed revenue obligations in the billing enforcement domain. Nothing is complete until closure emits a receipt."
      eyebrow="Billing Enforcement Domain"
    >
      {summary ? <OperatorSummaryPanel summary={summary} /> : null}
      {autopilot ? <OperatorAutopilotPanel autopilot={autopilot} /> : null}

      <AkSectionHeader
        label="Billing queue"
        count={summary?.needs_action_count ?? rows.length}
        right={
          <button
            onClick={() => void loadData()}
            className="text-sm text-slate-400 transition hover:text-white"
          >
            Refresh
          </button>
        }
      />

      {loading && (
        <div className="flex items-center gap-3 text-sm text-white/35">
          <div className="h-1 w-1 animate-pulse rounded-full bg-emerald-400" />
          Loading billing queue…
        </div>
      )}

      {!loading && authLocked && (
        <AkPanel className="p-6">
          <div className="mb-2 text-sm font-extrabold text-white">Sign in to load the billing queue</div>
          <div className="max-w-xl text-sm text-white/60">
            This surface only reads the governed billing enforcement domain for an authenticated operator session.
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/login?redirect=%2Fcommand"
              className="inline-flex items-center justify-center rounded-xl bg-white px-4 py-3 text-sm font-extrabold text-neutral-950 transition hover:bg-white/90"
            >
              Sign in
            </Link>
            <button
              onClick={() => void loadData()}
              className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-extrabold text-white/70 transition hover:border-white/20 hover:text-white"
            >
              Retry
            </button>
          </div>
        </AkPanel>
      )}

      {!loading && err && (
        <AkPanel className="p-6">
          <div className="mb-2 text-sm font-extrabold text-red-400">Error</div>
          <div className="text-sm text-white/60">{err}</div>
          <button
            onClick={() => void loadData()}
            className="mt-4 text-xs font-bold text-white/60 transition hover:text-white hover:underline"
          >
            Retry →
          </button>
        </AkPanel>
      )}

      {!loading && !err && !authLocked && rows.length === 0 && (
        <AkPanel className="p-10 text-center">
          <div className="mb-3 text-4xl text-white/20">◎</div>
          <div className="mb-1 text-base font-extrabold text-white">
            {summary?.live_state_health === "idle" ? "No open obligations" : "No queue rows visible"}
          </div>
          <div className="text-sm text-white/35">
            {summary?.status_message ?? "The authoritative summary could not be loaded."}
          </div>
          <Link href="/command/receipts" className="mt-4 inline-flex text-sm text-cyan-100 transition hover:text-white">
            Open proof layer →
          </Link>
        </AkPanel>
      )}

      {!loading && !err && !authLocked && rows.length > 0 && (
        <div className="grid gap-4">
          {rows.map((row) => {
            const isActing = actingId === row.obligation_id;
            const actionLabel = fmtResolutionAction(row.kind);

            return (
              <AkPanel key={row.obligation_id} className="p-5">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <AkBadge tone={riskTone(row)}>
                        {row.is_breach ? "Late" : safeStr(row.severity).replace(/_/g, " ")}
                      </AkBadge>
                      {row.kind ? <AkBadge tone="muted">{fmtObligationType(row.kind)}</AkBadge> : null}
                      {row.economic_ref_type ? (
                        <AkBadge tone="gold">{safeStr(row.economic_ref_type).toUpperCase()}</AkBadge>
                      ) : null}
                    </div>

                    <div className="text-base font-extrabold leading-snug text-white">{safeStr(row.title)}</div>
                    {row.why ? <div className="mt-1.5 text-sm text-white/45">{row.why}</div> : null}

                    <div className="mt-3 flex flex-wrap gap-4 text-xs text-white/35">
                      {row.due_at ? (
                        <span>
                          Due: <span className={row.is_breach ? "font-bold text-red-400" : "text-white/60"}>{fmtDue(row.due_at)}</span>
                        </span>
                      ) : null}
                      {row.age_hours != null ? <span>{fmtAge(row.age_hours)}</span> : null}
                      {row.economic_ref_id ? (
                        <span>
                          Ref: <span className="font-mono text-[11px] text-white/60">{safeStr(row.economic_ref_id)}</span>
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-start">
                    <AkButton tone="gold" disabled={isActing} onClick={() => void handleSeal(row)}>
                      {isActing ? "Recording…" : actionLabel}
                    </AkButton>
                  </div>
                </div>
              </AkPanel>
            );
          })}
        </div>
      )}

      {closureReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setClosureReceipt(null)} />
          <div className="relative w-full max-w-sm">
            <AkPanel className="p-8 text-center">
              <div className="mb-4 text-5xl">✓</div>
              <div className="mb-1 text-xl font-extrabold text-white">Closure receipt emitted</div>
              <div className="text-sm text-white/55">{closureReceipt.label}</div>
              <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.04] p-4 text-left">
                <div className="mb-2 text-[10px] font-extrabold tracking-widest text-white/30">RECEIPT ID</div>
                <div className="break-all font-mono text-xs text-white/60">{closureReceipt.receipt_id}</div>
              </div>
              <button
                onClick={() => setClosureReceipt(null)}
                className="mt-6 w-full rounded-xl bg-white px-4 py-3 text-sm font-extrabold text-neutral-950 transition hover:bg-white/90"
              >
                Done
              </button>
            </AkPanel>
          </div>
        </div>
      )}
    </AkShell>
  );
}
