"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { ReceiptRow } from "@/lib/ui-models";
import { fmtFace, safeStr } from "@/lib/ui-fmt";
import { AkBadge, AkInput, AkPanel, AkSectionHeader, AkShell } from "@/components/ak/ak-ui";

export default function ReceiptsPage() {
  const [rows, setRows] = useState<ReceiptRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");

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

  useEffect(() => {
    let alive = true;
    async function run() {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch("/api/receipts/feed");
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error ?? `HTTP ${res.status}`);
        }
        const json = await res.json();
        if (!alive) return;
        setRows((json.rows ?? []) as ReceiptRow[]);
      } catch (e) {
        if (!alive) return;
        setErr(`Receipts load failed: ${e instanceof Error ? e.message : String(e)}`);
        setRows([]);
      }
      setLoading(false);
    }
    run();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <AkShell
      title="Receipts"
      subtitle="Institutional proof layer — every sealed obligation leaves a receipt."
    >
      {/* search */}
      <AkPanel className="p-4 mb-6">
        <div className="text-[10px] font-extrabold tracking-[0.22em] text-white/30 mb-2">
          SEARCH RECEIPTS
        </div>
        <AkInput
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="receipt id · obligation · operator · invoice · ledger pointer…"
        />
      </AkPanel>

      {/* header */}
      <AkSectionHeader label="Results" count={filtered.length} />

      {loading && (
        <div className="mt-4 flex items-center gap-3 text-sm text-white/35">
          <div className="h-1 w-1 rounded-full bg-emerald-400 animate-pulse" />
          Loading proof records…
        </div>
      )}

      {!loading && err && (
        <AkPanel className="mt-4 p-6">
          <div className="text-sm font-extrabold text-red-400 mb-2">Error</div>
          <div className="text-sm text-white/60">{err}</div>
        </AkPanel>
      )}

      {!loading && !err && filtered.length === 0 && (
        <AkPanel className="mt-4 p-8 text-center">
          <div className="text-3xl mb-3">○</div>
          <div className="text-sm font-extrabold text-white/45">No receipts found</div>
          {q && (
            <button
              onClick={() => setQ("")}
              className="mt-3 text-xs text-white/60 hover:text-white hover:underline font-bold transition"
            >
              Clear search
            </button>
          )}
        </AkPanel>
      )}

      {!loading && !err && filtered.length > 0 && (
        <div className="mt-4 grid gap-3">
          {filtered.map((r) => {
            const refLabel =
              r.economic_ref_id
                ? `${safeStr(r.economic_ref_type)} ${safeStr(r.economic_ref_id)}`.trim()
                : null;

            return (
              <AkPanel key={r.receipt_id} className="p-5">
                {/* badges row */}
                <div className="flex items-center gap-2 flex-wrap mb-3">
                  <AkBadge tone="gold">RECEIPT</AkBadge>
                  <AkBadge tone="muted">{fmtFace(r.face)}</AkBadge>
                  {refLabel && <AkBadge tone="muted">{refLabel}</AkBadge>}
                </div>

                {/* primary info */}
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="text-base font-extrabold text-white leading-snug">
                      {refLabel ?? r.receipt_id.slice(0, 16) + "…"}
                    </div>

                    <div className="mt-2 text-sm text-white/45">
                      Sealed by{" "}
                      <span className="text-white/70 font-semibold">
                        {safeStr(r.sealed_by) || "system"}
                      </span>
                      <span className="mx-2 text-white/20">·</span>
                      {new Date(r.sealed_at).toLocaleString()}
                    </div>
                  </div>
                </div>

                {/* detail row */}
                <div className="mt-3 pt-3 border-t border-white/[0.06] grid grid-cols-1 gap-1 text-xs text-white/25 font-mono">
                  <div>
                    <span className="text-white/20">receipt </span>
                    <span className="text-white/45">{r.receipt_id}</span>
                  </div>
                  <div>
                    <span className="text-white/20">obligation </span>
                    <span className="text-white/45">{r.obligation_id}</span>
                  </div>
                  {r.ledger_event_id && (
                    <div>
                      <span className="text-white/20">ledger </span>
                      <span className="text-white/45">{r.ledger_event_id}</span>
                    </div>
                  )}
                </div>
              </AkPanel>
            );
          })}
        </div>
      )}

      {/* nav */}
      <div className="mt-10 flex flex-wrap gap-3">
        <Link
          href="/command"
          className="rounded-xl bg-white text-neutral-950 px-4 py-2.5 text-sm font-extrabold hover:bg-white/90 transition"
        >
          Command →
        </Link>
        <Link
          href="/"
          className="rounded-xl bg-white/[0.04] text-white/70 border border-white/10 px-4 py-2.5 text-sm font-extrabold hover:bg-white/[0.07] transition"
        >
          ← Home
        </Link>
      </div>
    </AkShell>
  );
}
