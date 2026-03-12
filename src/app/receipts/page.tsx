"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FileCheck, Hash, Clock, Search } from "lucide-react";
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

  const stats = [
    {
      label: "Total",
      value: String(rows.length),
      sub: "proof records",
      icon: FileCheck,
      fill: "100%",
    },
    {
      label: "Showing",
      value: String(filtered.length),
      sub: q ? "matching search" : "all records",
      icon: Search,
      fill: rows.length > 0 ? `${Math.round((filtered.length / rows.length) * 100)}%` : "100%",
    },
  ];

  return (
    <div className="min-h-screen overflow-hidden bg-neutral-950 text-white">
      {/* Radial glow */}
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[44rem] bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.08),transparent_50%)]" />

      {/* Header */}
      <header className="border-b border-white/10 bg-neutral-950/80 backdrop-blur-xl">
        <div className="flex items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-xs font-semibold tracking-[0.22em]">
              AK
            </div>
            <div>
              <div className="text-sm font-semibold tracking-[0.26em] text-white/80">AUTOKIRK</div>
              <div className="text-[10px] text-white/40">Revenue Integrity Operating Layer</div>
            </div>
          </Link>
          <div className="flex items-center gap-5">
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              <span className="text-[10px] uppercase tracking-[0.18em] text-white/45">Kernel live</span>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-6xl px-6 py-12">
        {/* Page header */}
        <div className="mb-10">
          <div className="text-[10px] uppercase tracking-[0.3em] text-white/35 mb-3">
            // Proof layer
          </div>
          <h1 className="text-5xl font-semibold tracking-tight text-white leading-[0.95] mb-4">
            Receipts
          </h1>
          <p className="text-sm leading-7 text-white/50 max-w-xl">
            Institutional proof records — every sealed obligation leaves a cryptographic receipt
            on the <span className="text-white/75 font-medium">ledger</span>.
          </p>
        </div>

        {/* Stat bento */}
        {!loading && !err && rows.length > 0 && (
          <div className="grid grid-cols-2 gap-3 max-w-sm mb-10">
            {stats.map(({ label, value, sub, icon: Icon, fill }) => (
              <div
                key={label}
                className="rounded-[1.4rem] border border-white/10 bg-white/[0.03] p-5 relative overflow-hidden transition hover:border-white/20 hover:bg-white/[0.05]"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="text-[9px] uppercase tracking-[0.22em] text-white/35">{label}</div>
                  <div className="rounded-lg border border-white/10 bg-white/[0.03] p-1.5 text-white/40">
                    <Icon className="h-3 w-3" />
                  </div>
                </div>
                <div className="text-3xl font-semibold text-white mb-1">{value}</div>
                <div className="text-[10px] text-white/35 uppercase tracking-[0.1em] mb-3">{sub}</div>
                <div className="h-px rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full rounded-full bg-white/50 transition-all" style={{ width: fill }} />
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="h-px bg-gradient-to-r from-white/10 via-white/5 to-transparent mb-10" />

        {/* Search */}
        <div className="mb-8 max-w-xl">
          <div className="text-[10px] uppercase tracking-[0.25em] text-white/35 mb-3">Search receipts</div>
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/25" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="receipt id · obligation · operator · ledger pointer…"
              className="w-full rounded-2xl border border-white/10 bg-white/[0.03] pl-9 pr-4 py-3 text-sm text-white placeholder:text-white/25 outline-none focus:border-white/25 focus:bg-white/[0.05] transition"
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
          <div className="rounded-2xl border border-red-400/20 bg-red-400/5 px-6 py-5 max-w-lg">
            <div className="text-xs font-semibold uppercase tracking-widest text-red-400 mb-2">Error</div>
            <div className="text-sm text-white/60">{err}</div>
            <button
              onClick={loadData}
              className="mt-4 text-[10px] uppercase tracking-[0.2em] text-white/40 hover:text-white transition"
            >
              Retry →
            </button>
          </div>
        )}

        {!loading && !err && (
          <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
            {/* Receipt list */}
            <div>
              <div className="flex items-center justify-between mb-5">
                <div className="text-[10px] uppercase tracking-[0.25em] text-white/35">
                  {filtered.length} receipt{filtered.length !== 1 ? "s" : ""}
                  {q && rows.length !== filtered.length && ` of ${rows.length}`}
                </div>
                <button
                  onClick={loadData}
                  className="text-[10px] uppercase tracking-[0.18em] text-white/30 hover:text-white/70 transition"
                >
                  Refresh
                </button>
              </div>

              {filtered.length === 0 ? (
                <div className="rounded-[1.4rem] border border-white/10 bg-white/[0.02] p-12 text-center">
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
                </div>
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

                        {/* mono hash preview */}
                        <div className="mt-3 font-mono text-[9px] text-white/20 truncate">
                          {r.receipt_id}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
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

        {/* Nav */}
        <div className="mt-12 flex items-center gap-4 pt-8 border-t border-white/8">
          <Link
            href="/integrity"
            className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-xs font-semibold text-white/60 hover:bg-white/[0.06] hover:text-white transition"
          >
            Integrity →
          </Link>
          <Link
            href="/command"
            className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-xs font-semibold text-white/60 hover:bg-white/[0.06] hover:text-white transition"
          >
            Command →
          </Link>
          <Link
            href="/users"
            className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-xs font-semibold text-white/60 hover:bg-white/[0.06] hover:text-white transition"
          >
            Users →
          </Link>
        </div>
      </div>
    </div>
  );
}
