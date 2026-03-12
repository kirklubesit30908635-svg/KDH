"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { NextActionRow } from "@/lib/ui-models";
import { fmtDue, safeStr } from "@/lib/ui-fmt";
import {
  AkShell,
  AkPanel,
  AkBadge,
  AkButton,
  AkSectionHeader,
} from "@/components/ak/ak-ui";

const OSM_LOCATIONS = ["All Locations", "Downtown", "Marina Bay", "Westside"] as const;
type LocationFilter = (typeof OSM_LOCATIONS)[number];

function getActionKind(row: NextActionRow): "touch" | "quote" | "seal" {
  const ref = (row.economic_ref_type ?? "").toLowerCase();
  if (ref === "lead") return "touch";
  if (ref === "quote") return "quote";
  return "seal";
}

function fmtAge(ageHours: number | null): string {
  if (ageHours == null) return "";
  if (ageHours < 24) return `${Math.round(ageHours)}h old`;
  return `${Math.round(ageHours / 24)}d old`;
}

interface SealedReceipt {
  receipt_id: string;
  obligation_id: string;
  action: "touch" | "quote" | "seal";
}

export default function InboxPage() {
  const [rows, setRows] = useState<NextActionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [locationFilter, setLocationFilter] = useState<LocationFilter>("All Locations");
  const [sealedReceipt, setSealedReceipt] = useState<SealedReceipt | null>(null);

  const filtered = useMemo(() => {
    let list = [...rows].sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return ta - tb;
    });
    if (locationFilter !== "All Locations") {
      list = list.filter((r) => {
        const loc = (r as any).location ?? "";
        return loc === locationFilter;
      });
    }
    return list;
  }, [rows, locationFilter]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/command/feed");
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const json = await res.json();
      setRows((json.rows ?? []) as NextActionRow[]);
    } catch (e) {
      setErr(`Load failed: ${e instanceof Error ? e.message : String(e)}`);
      setRows([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleTouch(obligationId: string) {
    setActingId(obligationId);
    try {
      const res = await fetch("/api/command/touch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ obligation_id: obligationId }),
      });
      const json = await res.json();
      if (!res.ok) {
        alert(`Touch failed: ${json.error ?? "Unknown error"}`);
      } else {
        setSealedReceipt({
          receipt_id: json.receipt_id,
          obligation_id: obligationId,
          action: "touch",
        });
        await loadData();
      }
    } catch (e) {
      alert(`Touch failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setActingId(null);
    }
  }

  async function handleSeal(obligationId: string, action: "quote" | "seal") {
    setActingId(obligationId);
    try {
      const res = await fetch("/api/command/seal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ obligation_id: obligationId, action }),
      });
      const json = await res.json();
      if (!res.ok) {
        alert(`Failed: ${json.error ?? "Unknown error"}`);
      } else {
        setSealedReceipt({
          receipt_id: json.receipt_id,
          obligation_id: obligationId,
          action,
        });
        setRows((prev) => prev.filter((r) => r.obligation_id !== obligationId));
      }
    } catch (e) {
      alert(`Failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setActingId(null);
    }
  }

  return (
    <AkShell title="Inbox" subtitle="Your next actions — oldest first.">
      {/* location filter */}
      <div className="mb-6 flex items-center gap-2 flex-wrap">
        {OSM_LOCATIONS.map((loc) => (
          <button
            key={loc}
            onClick={() => setLocationFilter(loc)}
            className={[
              "rounded-xl px-4 py-2 text-xs font-extrabold border transition",
              locationFilter === loc
                ? "bg-white text-neutral-950 border-white"
                : "bg-white/[0.04] text-white/40 border-white/10 hover:text-white",
            ].join(" ")}
          >
            {loc}
          </button>
        ))}
        <button
          onClick={loadData}
          className="ml-auto text-xs font-bold text-white/35 hover:text-white transition"
        >
          Refresh
        </button>
      </div>

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
            onClick={loadData}
            className="mt-4 text-xs font-bold text-white/60 hover:text-white hover:underline transition"
          >
            Retry →
          </button>
        </AkPanel>
      )}

      {!loading && !err && (
        <>
          <div className="mb-6 flex items-center gap-3">
            <span className="text-3xl font-extrabold text-white">{filtered.length}</span>
            <span className="text-sm text-white/35">
              open item{filtered.length !== 1 ? "s" : ""}
              {locationFilter !== "All Locations" ? ` · ${locationFilter}` : ""}
            </span>
          </div>

          {filtered.length === 0 && (
            <AkPanel className="p-10 text-center">
              <div className="text-4xl mb-3">✓</div>
              <div className="text-base font-extrabold text-white mb-1">All Clear</div>
              <div className="text-sm text-white/35">
                {locationFilter !== "All Locations"
                  ? `No open items at ${locationFilter}.`
                  : "No open items. Every duty has been logged."}
              </div>
            </AkPanel>
          )}

          {filtered.length > 0 && (
            <div className="space-y-4">
              <AkSectionHeader label="Open Items" count={filtered.length} />
              <div className="mt-4 grid gap-4">
                {filtered.map((row) => {
                  const kind = getActionKind(row);
                  const location = (row as any).location as string | null | undefined;
                  const isActing = actingId === row.obligation_id;

                  return (
                    <AkPanel key={row.obligation_id} className="p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-3 flex-wrap">
                            {row.is_breach && <AkBadge tone="danger">OVERDUE</AkBadge>}
                            {row.economic_ref_type && (
                              <AkBadge tone="muted">
                                {row.economic_ref_type.toUpperCase()}
                              </AkBadge>
                            )}
                            {location && (
                              <AkBadge tone="gold">{location}</AkBadge>
                            )}
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
                                <span className={row.is_breach ? "text-red-400 font-bold" : "text-white/60"}>
                                  {fmtDue(row.due_at)}
                                </span>
                              </span>
                            )}
                            {row.age_hours != null && (
                              <span>{fmtAge(row.age_hours)}</span>
                            )}
                            {row.economic_ref_id && (
                              <span>
                                Ref:{" "}
                                <span className="text-white/60 font-mono text-[11px]">
                                  {safeStr(row.economic_ref_id)}
                                </span>
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="mt-5 flex gap-3">
                        {kind === "touch" && (
                          <AkButton
                            tone="gold"
                            disabled={isActing}
                            onClick={() => handleTouch(row.obligation_id)}
                          >
                            {isActing ? "Logging…" : "Log Touch"}
                          </AkButton>
                        )}
                        {kind === "quote" && (
                          <AkButton
                            tone="gold"
                            disabled={isActing}
                            onClick={() => handleSeal(row.obligation_id, "quote")}
                          >
                            {isActing ? "Marking…" : "Mark Quote Sent"}
                          </AkButton>
                        )}
                        {kind === "seal" && (
                          <AkButton
                            tone="gold"
                            disabled={isActing}
                            onClick={() => handleSeal(row.obligation_id, "seal")}
                          >
                            {isActing ? "Sealing…" : "Seal Closure"}
                          </AkButton>
                        )}
                      </div>
                    </AkPanel>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* Receipt Confirmation Modal */}
      {sealedReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setSealedReceipt(null)}
          />
          <div className="relative w-full max-w-sm">
            <AkPanel className="p-8 text-center">
              <div className="text-5xl mb-4">
                {sealedReceipt.action === "touch" ? "✋" : "✓"}
              </div>
              <div className="text-xl font-extrabold text-white mb-1">
                {sealedReceipt.action === "touch"
                  ? "Touch Logged"
                  : sealedReceipt.action === "quote"
                  ? "Quote Marked Sent"
                  : "Sealed"}
              </div>
              <div className="mt-5 rounded-xl bg-white/[0.04] border border-white/10 p-4 text-left">
                <div className="text-[10px] font-extrabold tracking-widest text-white/30 mb-2">
                  RECEIPT ID
                </div>
                <div className="font-mono text-xs text-white/60 break-all">
                  {sealedReceipt.receipt_id}
                </div>
              </div>
              <button
                onClick={() => setSealedReceipt(null)}
                className="mt-6 w-full rounded-xl bg-white text-neutral-950 px-4 py-3 text-sm font-extrabold hover:bg-white/90 transition"
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
