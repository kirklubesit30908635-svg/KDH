"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { NextActionRow, SeverityGroup } from "@/lib/ui-models";
import { fmtDue, fmtFace, safeStr } from "@/lib/ui-fmt";
import {
  AkShell,
  AkPanel,
  AkBadge,
  AkSectionHeader,
} from "@/components/ak/ak-ui";

interface Receipt {
  receipt_id: string;
  obligation_id: string;
  sealed_at: string;
  face: string;
  economic_ref_type: string | null;
  economic_ref_id: string | null;
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

export default function AdvertisingPage() {
  const [obligations, setObligations] = useState<NextActionRow[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const grouped = useMemo(() => groupRows(obligations), [obligations]);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/advertising/feed");
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error ?? `HTTP ${res.status}`);
        }
        const data = await res.json();
        setObligations(data.obligations ?? []);
        setReceipts(data.receipts ?? []);
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
      title="Advertising Enforcement"
      subtitle="Spend → Lead → Follow-Up → Sale → Margin → Renewal Gate"
    >
      {loading && <div className="text-sm text-zinc-500">Loading…</div>}

      {!loading && err && (
        <AkPanel className="p-6">
          <div className="text-sm font-bold text-red-400 mb-2">Error</div>
          <div className="text-sm text-zinc-300">{err}</div>
        </AkPanel>
      )}

      {!loading && !err && (
        <>
          {/* Obligations by severity */}
          <div className="space-y-8">
            {GROUPS.map((g) => (
              <section key={g.key}>
                <AkSectionHeader label={g.label} count={grouped[g.key].length} />
                <div className="mt-4 grid gap-4">
                  {grouped[g.key].map((row) => (
                    <AkPanel key={row.obligation_id} className="p-5">
                      <div className="flex items-center gap-3 mb-2">
                        <AkBadge tone={g.tone}>{g.label.toUpperCase()}</AkBadge>
                        {row.is_breach && <AkBadge tone="danger">BREACH</AkBadge>}
                      </div>
                      <div className="text-base font-bold text-zinc-100">
                        {safeStr(row.title)}
                      </div>
                      {row.why && (
                        <div className="mt-1 text-sm text-zinc-400">{row.why}</div>
                      )}
                      <div className="mt-3 flex flex-wrap gap-4 text-xs text-zinc-500">
                        <span>Face: {fmtFace(row.face)}</span>
                        {row.due_at && <span>Due: {fmtDue(row.due_at)}</span>}
                        {row.economic_ref_id && (
                          <span>
                            Ref: {safeStr(row.economic_ref_type)}{" "}
                            {safeStr(row.economic_ref_id)}
                          </span>
                        )}
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

          {/* Recent Receipts */}
          <div className="mt-10">
            <AkSectionHeader label="Recent Receipts" count={receipts.length} />
            <div className="mt-4 grid gap-3">
              {receipts.length === 0 && (
                <div className="text-sm text-zinc-600">No advertising receipts yet.</div>
              )}
              {receipts.map((r) => (
                <AkPanel key={r.receipt_id} className="p-4 flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold text-zinc-100 truncate">
                      {r.receipt_id.slice(0, 8)}…
                    </div>
                    <div className="text-xs text-zinc-500 mt-1">
                      Obligation: {r.obligation_id?.slice(0, 8) ?? "—"}…
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
          </div>

          {/* Quick Nav */}
          <div className="mt-10 flex flex-wrap gap-3">
            <Link
              href="/command"
              className="rounded-xl bg-[#d6b24a] text-black px-4 py-2.5 text-sm font-semibold hover:bg-[#e0c05a] transition"
            >
              Command View →
            </Link>
            <Link
              href="/receipts"
              className="rounded-xl bg-zinc-800 text-zinc-200 px-4 py-2.5 text-sm font-semibold hover:bg-zinc-700 transition"
            >
              View Receipts →
            </Link>
          </div>
        </>
      )}
    </AkShell>
  );
}
