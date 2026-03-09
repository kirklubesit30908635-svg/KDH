"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AkShell,
  AkPanel,
  AkBadge,
  AkSectionHeader,
} from "@/components/ak/ak-ui";

interface Stats {
  open_obligations: number;
  sealed_obligations: number;
  stripe_events_total: number;
  recent_receipts: {
    receipt_id: string;
    obligation_id: string;
    sealed_at: string;
    face: string;
    economic_ref_type: string | null;
    economic_ref_id: string | null;
  }[];
}

export default function BillingOpsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/billing-ops/stats");
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error ?? `HTTP ${res.status}`);
        }
        setStats(await res.json());
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

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
        </AkPanel>
      )}

      {!loading && stats && (
        <>
          {/* Pipeline — visual flow */}
          <div className="mb-2">
            <div className="text-[10px] font-extrabold tracking-[0.22em] text-zinc-600 mb-4">
              PIPELINE
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              {/* Stripe Intake */}
              <AkPanel className="p-5 relative overflow-hidden">
                <div className="text-[10px] font-extrabold tracking-widest text-zinc-600 mb-2">
                  STRIPE INTAKE
                </div>
                <div className="text-4xl font-extrabold text-[#d6b24a]">
                  {stats.stripe_events_total}
                </div>
                <div className="mt-1 text-xs text-zinc-500">raw events</div>
                <div className="absolute top-1/2 -right-2 -translate-y-1/2 text-zinc-700 text-lg hidden md:block">
                  →
                </div>
              </AkPanel>

              {/* Open Obligations */}
              <AkPanel className="p-5 relative overflow-hidden">
                <div className="text-[10px] font-extrabold tracking-widest text-zinc-600 mb-2">
                  OPEN
                </div>
                <div className="text-4xl font-extrabold text-amber-400">
                  {stats.open_obligations}
                </div>
                <div className="mt-1 text-xs text-zinc-500">pending duties</div>
                <div className="absolute top-1/2 -right-2 -translate-y-1/2 text-zinc-700 text-lg hidden md:block">
                  →
                </div>
              </AkPanel>

              {/* Sealed */}
              <AkPanel className="p-5 relative overflow-hidden">
                <div className="text-[10px] font-extrabold tracking-widest text-zinc-600 mb-2">
                  SEALED
                </div>
                <div className="text-4xl font-extrabold text-emerald-400">
                  {stats.sealed_obligations}
                </div>
                <div className="mt-1 text-xs text-zinc-500">closed with receipt</div>
                <div className="absolute top-1/2 -right-2 -translate-y-1/2 text-zinc-700 text-lg hidden md:block">
                  →
                </div>
              </AkPanel>

              {/* Closure Rate */}
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
          </div>

          {/* divider */}
          <div className="my-8 h-px bg-gradient-to-r from-[#d6b24a]/15 via-[#d6b24a]/5 to-transparent" />

          {/* Recent Receipts */}
          <AkSectionHeader label="Recent Receipts" count={stats.recent_receipts.length} />

          {stats.recent_receipts.length === 0 ? (
            <div className="mt-4 text-sm text-zinc-600">
              No dealership receipts yet.
            </div>
          ) : (
            <div className="mt-4 grid gap-3">
              {stats.recent_receipts.map((r) => {
                const refLabel =
                  r.economic_ref_id
                    ? `${r.economic_ref_type ?? ""} ${r.economic_ref_id}`.trim()
                    : null;
                return (
                  <AkPanel key={r.receipt_id} className="p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <AkBadge tone="gold">SEALED</AkBadge>
                          {refLabel && (
                            <AkBadge tone="muted">{refLabel}</AkBadge>
                          )}
                        </div>
                        <div className="text-xs font-mono text-zinc-500">
                          {r.receipt_id.slice(0, 16)}…
                        </div>
                      </div>
                      <div className="text-xs text-zinc-500 text-right shrink-0">
                        {new Date(r.sealed_at).toLocaleString()}
                      </div>
                    </div>
                  </AkPanel>
                );
              })}
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
    </AkShell>
  );
}
