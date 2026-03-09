"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { NextActionRow, SeverityGroup } from "@/lib/ui-models";
import { fmtDue, fmtFace, safeStr } from "@/lib/ui-fmt";
import {
  AkShell,
  AkPanel,
  AkBadge,
  AkButton,
  AkSectionHeader,
} from "@/components/ak/ak-ui";

interface Stats {
  open_obligations: number;
  sealed_obligations: number;
  stripe_events_total: number;
}

type Grouped = Record<SeverityGroup, NextActionRow[]>;

const GROUPS: { key: SeverityGroup; label: string; tone: "danger" | "gold" | "muted" }[] = [
  { key: "critical", label: "Critical", tone: "danger" },
  { key: "at_risk", label: "At Risk", tone: "gold" },
  { key: "due_today", label: "Due Today", tone: "gold" },
  { key: "queue", label: "Queue", tone: "muted" },
];

function groupRows(rows: NextActionRow[]): Grouped {
  return {
    critical: rows.filter((r) => r.severity === "critical"),
    at_risk: rows.filter((r) => r.severity === "at_risk"),
    due_today: rows.filter((r) => r.severity === "due_today"),
    queue: rows.filter((r) => r.severity === "queue"),
  };
}

export default function BillingOpsPage() {
  const [rows, setRows] = useState<NextActionRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [sealingId, setSealingId] = useState<string | null>(null);
  const [inspecting, setInspecting] = useState<NextActionRow | null>(null);

  const grouped = useMemo(() => groupRows(rows), [rows]);
  const activeGroups = GROUPS.filter((g) => grouped[g.key].length > 0);

  const loadData = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [feedRes, statsRes] = await Promise.all([
        fetch("/api/billing-ops/feed"),
        fetch("/api/billing-ops/stats"),
      ]);

      if (!feedRes.ok) {
        const j = await feedRes.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${feedRes.status}`);
      }
      if (!statsRes.ok) {
        const j = await statsRes.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${statsRes.status}`);
      }

      const [feedJson, statsJson] = await Promise.all([
        feedRes.json(),
        statsRes.json(),
      ]);

      setRows((feedJson.rows ?? []) as NextActionRow[]);
      setStats(statsJson as Stats);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setRows([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleSeal(obligationId: string) {
    setSealingId(obligationId);
    try {
      const res = await fetch("/api/billing-ops/seal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ obligation_id: obligationId }),
      });
      const json = await res.json();
      if (!res.ok) {
        alert(`Seal failed: ${json.error ?? "Unknown error"}`);
      } else {
        setRows((prev) => prev.filter((r) => r.obligation_id !== obligationId));
        // Refresh stats count
        fetch("/api/billing-ops/stats")
          .then((r) => r.json())
          .then((s) => setStats(s))
          .catch(() => null);
      }
    } catch (e) {
      alert(`Seal failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSealingId(null);
    }
  }

  const closureRate =
    stats && stats.open_obligations + stats.sealed_obligations > 0
      ? Math.round(
          (stats.sealed_obligations /
            (stats.open_obligations + stats.sealed_obligations)) *
            100
        )
      : null;

  return (
    <AkShell
      title="Billing Enforcement"
      subtitle="Stripe intake → obligations → closure → receipts"
    >
      {loading && (
        <div className="flex items-center gap-3 text-sm text-zinc-500">
          <div className="h-1 w-1 rounded-full bg-[#d6b24a] animate-pulse" />
          Loading pipeline…
        </div>
      )}

      {!loading && err && (
        <AkPanel className="p-6">
          <div className="text-sm font-extrabold text-red-400 mb-2">Error</div>
          <div className="text-sm text-zinc-300">{err}</div>
          <button
            onClick={loadData}
            className="mt-4 text-xs font-bold text-[#d6b24a] hover:underline"
          >
            Retry →
          </button>
        </AkPanel>
      )}

      {!loading && !err && (
        <>
          {/* Pipeline stats */}
          {stats && (
            <div className="mb-8 grid gap-3 md:grid-cols-4">
              <AkPanel className="p-5 relative overflow-hidden">
                <div className="text-[10px] font-extrabold tracking-widest text-zinc-600 mb-2">
                  STRIPE INTAKE
                </div>
                <div className="text-4xl font-extrabold text-[#d6b24a]">
                  {stats.stripe_events_total}
                </div>
                <div className="mt-1 text-xs text-zinc-500">raw events</div>
                <div className="absolute top-1/2 -right-2 -translate-y-1/2 text-zinc-700 text-lg hidden md:block">→</div>
              </AkPanel>

              <AkPanel className="p-5 relative overflow-hidden">
                <div className="text-[10px] font-extrabold tracking-widest text-zinc-600 mb-2">
                  OPEN
                </div>
                <div className="text-4xl font-extrabold text-amber-400">
                  {stats.open_obligations}
                </div>
                <div className="mt-1 text-xs text-zinc-500">pending duties</div>
                <div className="absolute top-1/2 -right-2 -translate-y-1/2 text-zinc-700 text-lg hidden md:block">→</div>
              </AkPanel>

              <AkPanel className="p-5 relative overflow-hidden">
                <div className="text-[10px] font-extrabold tracking-widest text-zinc-600 mb-2">
                  SEALED
                </div>
                <div className="text-4xl font-extrabold text-emerald-400">
                  {stats.sealed_obligations}
                </div>
                <div className="mt-1 text-xs text-zinc-500">closed with receipt</div>
                <div className="absolute top-1/2 -right-2 -translate-y-1/2 text-zinc-700 text-lg hidden md:block">→</div>
              </AkPanel>

              <AkPanel className="p-5">
                <div className="text-[10px] font-extrabold tracking-widest text-zinc-600 mb-2">
                  CLOSURE RATE
                </div>
                <div className="text-4xl font-extrabold text-[#d6b24a]">
                  {closureRate !== null ? `${closureRate}%` : "—"}
                </div>
                <div className="mt-1 text-xs text-zinc-500">sealed / total</div>
              </AkPanel>
            </div>
          )}

          <div className="h-px bg-gradient-to-r from-[#d6b24a]/15 via-[#d6b24a]/5 to-transparent mb-8" />

          {/* Open obligations */}
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-3xl font-extrabold text-zinc-100">{rows.length}</span>
              <span className="text-sm text-zinc-500">open billing obligations</span>
            </div>
            <button
              onClick={loadData}
              className="text-xs font-bold text-zinc-500 hover:text-[#d6b24a] transition"
            >
              Refresh
            </button>
          </div>

          {rows.length === 0 && (
            <AkPanel className="p-10 text-center">
              <div className="text-4xl mb-3">✓</div>
              <div className="text-base font-extrabold text-zinc-100 mb-1">
                All Clear
              </div>
              <div className="text-sm text-zinc-500">
                No open billing obligations.
              </div>
            </AkPanel>
          )}

          {rows.length > 0 && (
            <div className="space-y-8">
              {activeGroups.map((g) => (
                <section key={g.key}>
                  <AkSectionHeader label={g.label} count={grouped[g.key].length} />
                  <div className="mt-4 grid gap-4">
                    {grouped[g.key].map((row) => (
                      <AkPanel key={row.obligation_id} className="p-5">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-3 flex-wrap">
                              <AkBadge tone={g.tone}>{g.label.toUpperCase()}</AkBadge>
                              <AkBadge tone="muted">BILLING</AkBadge>
                              {row.is_breach && (
                                <AkBadge tone="danger">BREACH</AkBadge>
                              )}
                            </div>
                            <div className="text-base font-extrabold text-zinc-100 leading-snug">
                              {safeStr(row.title)}
                            </div>
                            {row.why && (
                              <div className="mt-1.5 text-sm text-zinc-400">
                                {row.why}
                              </div>
                            )}
                            <div className="mt-3 flex flex-wrap gap-4 text-xs text-zinc-500">
                              {row.due_at && (
                                <span>
                                  Due:{" "}
                                  <span className="text-zinc-300">{fmtDue(row.due_at)}</span>
                                </span>
                              )}
                              {row.economic_ref_id && (
                                <span>
                                  Ref:{" "}
                                  <span className="text-zinc-300">
                                    {safeStr(row.economic_ref_type)} {safeStr(row.economic_ref_id)}
                                  </span>
                                </span>
                              )}
                              {row.age_hours != null && (
                                <span>
                                  Age:{" "}
                                  <span className="text-zinc-300">{Math.round(row.age_hours)}h</span>
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="mt-5 flex gap-3">
                          <AkButton
                            tone="gold"
                            disabled={sealingId === row.obligation_id}
                            onClick={() => handleSeal(row.obligation_id)}
                          >
                            {sealingId === row.obligation_id ? "Sealing…" : "Seal Closure"}
                          </AkButton>
                          <AkButton tone="muted" onClick={() => setInspecting(row)}>
                            Inspect
                          </AkButton>
                        </div>
                      </AkPanel>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}

          {/* Quick Nav */}
          <div className="mt-10 flex flex-wrap gap-3">
            <Link
              href="/receipts"
              className="rounded-xl bg-[#d6b24a] text-black px-4 py-2.5 text-sm font-extrabold hover:brightness-105 transition"
            >
              All Receipts →
            </Link>
            <Link
              href="/command"
              className="rounded-xl bg-[#121212] text-zinc-200 border border-[#2a2516] px-4 py-2.5 text-sm font-extrabold hover:bg-[#181818] transition"
            >
              Command View →
            </Link>
          </div>
        </>
      )}

      {/* Inspect Drawer */}
      {inspecting && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setInspecting(null)}
          />
          <div className="relative w-full max-w-md bg-[#070707] border-l border-[#2a2516] overflow-y-auto shadow-2xl">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <div className="text-xs font-extrabold tracking-[0.22em] text-zinc-500 mb-1">
                    BILLING OBLIGATION
                  </div>
                  <h2 className="text-lg font-extrabold text-[#d6b24a]">Inspect</h2>
                </div>
                <button
                  onClick={() => setInspecting(null)}
                  className="rounded-xl border border-[#2a2516] bg-[#0d0d0d] px-3 py-2 text-sm text-zinc-400 hover:text-zinc-100 transition"
                >
                  ✕ Close
                </button>
              </div>

              <div className="space-y-4 text-sm">
                {(
                  [
                    ["Obligation ID", inspecting.obligation_id],
                    ["Title", inspecting.title],
                    ["Why", inspecting.why],
                    ["Face", fmtFace(inspecting.face)],
                    ["Severity", inspecting.severity],
                    ["Due At", fmtDue(inspecting.due_at) ?? "—"],
                    ["Created At", inspecting.created_at ?? "—"],
                    ["Age (hours)", inspecting.age_hours != null ? String(Math.round(inspecting.age_hours)) : "—"],
                    ["Breach", inspecting.is_breach ? "YES" : "No"],
                    ["Economic Ref Type", inspecting.economic_ref_type ?? "—"],
                    ["Economic Ref ID", inspecting.economic_ref_id ?? "—"],
                  ] as [string, string | null][]
                ).map(([label, value]) => (
                  <AkPanel key={label} className="p-3">
                    <div className="text-[10px] font-extrabold tracking-widest text-zinc-600 mb-1">
                      {label.toUpperCase()}
                    </div>
                    <div className="text-zinc-200 break-all text-sm">{value || "—"}</div>
                  </AkPanel>
                ))}
              </div>

              <div className="mt-6">
                <AkButton
                  tone="gold"
                  className="w-full"
                  disabled={sealingId === inspecting.obligation_id}
                  onClick={() => {
                    handleSeal(inspecting.obligation_id);
                    setInspecting(null);
                  }}
                >
                  {sealingId === inspecting.obligation_id ? "Sealing…" : "Seal This Obligation"}
                </AkButton>
              </div>
            </div>
          </div>
        </div>
      )}
    </AkShell>
  );
}
