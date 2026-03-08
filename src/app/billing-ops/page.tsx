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

const PIPELINE = [
  { label: "Stripe Intake", key: "stripe_events_total" as const, desc: "Raw events ingested" },
  { label: "Open Obligations", key: "open_obligations" as const, desc: "Billing duties pending" },
  { label: "Sealed", key: "sealed_obligations" as const, desc: "Obligations closed with receipt" },
];

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

  return (
    <AkShell
      title="Billing Enforcement"
      subtitle="Stripe intake → obligations → closure → receipts"
    >
      {loading && <div className="text-sm text-zinc-500">Loading…</div>}

      {!loading && err && (
        <AkPanel className="p-6">
          <div className="text-sm font-bold text-red-400 mb-2">Error</div>
          <div className="text-sm text-zinc-300">{err}</div>
        </AkPanel>
      )}

      {!loading && stats && (
        <>
          {/* Pipeline Counts */}
          <div className="grid gap-4 md:grid-cols-3 mb-10">
            {PIPELINE.map((step) => (
              <AkPanel key={step.label} className="p-5">
                <div className="text-3xl font-extrabold text-[#d6b24a] mb-1">
                  {stats[step.key]}
                </div>
                <div className="text-sm font-semibold text-zinc-100">{step.label}</div>
                <div className="mt-1 text-xs text-zinc-500">{step.desc}</div>
              </AkPanel>
            ))}
          </div>

          {/* Recent Receipts — projection surface */}
          <AkSectionHeader label="Recent Receipts" count={stats.recent_receipts.length} />
          <div className="mt-4 grid gap-3">
            {stats.recent_receipts.length === 0 && (
              <div className="text-sm text-zinc-600">No dealership receipts yet.</div>
            )}
            {stats.recent_receipts.map((r) => (
              <AkPanel key={r.receipt_id} className="p-4 flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-zinc-100 truncate">
                    {r.receipt_id.slice(0, 8)}…
                  </div>
                  <div className="text-xs text-zinc-500 mt-1">
                    Obligation: {r.obligation_id?.slice(0, 8) ?? "—"}…
                    {r.economic_ref_id && (
                      <span className="ml-3">
                        Ref: {r.economic_ref_type} {r.economic_ref_id}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <AkBadge tone="gold">SEALED</AkBadge>
                  <div className="text-xs text-zinc-500 mt-1">
                    {new Date(r.sealed_at).toLocaleString()}
                  </div>
                </div>
              </AkPanel>
            ))}
          </div>

          {/* Quick Nav */}
          <div className="mt-10 flex flex-wrap gap-3">
            <Link
              href="/receipts"
              className="rounded-xl bg-[#d6b24a] text-black px-4 py-2.5 text-sm font-semibold hover:bg-[#e0c05a] transition"
            >
              View Receipts →
            </Link>
            <Link
              href="/command"
              className="rounded-xl bg-zinc-800 text-zinc-200 px-4 py-2.5 text-sm font-semibold hover:bg-zinc-700 transition"
            >
              Command View →
            </Link>
          </div>
        </>
      )}
    </AkShell>
  );
}
