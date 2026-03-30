"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FileCheck, Hash, Clock, Search } from "lucide-react";
import { OperatorSummaryPanel } from "@/components/operator-summary-panel";
import {
  AkShell,
  AkPanel,
  AkSectionHeader,
  AkInput,
} from "@/components/ak/ak-ui";
import { fetchOperatorSummary } from "@/lib/operator-summary-client";
import type { OperatorSummary } from "@/lib/operator-summary";
import type { ReceiptRow } from "@/lib/ui-models";
import {
  fmtEnforcementDomain,
  fmtReceiptLabel,
  fmtReceiptSummary,
  readReceiptMetadata,
  safeStr,
} from "@/lib/ui-fmt";

class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

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

function normalizeReceiptRows(payload: unknown): ReceiptRow[] {
  if (Array.isArray(payload)) {
    return payload as ReceiptRow[];
  }

  if (payload && typeof payload === "object") {
    const obj = payload as {
      rows?: unknown;
      data?: unknown;
    };

    if (Array.isArray(obj.rows)) {
      return obj.rows as ReceiptRow[];
    }

    if (Array.isArray(obj.data)) {
      return obj.data as ReceiptRow[];
    }
  }

  return [];
}

function describeReceipt(row: ReceiptRow) {
  return {
    label: fmtReceiptLabel({
      payload: row.payload,
      face: typeof row.face === "string" ? row.face : null,
      receiptType: row.receipt_type ?? null,
    }),
    summary: fmtReceiptSummary(row.payload),
    metadata: readReceiptMetadata(row.payload),
  };
}

