"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReceiptRow } from "@/lib/ui-models";
import { fmtFace, safeStr } from "@/lib/ui-fmt";
import { createClient } from "@/lib/supabase/supabaseBrowser";
import { AkBadge, AkInput, AkPanel, AkSectionHeader, AkShell } from "@/components/ak/ak-ui";

export default function ReceiptsPage() {
  const [rows, setRows] = useState<ReceiptRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(r => {
      const hay = [
        r.receipt_id,
        r.obligation_id,
        r.sealed_by ?? "",
        safeStr(r.face),
        safeStr(r.economic_ref_type),
        safeStr(r.economic_ref_id),
        safeStr(r.ledger_event_id),
      ].join(" ").toLowerCase();
      return hay.includes(needle);
    });
  }, [rows, q]);

  useEffect(() => {
    let alive = true;

    async function run() {
      setLoading(true);
      setErr(null);

      const supabase = createClient();

      const { data, error } = await supabase
        .schema("core")
        .from("v_receipts")
        .select("*")
        .order("sealed_at", { ascending: false });

      if (!alive) return;

      if (error) {
        setErr(`Receipts load failed: ${error.message}`);
        setRows([]);
      } else {
        setRows((data ?? []) as ReceiptRow[]);
      }

      setLoading(false);
    }

    run();
    return () => { alive = false; };
  }, []);

  return (
    <AkShell
      title="Receipts"
      subtitle="Institutional proof layer. Searchable receipts tied to obligations and ledger references."
    >
      <AkPanel className="p-4">
        <div className="flex flex-col gap-2">
          <div className="text-xs font-bold tracking-wide text-zinc-500">SEARCH</div>
          <AkInput
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="receipt_id • obligation_id • operator • invoice/lead/campaign • ledger pointer"
          />
        </div>
      </AkPanel>

      <div className="mt-6">
        <AkSectionHeader label="Results" count={filtered.length} />

        {loading ? <div className="mt-3 text-sm text-zinc-400">Loading…</div> : null}

        {!loading && err ? (
          <AkPanel className="mt-3 p-4">
            <div className="text-sm font-extrabold text-[#d6b24a]">Error</div>
            <div className="mt-2 text-sm text-zinc-400">{err}</div>
          </AkPanel>
        ) : null}

        {!loading && !err ? (
          <div className="mt-3 grid gap-3">
            {filtered.map(r => (
              <AkPanel key={r.receipt_id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <AkBadge tone="gold">RECEIPT</AkBadge>
                      <AkBadge tone="muted">{fmtFace(r.face)}</AkBadge>
                      {r.economic_ref_id ? (
                        <AkBadge tone="muted">
                          {safeStr(r.economic_ref_type)} {safeStr(r.economic_ref_id)}
                        </AkBadge>
                      ) : null}
                    </div>

                    <div className="mt-3 text-base font-extrabold text-zinc-100">{r.receipt_id}</div>

                    <div className="mt-2 text-sm text-zinc-400">
                      Obligation: <span className="text-zinc-200">{r.obligation_id}</span>
                    </div>

                    <div className="mt-2 text-xs text-zinc-500">
                      Sealed: <span className="text-zinc-300">{new Date(r.sealed_at).toLocaleString()}</span>
                      {" • "}
                      Operator: <span className="text-zinc-300">{safeStr(r.sealed_by) || "—"}</span>
                      {" • "}
                      Ledger: <span className="text-zinc-300">{safeStr(r.ledger_event_id) || "—"}</span>
                    </div>
                  </div>

                  <div className="text-xs text-zinc-600">(Detail view later)</div>
                </div>
              </AkPanel>
            ))}

            {filtered.length === 0 ? (
              <div className="mt-3 text-xs text-zinc-600">No receipts found.</div>
            ) : null}
          </div>
        ) : null}
      </div>
    </AkShell>
  );
}