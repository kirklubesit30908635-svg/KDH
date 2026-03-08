"use client";

import { useEffect, useMemo, useState } from "react";
import type { NextActionRow, SeverityGroup } from "@/lib/ui-models";
import { fmtDue, fmtFace, safeStr } from "@/lib/ui-fmt";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type Grouped = Record<SeverityGroup, NextActionRow[]>;

const GROUPS: { key: SeverityGroup; label: string }[] = [
  { key: "critical", label: "Critical" },
  { key: "at_risk", label: "At Risk" },
  { key: "due_today", label: "Due Today" },
  { key: "queue", label: "Queue" },
];

function groupRows(rows: NextActionRow[]): Grouped {
  return {
    critical: rows.filter(r => r.severity === "critical"),
    at_risk: rows.filter(r => r.severity === "at_risk"),
    due_today: rows.filter(r => r.severity === "due_today"),
    queue: rows.filter(r => r.severity === "queue"),
  };
}

export default function CommandPage() {
  const [rows, setRows] = useState<NextActionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const grouped = useMemo(() => groupRows(rows), [rows]);

  useEffect(() => {
    let alive = true;

    async function run() {
      setLoading(true);
      setErr(null);

      const supabase = supabaseBrowser();

      const { data, error } = await supabase
        .schema("core")
        .from("v_next_actions")
        .select("*")
        .order("due_at", { ascending: true, nullsFirst: false });

      if (!alive) return;

      if (error) {
        setErr(`Command load failed: ${error.message}`);
        setRows([]);
      } else {
        setRows((data ?? []) as NextActionRow[]);
      }

      setLoading(false);
    }

    run();

    return () => {
      alive = false;
    };
  }, []);

  return (
    <main style={{ maxWidth: 860, margin: "0 auto", padding: 16 }}>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Command</h1>
        <p style={{ margin: "6px 0 0 0", opacity: 0.75 }}>
          Truth surface: <code>core.v_next_actions</code>
        </p>
      </header>

      {loading && <div>Loading…</div>}

      {!loading && err && (
        <div style={{ border: "1px solid rgba(255,255,255,0.15)", padding: 12, borderRadius: 10 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Error</div>
          <div style={{ opacity: 0.85 }}>{err}</div>
          <div style={{ marginTop: 10, opacity: 0.75 }}>
            Confirm the view exists and is granted for your current auth role.
          </div>
        </div>
      )}

      {!loading && !err && GROUPS.map(g => (
        <section key={g.key} style={{ marginTop: 18 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{g.label}</h2>
            <div style={{ opacity: 0.7 }}>{grouped[g.key].length}</div>
          </div>

          <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
            {grouped[g.key].map(row => (
              <div
                key={row.obligation_id}
                style={{
                  border: "1px solid rgba(255,255,255,0.14)",
                  borderRadius: 14,
                  padding: 12,
                }}
              >
                <div style={{ fontSize: 16, fontWeight: 700 }}>
                  {safeStr(row.title)}
                </div>

                <div style={{ marginTop: 6, opacity: 0.8, fontSize: 13 }}>
                  {row.why ? row.why : "—"}
                </div>

                <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", opacity: 0.8, fontSize: 12 }}>
                  <span>Face: {fmtFace(row.face)}</span>
                  {row.due_at ? <span>Due: {fmtDue(row.due_at)}</span> : <span>Due: —</span>}
                  {row.economic_ref_id ? (
                    <span>Ref: {safeStr(row.economic_ref_type)} {safeStr(row.economic_ref_id)}</span>
                  ) : (
                    <span>Ref: —</span>
                  )}
                </div>

                <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
                  <button
                    disabled
                    title="Seal Closure is disabled until the closure RPC contract is pinned."
                    style={{
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: "1px solid rgba(255,255,255,0.18)",
                      background: "transparent",
                      opacity: 0.6,
                      cursor: "not-allowed",
                    }}
                  >
                    Seal Closure
                  </button>

                  <button
                    onClick={() => alert(`Inspect (read-only)\n\nobligation_id: ${row.obligation_id}`)}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: "1px solid rgba(255,255,255,0.18)",
                      background: "transparent",
                      cursor: "pointer",
                    }}
                  >
                    Inspect
                  </button>
                </div>
              </div>
            ))}

            {grouped[g.key].length === 0 && (
              <div style={{ opacity: 0.7, fontSize: 13 }}>No items.</div>
            )}
          </div>
        </section>
      ))}
    </main>
  );
}
