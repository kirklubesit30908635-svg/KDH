"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  const activeGroups = GROUPS.filter((g) => grouped[g.key].length > 0);
  const totalOpen = obligations.length;

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);

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
      setObligations([]);
      setReceipts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AkShell
      title="Advertising Enforcement"
      subtitle="Spend → Lead → Follow-Up → Sale → Margin → Renewal Gate"
      eyebrow="Enforcement Domain"
    >
      {loading && (
        <div className="flex items-center gap-3 text-sm text-white/35">
          <div className="h-1 w-1 rounded-full bg-emerald-400 animate-pulse" />
          Loading…
        </div>
      )}

      {!loading && err && (
        <AkPanel className="p-6">
          <div className="text-sm font-extrabold text-red-400 mb-2">Error</div>
          <div className="text-sm text-white/60">{err}</div>
          <button
            onClick={() => void load()}
            className="mt-4 text-xs font-bold text-white/60 transition hover:text-white hover:underline"
          >
            Retry →
          </button>
        </AkPanel>
      )}

      {!loading && !err && (
        <>
          {/* summary bar */}
          <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-3xl font-extrabold text-white">{totalOpen}</span>
              <span className="text-sm text-white/35">open obligations</span>
            </div>
            <button
              onClick={() => void load()}
              className="text-xs font-bold text-white/35 transition hover:text-white"
            >
              Refresh
            </button>
          </div>

          {/* all clear */}
          {totalOpen === 0 && (
            <AkPanel className="p-10 text-center">
              <div className="text-4xl mb-3">✓</div>
              <div className="text-base font-extrabold text-white mb-1">
                All Clear
              </div>
              <div className="text-sm text-white/35">
                No open advertising obligations.
              </div>
            </AkPanel>
          )}

          {/* active groups only */}
          {totalOpen > 0 && (
            <div className="space-y-8">
              {activeGroups.map((g) => (
                <section key={g.key}>
                  <AkSectionHeader label={g.label} count={grouped[g.key].length} />
                  <div className="mt-4 grid gap-4">
                    {grouped[g.key].map((row) => (
                      <AkPanel key={row.obligation_id} className="p-5">
                        <div className="flex items-center gap-2 mb-3 flex-wrap">
                          <AkBadge tone={g.tone}>{g.label.toUpperCase()}</AkBadge>
                          <AkBadge tone="muted">{fmtFace(row.face)}</AkBadge>
                          {row.is_breach && <AkBadge tone="danger">BREACH</AkBadge>}
                        </div>

                        <div className="text-base font-extrabold text-white leading-snug">
                          {safeStr(row.title)}
                        </div>

                        {row.why && (
                          <div className="mt-1.5 text-sm text-white/45">{row.why}</div>
                        )}

                        <div className="mt-3 flex flex-wrap gap-4 text-xs text-white/35">
                          {row.due_at && (
                            <span>
                              Due:{" "}
                              <span className="text-white/60">{fmtDue(row.due_at)}</span>
                            </span>
                          )}
                          {row.economic_ref_id && (
                            <span>
                              Ref:{" "}
                              <span className="text-white/60">
                                {safeStr(row.economic_ref_type)} {safeStr(row.economic_ref_id)}
                              </span>
                            </span>
                          )}
                          {row.age_hours != null && (
                            <span>
                              Age:{" "}
                              <span className="text-white/60">
                                {Math.round(row.age_hours)}h
                              </span>
                            </span>
                          )}
                        </div>
                      </AkPanel>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}

          {/* divider */}
          <div className="my-10 h-px bg-gradient-to-r from-white/10 via-white/5 to-transparent" />

          {/* Recent Receipts */}
          <div>
            <AkSectionHeader label="Recent Receipts" count={receipts.length} />

            {receipts.length === 0 && (
              <div className="mt-4 text-sm text-white/30">
                No advertising receipts yet. Sealed obligations appear here.
              </div>
            )}

            <div className="mt-4 grid gap-3">
              {receipts.map((r) => (
                <AkPanel key={r.receipt_id} className="p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <AkBadge tone="gold">SEALED</AkBadge>
                        {r.economic_ref_id && (
                          <AkBadge tone="muted">
                            {safeStr(r.economic_ref_type)} {safeStr(r.economic_ref_id)}
                          </AkBadge>
                        )}
                      </div>
                      <div className="text-xs text-white/35">
                        Receipt:{" "}
                        <span className="font-mono text-white/60">
                          {r.receipt_id.slice(0, 12)}…
                        </span>
                      </div>
                    </div>
                    <div className="text-xs text-white/35 text-right shrink-0">
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
              className="rounded-xl bg-white text-neutral-950 px-4 py-2.5 text-sm font-extrabold hover:bg-white/90 transition"
            >
              Command View →
            </Link>
            <Link
              href="/receipts"
              className="rounded-xl bg-white/[0.04] text-white/70 border border-white/10 px-4 py-2.5 text-sm font-extrabold hover:bg-white/[0.07] transition"
            >
              All Receipts →
            </Link>
          </div>
        </>
      )}
    </AkShell>
  );
}