export default function ReceiptsPage() {
  const [rows, setRows] = useState<ReceiptRow[]>([]);
  const [summary, setSummary] = useState<OperatorSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [authLocked, setAuthLocked] = useState(false);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<ReceiptRow | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setErr(null);
    setAuthLocked(false);

    try {
      const [summaryRes, receiptsRes] = await Promise.allSettled([
        fetchOperatorSummary(),
        fetch("/api/receipts/feed", { cache: "no-store" }),
      ]);

      if (summaryRes.status === "fulfilled") {
        setSummary(summaryRes.value);
        setAuthLocked(summaryRes.value.live_state_health === "access_required");
      } else {
        setSummary(null);
      }

      if (receiptsRes.status === "rejected") {
        throw receiptsRes.reason;
      }

      const j = await receiptsRes.value.json().catch(() => ({}));

      if (!receiptsRes.value.ok) {
        const message =
          j && typeof j === "object" && "error" in j && typeof j.error === "string"
            ? j.error
            : `HTTP ${receiptsRes.value.status}`;
        throw new ApiError(receiptsRes.value.status, message);
      }

      const nextRows = normalizeReceiptRows(j);
      setRows(nextRows);

      if (nextRows.length === 0) {
        setSelected(null);
      } else if (
        selected &&
        !nextRows.some((row) => row.receipt_id === selected.receipt_id)
      ) {
        setSelected(null);
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setAuthLocked(true);
        setErr(null);
      } else {
        setErr(e instanceof Error ? e.message : String(e));
      }
      setRows([]);
      setSelected(null);
    } finally {
      setLoading(false);
    }
  }, [selected]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;

    return rows.filter((r) => {
      const description = describeReceipt(r);
      const hay = [
        r.receipt_id,
        r.obligation_id,
        r.sealed_by ?? "",
        description.label,
        description.summary,
        description.metadata.proofKind ?? "",
        description.metadata.action ?? "",
        description.metadata.reasonCode ?? "",
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
      subtitle="Closure receipts for the billing enforcement domain. If it doesn't have a receipt, it didn't happen."
      eyebrow="Billing Proof Layer"
    >
      <div className="mb-8 max-w-xl">
        <AkSectionHeader label="Search receipts" />
        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/25" />
          <AkInput
            value={q}
            onChange={setQ}
            placeholder="receipt id · obligation · operator · revenue ref…"
            className="pl-9"
          />
        </div>
      </div>

      {summary ? <OperatorSummaryPanel summary={summary} className="mb-8" /> : null}

      {loading && (
        <div className="flex items-center gap-3 text-sm text-white/35">
          <div className="h-1 w-1 animate-pulse rounded-full bg-emerald-400" />
          Loading proof records…
        </div>
      )}

      {!loading && authLocked && (
        <AkPanel className="max-w-lg px-6 py-5">
          <div className="mb-2 text-sm font-extrabold text-white">
            Sign in to load billing receipts
          </div>
          <div className="text-sm text-white/60">
            AutoKirk found the proof layer, but there is no live authenticated
            operator session attached to this browser.
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/login?redirect=%2Fcommand%2Freceipts"
              className="inline-flex items-center justify-center rounded-xl bg-white px-4 py-3 text-sm font-extrabold text-neutral-950 transition hover:bg-white/90"
            >
              Sign in
            </Link>
            <button
              onClick={loadData}
              className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-extrabold text-white/70 transition hover:border-white/20 hover:text-white"
            >
              Retry
            </button>
          </div>
        </AkPanel>
      )}

      {!loading && err && (
        <AkPanel className="max-w-lg border-red-400/20 bg-red-400/5 px-6 py-5">
          <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-red-400">
            Error
          </div>
          <div className="text-sm text-white/60">{err}</div>
          <button
            onClick={loadData}
            className="mt-4 text-[10px] uppercase tracking-[0.2em] text-white/40 transition hover:text-white"
          >
            Retry →
          </button>
        </AkPanel>
      )}

      {!loading && !err && !authLocked && (
        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <div>
            <AkSectionHeader
              label={`${filtered.length} receipt${filtered.length !== 1 ? "s" : ""}${q && rows.length !== filtered.length ? ` of ${rows.length}` : ""}`}
              right={
                <button
                  onClick={loadData}
                  className="text-[10px] uppercase tracking-[0.18em] text-white/30 transition hover:text-white/70"
                >
                  Refresh
                </button>
              }
            />

            <div className="mt-5">
              {filtered.length === 0 ? (
                <AkPanel className="p-12 text-center">
                  <div className="mb-4 text-4xl text-white/20">∅</div>
                  <div className="text-sm font-semibold text-white/40">
                    {q ? "No receipts match your search" : "No receipts visible in this view"}
                  </div>
                  {!q && summary ? (
                    <div className="mt-3 text-sm text-white/35">{summary.status_message}</div>
                  ) : null}
                  {q && (
                    <button
                      onClick={() => setQ("")}
                      className="mt-3 text-[10px] uppercase tracking-[0.18em] text-white/30 transition hover:text-white/60"
                    >
                      Clear search
                    </button>
                  )}
                </AkPanel>
              ) : (
                <div className="space-y-2">
                  {filtered.map((r) => {
                    const isSelected = selected?.receipt_id === r.receipt_id;
                    const description = describeReceipt(r);
                    const refLabel = r.economic_ref_id
                      ? `${safeStr(r.economic_ref_type)} ${safeStr(r.economic_ref_id)}`.trim()
                      : null;
                    const domainLabel = fmtEnforcementDomain(
                      typeof r.face === "string" ? r.face : null,
                    );

                    return (
                      <button
                        key={r.receipt_id}
                        onClick={() => setSelected(isSelected ? null : r)}
                        className={[
                          "group w-full rounded-2xl border px-5 py-4 text-left transition",
                          isSelected
                            ? "border-white/25 bg-white/[0.06]"
                            : "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]",
                        ].join(" ")}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 flex items-start gap-3">
                            <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-white/30">
                              <FileCheck className="h-3.5 w-3.5" />
                            </div>
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-white">
                                {description.label}
                              </div>
                              <div className="mt-1 truncate text-sm text-slate-300">
                                {description.summary}
                              </div>
                              <div className="mt-1 text-[10px] uppercase tracking-[0.1em] text-white/35">
                                {domainLabel}
                                <span className="mx-1.5 opacity-40">·</span>
                                {refLabel ?? `${r.receipt_id.slice(0, 16)}…`}
                                <span className="mx-1.5 opacity-40">·</span>
                                {fmtDate(r.sealed_at)}
                              </div>
                            </div>
                          </div>
                          <span className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[9px] uppercase tracking-[0.15em] text-emerald-300">
                            <span className="h-1 w-1 rounded-full bg-emerald-400" />
                            Closure receipt
                          </span>
                        </div>
                        <div className="mt-3 truncate font-mono text-[9px] text-white/20">
                          {r.receipt_id}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div>
            {selected ? (
              <div className="rounded-[1.4rem] border border-white/10 bg-white/[0.03] p-6 lg:sticky lg:top-24">
                {(() => {
                  const description = describeReceipt(selected);
                  const domainLabel = fmtEnforcementDomain(
                    typeof selected.face === "string" ? selected.face : null,
                  );
                  return (
                    <>
                <div className="mb-5 flex items-center justify-between gap-3">
                  <div className="text-[9px] uppercase tracking-[0.3em] text-white/35">
                    Receipt detail
                  </div>
                  <button
                    onClick={() => setSelected(null)}
                    className="text-[10px] uppercase tracking-[0.2em] text-white/30 transition hover:text-white/60"
                  >
                    Close
                  </button>
                </div>

                <div className="mb-6 flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-white/30">
                    <FileCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-base font-semibold text-white">
                      {description.label}
                    </div>
                    <div className="mt-1 text-sm text-slate-300">
                      {description.summary}
                    </div>
                    <div className="mt-1 text-[10px] uppercase tracking-[0.12em] text-emerald-400/70">
                      {domainLabel}
                    </div>
                  </div>
                </div>

                <div className="space-y-3 text-sm">
                  {description.metadata.proofKind || description.metadata.action || description.metadata.reasonCode ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {description.metadata.proofKind ? (
                        <div className="rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3">
                          <div className="mb-1 text-[9px] uppercase tracking-[0.22em] text-white/30">
                            Proof kind
                          </div>
                          <div className="text-xs text-white/60">{description.metadata.proofKind}</div>
                        </div>
                      ) : null}

                      {description.metadata.action ? (
                        <div className="rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3">
                          <div className="mb-1 text-[9px] uppercase tracking-[0.22em] text-white/30">
                            Action
                          </div>
                          <div className="text-xs text-white/60">{description.metadata.action}</div>
                        </div>
                      ) : null}

                      {description.metadata.reasonCode ? (
                        <div className="rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3 sm:col-span-2">
                          <div className="mb-1 text-[9px] uppercase tracking-[0.22em] text-white/30">
                            Reason code
                          </div>
                          <div className="text-xs text-white/60">{description.metadata.reasonCode}</div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3">
                    <div className="mb-1 flex items-center gap-1.5 text-[9px] uppercase tracking-[0.22em] text-white/30">
                      <Hash className="h-2.5 w-2.5" /> Receipt ID
                    </div>
                    <div className="break-all font-mono text-xs text-white/55">
                      {selected.receipt_id}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3">
                    <div className="mb-1 text-[9px] uppercase tracking-[0.22em] text-white/30">
                      Obligation
                    </div>
                    <div className="break-all font-mono text-xs text-white/55">
                      {selected.obligation_id}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3">
                    <div className="mb-1 flex items-center gap-1.5 text-[9px] uppercase tracking-[0.22em] text-white/30">
                      <Clock className="h-2.5 w-2.5" /> Recorded at
                    </div>
                    <div className="text-xs text-white/60">
                      {fmtDate(selected.sealed_at)}
                    </div>
                  </div>

                  {selected.sealed_by && (
                    <div className="rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3">
                      <div className="mb-1 text-[9px] uppercase tracking-[0.22em] text-white/30">
                        Recorded by
                      </div>
                      <div className="text-xs text-white/60">
                        {selected.sealed_by}
                      </div>
                    </div>
                  )}

                  {selected.receipt_type && (
                    <div className="rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3">
                      <div className="mb-1 text-[9px] uppercase tracking-[0.22em] text-white/30">
                        Receipt type
                      </div>
                      <div className="text-xs text-white/60">
                        {selected.receipt_type}
                      </div>
                    </div>
                  )}

                  {selected.economic_ref_id && (
                    <div className="rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3">
                      <div className="mb-1 text-[9px] uppercase tracking-[0.22em] text-white/30">
                        Economic ref
                      </div>
                      <div className="text-xs text-white/60">
                        <span className="text-white/35">
                          {safeStr(selected.economic_ref_type)}{" "}
                        </span>
                        <span className="font-mono">
                          {safeStr(selected.economic_ref_id)}
                        </span>
                      </div>
                    </div>
                  )}

                  {selected.ledger_event_id && (
                    <div className="rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3">
                      <div className="mb-1 text-[9px] uppercase tracking-[0.22em] text-white/30">
                        Ledger event
                      </div>
                      <div className="break-all font-mono text-xs text-white/55">
                        {selected.ledger_event_id}
                      </div>
                    </div>
                  )}
                </div>
                    </>
                  );
                })()}
              </div>
            ) : (
              <div className="hidden rounded-[1.4rem] border border-white/8 bg-white/[0.015] p-8 text-center lg:sticky lg:top-24 lg:block">
                <div className="mb-3 text-3xl text-white/15">◎</div>
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
