"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { NextActionRow } from "@/lib/ui-models";
import { fmtDue, safeStr } from "@/lib/ui-fmt";
import { AkBadge, AkButton, AkPanel, AkSectionHeader, AkShell } from "@/components/ak/ak-ui";

class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

interface SealedReceipt {
  receipt_id: string;
  obligation_id: string;
  label: string;
}

function fmtAge(ageHours: number | null): string {
  if (ageHours == null) return "";
  if (ageHours < 24) return `${Math.round(ageHours)}h old`;
  return `${Math.round(ageHours / 24)}d old`;
}

function primaryActionLabel(kind: string | null | undefined) {
  switch (kind) {
    case "record_revenue":
      return "Seal revenue recorded";
    case "recover_payment":
      return "Seal recovery outcome";
    case "respond_to_dispute":
      return "Seal dispute outcome";
    case "process_refund":
      return "Seal refund completion";
    case "operationalize_subscription":
      return "Seal subscriber onboarded";
    default:
      return "Seal closure";
  }
}

function riskTone(row: NextActionRow): "danger" | "gold" | "muted" {
  if (row.is_breach || row.severity === "critical") return "danger";
  if (row.severity === "at_risk" || row.severity === "due_today") return "gold";
  return "muted";
}

export default function CommandPage() {
  const [rows, setRows] = useState<NextActionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [authLocked, setAuthLocked] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [sealedReceipt, setSealedReceipt] = useState<SealedReceipt | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setErr(null);
    setAuthLocked(false);
    try {
      const res = await fetch("/api/command/feed", { cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new ApiError(res.status, j.error ?? `HTTP ${res.status}`);
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
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const counts = useMemo(() => {
    const late = rows.filter((row) => row.is_breach).length;
    const atRisk = rows.filter(
      (row) => !row.is_breach && (row.severity === "critical" || row.severity === "at_risk"),
    ).length;
    const dueSoon = rows.filter((row) => row.severity === "due_today").length;
    return {
      total: rows.length,
      late,
      atRisk,
      dueSoon,
    };
  }, [rows]);

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
        setSealedReceipt({
          receipt_id: json.receipt_id,
          obligation_id: row.obligation_id,
          label: primaryActionLabel(row.kind),
        });
        setRows((prev) => prev.filter((item) => item.obligation_id !== row.obligation_id));
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
      subtitle="One governed queue for the frozen Stripe billing wedge. Resolve what is late first, then what is at risk, then what is still open."
      eyebrow="Billing Wedge Action Rail"
    >
      <div className="grid gap-4 md:grid-cols-4">
        <AkPanel className="p-5">
          <div className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Needs action</div>
          <div className="mt-3 text-3xl font-semibold text-white">{counts.total}</div>
          <div className="mt-2 text-sm text-slate-400">Live governed obligations in the billing wedge.</div>
        </AkPanel>
        <AkPanel className="p-5">
          <div className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Late</div>
          <div className="mt-3 text-3xl font-semibold text-rose-200">{counts.late}</div>
          <div className="mt-2 text-sm text-slate-400">Open obligations already past due.</div>
        </AkPanel>
        <AkPanel className="p-5">
          <div className="text-[10px] uppercase tracking-[0.24em] text-slate-500">At risk</div>
          <div className="mt-3 text-3xl font-semibold text-amber-100">{counts.atRisk}</div>
          <div className="mt-2 text-sm text-slate-400">Critical or at-risk items not yet late.</div>
        </AkPanel>
        <AkPanel className="p-5">
          <div className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Proved</div>
          <div className="mt-3 text-lg font-semibold text-white">Receipt-backed</div>
          <div className="mt-2 text-sm text-slate-400">Completed work must be visible in receipts.</div>
          <Link href="/command/receipts" className="mt-4 inline-flex text-sm text-cyan-100 transition hover:text-white">
            Open proof layer →
          </Link>
        </AkPanel>
      </div>

      <div className="flex items-center justify-between gap-3">
        <AkSectionHeader label="Billing queue" count={rows.length} />
        <button onClick={() => void loadData()} className="text-sm text-slate-400 transition hover:text-white">
          Refresh
        </button>
      </div>

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
            This surface only reads the governed Stripe billing wedge for an authenticated operator session.
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
          <div className="mb-3 text-4xl">✓</div>
          <div className="mb-1 text-base font-extrabold text-white">Billing wedge clear</div>
          <div className="text-sm text-white/35">No open Stripe billing obligations require action right now.</div>
        </AkPanel>
      )}

      {!loading && !err && !authLocked && rows.length > 0 && (
        <div className="grid gap-4">
          {rows.map((row) => {
            const isActing = actingId === row.obligation_id;
            const actionLabel = primaryActionLabel(row.kind);

            return (
              <AkPanel key={row.obligation_id} className="p-5">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <AkBadge tone={riskTone(row)}>
                        {row.is_breach ? "Late" : safeStr(row.severity).replace(/_/g, " ")}
                      </AkBadge>
                      {row.kind ? <AkBadge tone="muted">{row.kind.replace(/_/g, " ")}</AkBadge> : null}
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
                      {isActing ? "Sealing…" : actionLabel}
                    </AkButton>
                  </div>
                </div>
              </AkPanel>
            );
          })}
        </div>
      )}

      {sealedReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setSealedReceipt(null)} />
          <div className="relative w-full max-w-sm">
            <AkPanel className="p-8 text-center">
              <div className="mb-4 text-5xl">✓</div>
              <div className="mb-1 text-xl font-extrabold text-white">Receipt emitted</div>
              <div className="text-sm text-white/55">{sealedReceipt.label}</div>
              <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.04] p-4 text-left">
                <div className="mb-2 text-[10px] font-extrabold tracking-widest text-white/30">RECEIPT ID</div>
                <div className="break-all font-mono text-xs text-white/60">{sealedReceipt.receipt_id}</div>
              </div>
              <button
                onClick={() => setSealedReceipt(null)}
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
