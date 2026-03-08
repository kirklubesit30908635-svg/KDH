"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { NextActionRow, SeverityGroup } from "@/lib/ui-models";
import { fmtDue, fmtFace, safeStr } from "@/lib/ui-fmt";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import {
  AkShell,
  AkPanel,
  AkBadge,
  AkButton,
  AkSectionHeader,
} from "@/components/ak/ak-ui";

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

export default function CommandPage() {
  const [rows, setRows] = useState<NextActionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [sealingId, setSealingId] = useState<string | null>(null);
  const [inspecting, setInspecting] = useState<NextActionRow | null>(null);

  const grouped = useMemo(() => groupRows(rows), [rows]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setErr(null);

    const supabase = supabaseBrowser();
    const { data, error } = await supabase
      .schema("core")
      .from("v_next_actions")
      .select("*")
      .order("due_at", { ascending: true, nullsFirst: false });

    if (error) {
      setErr(`Command load failed: ${error.message}`);
      setRows([]);
    } else {
      setRows((data ?? []) as NextActionRow[]);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleSeal(obligationId: string) {
    setSealingId(obligationId);
    try {
      const res = await fetch("/api/command/seal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ obligation_id: obligationId }),
      });
      const json = await res.json();
      if (!res.ok) {
        alert(`Seal failed: ${json.error ?? "Unknown error"}`);
      } else {
        setRows((prev) => prev.filter((r) => r.obligation_id !== obligationId));
      }
    } catch (e) {
      alert(`Seal failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSealingId(null);
    }
  }

  return (
    <AkShell
      title="Command"
      subtitle="Truth surface: core.v_next_actions — open obligations requiring operator action."
    >
      {loading && (
        <div className="text-sm text-zinc-500">Loading…</div>
      )}

      {!loading && err && (
        <AkPanel className="p-6">
          <div className="text-sm font-bold text-red-400 mb-2">Error</div>
          <div className="text-sm text-zinc-300">{err}</div>
          <div className="mt-3 text-xs text-zinc-500">
            Confirm the view exists and is granted for your current auth role.
          </div>
        </AkPanel>
      )}

      {!loading && !err && (
        <div className="space-y-8">
          {GROUPS.map((g) => (
            <section key={g.key}>
              <AkSectionHeader label={g.label} count={grouped[g.key].length} />

              <div className="mt-4 grid gap-4">
                {grouped[g.key].map((row) => (
                  <AkPanel key={row.obligation_id} className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2">
                          <AkBadge tone={g.tone}>{g.label.toUpperCase()}</AkBadge>
                          <AkBadge tone="muted">{fmtFace(row.face)}</AkBadge>
                          {row.is_breach && <AkBadge tone="danger">BREACH</AkBadge>}
                        </div>

                        <div className="text-base font-bold text-zinc-100">
                          {safeStr(row.title)}
                        </div>

                        {row.why && (
                          <div className="mt-1 text-sm text-zinc-400">{row.why}</div>
                        )}

                        <div className="mt-3 flex flex-wrap gap-4 text-xs text-zinc-500">
                          {row.due_at && <span>Due: {fmtDue(row.due_at)}</span>}
                          {row.economic_ref_id && (
                            <span>
                              Ref: {safeStr(row.economic_ref_type)}{" "}
                              {safeStr(row.economic_ref_id)}
                            </span>
                          )}
                          {row.age_hours != null && (
                            <span>Age: {Math.round(row.age_hours)}h</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex gap-3">
                      <AkButton
                        tone="gold"
                        disabled={sealingId === row.obligation_id}
                        onClick={() => handleSeal(row.obligation_id)}
                      >
                        {sealingId === row.obligation_id ? "Sealing…" : "Seal Closure"}
                      </AkButton>

                      <AkButton
                        tone="muted"
                        onClick={() => setInspecting(row)}
                      >
                        Inspect
                      </AkButton>
                    </div>
                  </AkPanel>
                ))}

                {grouped[g.key].length === 0 && (
                  <div className="text-sm text-zinc-600">No items.</div>
                )}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Inspect Drawer */}
      {inspecting && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setInspecting(null)}
          />
          <div className="relative w-full max-w-md bg-[#0a0a0a] border-l border-[#2a2516] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold text-[#d6b24a]">Inspect Obligation</h2>
                <button
                  onClick={() => setInspecting(null)}
                  className="text-zinc-500 hover:text-zinc-300 text-xl leading-none"
                >
                  &times;
                </button>
              </div>

              <div className="space-y-4 text-sm">
                {([
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
                ] as [string, string | null][]).map(([label, value]) => (
                  <div key={label}>
                    <div className="text-xs font-bold tracking-wider text-zinc-500 mb-1">
                      {label.toUpperCase()}
                    </div>
                    <div className="text-zinc-200 break-all">
                      {value || "—"}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-8">
                <AkButton
                  tone="gold"
                  disabled={sealingId === inspecting.obligation_id}
                  onClick={() => {
                    handleSeal(inspecting.obligation_id);
                    setInspecting(null);
                  }}
                >
                  Seal This Obligation
                </AkButton>
              </div>
            </div>
          </div>
        </div>
      )}
    </AkShell>
  );
}
