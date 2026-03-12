"use client";

import { useCallback, useEffect, useState } from "react";
import { Users, ShieldCheck, Link2, Building2 } from "lucide-react";
import { AkShell, AkPanel, AkSectionHeader } from "@/components/ak/ak-ui";

interface Membership {
  workspace_id: string;
  workspace_name: string;
  workspace_slug: string;
  role: string;
  joined_at: string;
}

interface OperatorRow {
  id: string;
  handle: string;
  auth_uid: string | null;
  created_at: string;
  memberships: Membership[];
}

interface Stats {
  total_operators: number;
  linked_operators: number;
  total_workspaces: number;
}

const ROLE_STYLES: Record<string, string> = {
  owner: "text-white bg-white/10 border-white/20",
  admin: "text-white/80 bg-white/[0.06] border-white/15",
  member: "text-white/50 bg-white/[0.03] border-white/10",
  viewer: "text-white/35 bg-transparent border-white/8",
};

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export default function UsersPage() {
  const [rows, setRows] = useState<OperatorRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<OperatorRow | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/users/feed");
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const json = await res.json();
      setRows(json.rows ?? []);
      setStats(json.stats ?? null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const statCards = stats
    ? [
        {
          label: "Operators",
          value: String(stats.total_operators),
          sub: "registered handles",
          icon: Users,
          fill: "100%",
        },
        {
          label: "Auth Linked",
          value: String(stats.linked_operators),
          sub: `of ${stats.total_operators} with auth.uid`,
          icon: Link2,
          fill:
            stats.total_operators > 0
              ? `${Math.round((stats.linked_operators / stats.total_operators) * 100)}%`
              : "0%",
        },
        {
          label: "Workspaces",
          value: String(stats.total_workspaces),
          sub: "active workspaces",
          icon: Building2,
          fill: "100%",
        },
        {
          label: "Unlinked",
          value: String(stats.total_operators - stats.linked_operators),
          sub: "pending auth bind",
          icon: ShieldCheck,
          fill:
            stats.total_operators > 0
              ? `${Math.round(((stats.total_operators - stats.linked_operators) / stats.total_operators) * 100)}%`
              : "0%",
        },
      ]
    : [];

  return (
    <AkShell
      title="Users"
      subtitle="Registered operators, workspace memberships, and auth binding status. All writes go through api.append_event — no direct mutations."
    >
      {/* Stat bento grid */}
      {statCards.length > 0 && (
        <div className="grid grid-cols-2 gap-3 max-w-2xl mb-10 lg:grid-cols-4">
          {statCards.map(({ label, value, sub, icon: Icon, fill }) => (
            <AkPanel key={label} className="p-5 relative overflow-hidden transition hover:border-white/20 hover:bg-white/[0.05]">
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
            </AkPanel>
          ))}
        </div>
      )}

      <div className="h-px bg-gradient-to-r from-white/10 via-white/5 to-transparent mb-10" />

      {/* Content */}
      {loading && (
        <div className="flex items-center gap-3 text-sm text-white/35">
          <div className="h-1 w-1 rounded-full bg-emerald-400 animate-pulse" />
          Loading operators…
        </div>
      )}

      {!loading && err && (
        <AkPanel className="px-6 py-5 max-w-lg border-red-400/20 bg-red-400/5">
          <div className="text-xs font-semibold uppercase tracking-widest text-red-400 mb-2">Error</div>
          <div className="text-sm text-white/60">{err}</div>
          <button
            onClick={loadData}
            className="mt-4 text-[10px] uppercase tracking-[0.2em] text-white/40 hover:text-white transition"
          >
            Retry →
          </button>
        </AkPanel>
      )}

      {!loading && !err && (
        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          {/* Operator list */}
          <div>
            <AkSectionHeader
              label={`${rows.length} operator${rows.length !== 1 ? "s" : ""}`}
              right={
                <button
                  onClick={loadData}
                  className="text-[10px] uppercase tracking-[0.18em] text-white/30 hover:text-white/70 transition"
                >
                  Refresh
                </button>
              }
            />

            <div className="mt-5">
              {rows.length === 0 ? (
                <AkPanel className="p-12 text-center">
                  <div className="text-4xl mb-4 text-white/20">∅</div>
                  <div className="text-sm font-semibold text-white/40">No operators registered</div>
                </AkPanel>
              ) : (
                <div className="space-y-2">
                  {rows.map((op) => {
                    const isSelected = selected?.id === op.id;
                    return (
                      <button
                        key={op.id}
                        onClick={() => setSelected(isSelected ? null : op)}
                        className={[
                          "w-full text-left rounded-2xl border px-5 py-4 transition group",
                          isSelected
                            ? "border-white/25 bg-white/[0.06]"
                            : "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]",
                        ].join(" ")}
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="flex-shrink-0 h-9 w-9 rounded-xl border border-white/10 bg-white/[0.04] flex items-center justify-center text-xs font-semibold text-white/60">
                              {op.handle.slice(0, 2).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-white truncate">{op.handle}</div>
                              <div className="text-[10px] text-white/35 uppercase tracking-[0.1em] mt-0.5">
                                {op.memberships.length} workspace{op.memberships.length !== 1 ? "s" : ""}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {op.auth_uid ? (
                              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[9px] uppercase tracking-[0.15em] text-emerald-300">
                                <span className="h-1 w-1 rounded-full bg-emerald-400" />
                                Linked
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[9px] uppercase tracking-[0.15em] text-white/35">
                                Unlinked
                              </span>
                            )}
                          </div>
                        </div>

                        {op.memberships.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {op.memberships.map((m) => (
                              <span
                                key={m.workspace_id}
                                className={[
                                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[9px] uppercase tracking-[0.1em]",
                                  ROLE_STYLES[m.role] ?? ROLE_STYLES.member,
                                ].join(" ")}
                              >
                                {m.workspace_name}
                                <span className="opacity-60">·</span>
                                {m.role}
                              </span>
                            ))}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Detail panel */}
          <div className="hidden lg:block">
            {selected ? (
              <div className="sticky top-24 rounded-[1.4rem] border border-white/10 bg-white/[0.03] p-6">
                <div className="text-[9px] uppercase tracking-[0.3em] text-white/35 mb-5">
                  // Operator detail
                </div>

                <div className="flex items-center gap-3 mb-6">
                  <div className="h-12 w-12 rounded-xl border border-white/10 bg-white/[0.05] flex items-center justify-center text-base font-semibold text-white/70">
                    {selected.handle.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="text-lg font-semibold text-white">{selected.handle}</div>
                    <div className="text-[10px] text-white/35 uppercase tracking-[0.12em] mt-0.5">
                      {selected.auth_uid ? "Auth linked" : "No auth binding"}
                    </div>
                  </div>
                </div>

                <div className="space-y-3 text-sm">
                  <div className="rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3">
                    <div className="text-[9px] uppercase tracking-[0.22em] text-white/30 mb-1">Operator ID</div>
                    <div className="font-mono text-xs text-white/55 break-all">{selected.id}</div>
                  </div>

                  <div className="rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3">
                    <div className="text-[9px] uppercase tracking-[0.22em] text-white/30 mb-1">Auth UID</div>
                    <div className="font-mono text-xs text-white/55 break-all">
                      {selected.auth_uid ?? "—"}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3">
                    <div className="text-[9px] uppercase tracking-[0.22em] text-white/30 mb-1">Registered</div>
                    <div className="text-white/60 text-xs">{fmtDate(selected.created_at)}</div>
                  </div>

                  {selected.memberships.length > 0 && (
                    <div className="rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3">
                      <div className="text-[9px] uppercase tracking-[0.22em] text-white/30 mb-3">Memberships</div>
                      <div className="space-y-2">
                        {selected.memberships.map((m) => (
                          <div key={m.workspace_id} className="flex items-center justify-between gap-2">
                            <div className="text-white/65 text-xs">{m.workspace_name}</div>
                            <span
                              className={[
                                "rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-[0.1em]",
                                ROLE_STYLES[m.role] ?? ROLE_STYLES.member,
                              ].join(" ")}
                            >
                              {m.role}
                            </span>
                          </div>
                        ))}
                      </div>
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
                  Select an operator
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </AkShell>
  );
}
