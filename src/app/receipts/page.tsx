"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileCheck, Hash, Clock, Search } from "lucide-react";
import { AkShell, AkPanel, AkSectionHeader, AkInput } from "@/components/ak/ak-ui";
import type { ReceiptRow } from "@/lib/ui-models";
import { safeStr } from "@/lib/ui-fmt";

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function fmtFaceLabel(face: unknown): string {
  if (!face || typeof face !== "string") return "—";
  return face.replace(/_/g, " ").toLowerCase();
}

export default function ReceiptsPage() {
  const [rows, setRows] = useState<ReceiptRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<ReceiptRow | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/receipts/feed");
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const json = await res.json();
      setRows((json.rows ?? []) as ReceiptRow[]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setRows([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) => {
      const hay = [
        r.receipt_id,
        r.obligation_id,
        r.sealed_by ?? "",
        safeStr(r.face),
        safeStr(r.economic_ref_type),
        safeStr(r.economic_ref_id),
        safeStr(r.ledger_event_id),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [rows, q]);

  return (
    <AkShell
      title="Receipts"
      subtitle="Institutional proof records — every sealed obligation leaves a cryptographic receipt on the ledger."
    >
      {/* Search */}
      <div className="mb-8 max-w-xl">
        <AkSectionHeader label="Search receipts" />
        <div className="relative mt-3">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/25 pointer-events-none" />
          <AkInput
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="receipt id · obligation · operator · ledger pointer…"
            className="pl-9"
          />
        </div>
      </div>

      {/* Content */}
      {loading && (
        <div className="flex items-center gap-3 text-sm text-white/35">
          <div className="h-1 w-1 rounded-full bg-emerald-400 animate-pulse" />
          Loading proof records…
        </div>
      )}

      {!loading && err && (
        <AkPanel className="px-6 py-5 max-w-lg border-red-400/20 bg-red-400/5">
          <div className="text-xs font-semibold uppercase tracking-widest text-red-400 mb-2">Error</div>
          <div className="text-sm text-white/60">{err}</div>
          <button
            onClick={loadData}
            className="mt-4 text-[10px] uppercase tracking-[0.2em] text-white/40 hover:text-white transition"
          >
            Retry →
          </button>
        </AkPanel>
      )}

      {!loading && !err && (
        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          {/* Receipt list */}
          <div>
            <AkSectionHeader
              label={`${filtered.length} receipt${filtered.length !== 1 ? "s" : ""}${q && rows.length !== filtered.length ? ` of ${rows.length}` : ""}`}
              right={
                <button
                  onClick={loadData}
                  className="text-[10px] uppercase tracking-[0.18em] text-white/30 hover:text-white/70 transition"
                >
                  Refresh
                </button>
              }
            />

            <div className="mt-5">
              {filtered.length === 0 ? (
                <AkPanel className="p-12 text-center">
                  <div className="text-4xl mb-4 text-white/20">∅</div>
                  <div className="text-sm font-semibold text-white/40">
                    {q ? "No receipts match your search" : "No receipts found"}
                  </div>
                  {q && (
                    <button
                      onClick={() => setQ("")}
                      className="mt-3 text-[10px] uppercase tracking-[0.18em] text-white/30 hover:text-white/60 transition"
                    >
                      Clear search
                    </button>
                  )}
                </AkPanel>
              ) : (
                <div className="space-y-2">
                  {filtered.map((r) => {
                    const isSelected = selected?.receipt_id === r.receipt_id;
                    const refLabel = r.economic_ref_id
                      ? `${safeStr(r.economic_ref_type)} ${safeStr(r.economic_ref_id)}`.trim()
                      : null;
                    const faceLabel = fmtFaceLabel(r.face);

                    return (
                      <button
                        key={r.receipt_id}
                        onClick={() => setSelected(isSelected ? null : r)}
                        className={[
                          "w-full text-left rounded-2xl border px-5 py-4 transition group",
                          isSelected
                            ? "border-white/25 bg-white/[0.06]"
                            : "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]",
                        ].join(" ")}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3 min-w-0">
                            <div className="flex-shrink-0 h-9 w-9 rounded-xl border border-white/10 bg-white/[0.04] flex items-center justify-center text-white/30 mt-0.5">
                              <FileCheck className="h-3.5 w-3.5" />
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-white truncate">
                                {refLabel ?? r.receipt_id.slice(0, 20) + "…"}
                              </div>
                              <div className="text-[10px] text-white/35 uppercase tracking-[0.1em] mt-0.5">
                                {faceLabel}
                                <span className="mx-1.5 opacity-40">·</span>
                                {fmtDate(r.sealed_at)}
                              </div>
                            </div>
                          </div>
                          <span className="flex-shrink-0 inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[9px] uppercase tracking-[0.15em] text-emerald-300">
                            <span className="h-1 w-1 rounded-full bg-emerald-400" />
                            Sealed
                          </span>
                        </div>
                        <div className="mt-3 font-mono text-[9px] text-white/20 truncate">
                          {r.receipt_id}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Detail panel */}
          <div className="hidden lg:block">
            {selected ? (
              <div className="sticky top-24 rounded-[1.4rem] border border-white/10 bg-white/[0.03] p-6">
                <div className="text-[9px] uppercase tracking-[0.3em] text-white/35 mb-5">
                  // Receipt detail
                </div>

                <div className="flex items-center gap-3 mb-6">
                  <div className="h-12 w-12 rounded-xl border border-white/10 bg-white/[0.05] flex items-center justify-center text-white/30">
                    <FileCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-base font-semibold text-white">
                      {fmtFaceLabel(selected.face)}
                    </div>
                    <div className="text-[10px] text-emerald-400/70 uppercase tracking-[0.12em] mt-0.5">
                      Sealed
                    </div>
                  </div>
                </div>

                <div className="space-y-3 text-sm">
                  <div className="rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3">
                    <div className="text-[9px] uppercase tracking-[0.22em] text-white/30 mb-1 flex items-center gap-1.5">
                      <Hash className="h-2.5 w-2.5" /> Receipt ID
                    </div>
                    <div className="font-mono text-xs text-white/55 break-all">{selected.receipt_id}</div>
                  </div>

                  <div className="rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3">
                    <div className="text-[9px] uppercase tracking-[0.22em] text-white/30 mb-1">Obligation</div>
                    <div className="font-mono text-xs text-white/55 break-all">{selected.obligation_id}</div>
                  </div>

                  <div className="rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3">
                    <div className="text-[9px] uppercase tracking-[0.22em] text-white/30 mb-1 flex items-center gap-1.5">
                      <Clock className="h-2.5 w-2.5" /> Sealed at
                    </div>
                    <div className="text-white/60 text-xs">{fmtDate(selected.sealed_at)}</div>
                  </div>

                  {selected.sealed_by && (
                    <div className="rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3">
                      <div className="text-[9px] uppercase tracking-[0.22em] text-white/30 mb-1">Sealed by</div>
                      <div className="text-white/60 text-xs">{selected.sealed_by}</div>
                    </div>
                  )}

                  {selected.economic_ref_id && (
                    <div className="rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3">
                      <div className="text-[9px] uppercase tracking-[0.22em] text-white/30 mb-1">Economic ref</div>
                      <div className="text-white/60 text-xs">
                        <span className="text-white/35">{safeStr(selected.economic_ref_type)} </span>
                        <span className="font-mono">{safeStr(selected.economic_ref_id)}</span>
                      </div>
                    </div>
                  )}

                  {selected.ledger_event_id && (
                    <div className="rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3">
                      <div className="text-[9px] uppercase tracking-[0.22em] text-white/30 mb-1">Ledger event</div>
                      <div className="font-mono text-xs text-white/55 break-all">{selected.ledger_event_id}</div>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => setSelected(null)}
                  className="mt-5 text-[10px] uppercase tracking-[0.2em] text-white/30 hover:text-white/60 transition"
                >
                  ← Deselect
                </button>
              </div>
            ) : (
              <div className="sticky top-24 rounded-[1.4rem] border border-white/8 bg-white/[0.015] p-8 text-center">
                <div className="text-white/15 text-3xl mb-3">◎</div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-white/25">
                  Select a receipt
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </AkShell>
  );
}
