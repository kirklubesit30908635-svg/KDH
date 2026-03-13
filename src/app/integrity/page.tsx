"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AkShell, AkPanel, AkSectionHeader } from "@/components/ak/ak-ui";

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface DomainStat {
  face:            string;
  label:           string;
  total:           number;
  sealed:          number;
  open:            number;
  breach_count:    number;
  closure_rate:    number;
  breach_rate:     number;
  integrity_score: number;
}

interface IntegrityStats {
  integrity_score: number;
  confidence:      "High" | "Medium" | "Low";

  closure_rate:      number;
  breach_rate:       number;
  event_coverage:    number;
  events_awaiting:   number;
  avg_closure_hours: number | null;
  latency_score:     number;
  proof_lag:         number;
  proof_score:       number;

  pts_closure:  number;
  pts_breach:   number;
  pts_coverage: number;
  pts_latency:  number;
  pts_proof:    number;

  domains: DomainStat[];

  open_obligations:   number;
  sealed_obligations: number;
  total_obligations:  number;
  breach_count:       number;
  stripe_events:      number;
  covered_events:     number;

  aging_penalty:  number;
  speed_mult:     number;
  delta_log:      { direction: "up" | "down" | "neutral"; label: string }[];
  computed_at: string;
}

// â”€â”€â”€ Signal generator (Section 19 â€” System Intelligence) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type SignalLevel = "clean" | "warn" | "critical";
interface Signal { level: SignalLevel; message: string }

function buildSignals(s: IntegrityStats): Signal[] {
  const out: Signal[] = [];

  if (s.proof_lag > 0) {
    out.push({
      level: "critical",
      message: `Proof lag: ${s.proof_lag} sealed obligation${s.proof_lag > 1 ? "s" : ""} without a receipt`,
    });
  }

  if (s.breach_count > 0) {
    out.push({
      level: "warn",
      message: `${s.breach_count} breach${s.breach_count > 1 ? "es" : ""} detected in open queue`,
    });
  }

  if (s.event_coverage < 100 && s.stripe_events > 0) {
    out.push({
      level: "warn",
      message: `Event coverage at ${s.event_coverage}% â€” ${s.events_awaiting} inbound event${s.events_awaiting !== 1 ? "s" : ""} without an obligation`,
    });
  }

  if (s.avg_closure_hours !== null && s.avg_closure_hours > 48) {
    out.push({
      level: "warn",
      message: `Obligation latency elevated: ${fmtHours(s.avg_closure_hours)} average to closure`,
    });
  }

  // Domain-level weakness
  for (const d of s.domains) {
    if (d.total > 0 && d.integrity_score < 70) {
      out.push({
        level: "warn",
        message: `${d.label} integrity at ${d.integrity_score} â€” needs attention`,
      });
    }
  }

  if (out.length === 0) {
    out.push({ level: "clean", message: "All signals clear â€” governance operating cleanly" });
  }

  return out;
}

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function scoreGrade(s: number) {
  if (s >= 90) return { grade: "A", label: "GOVERNANCE CLEAN",          color: "#22c55e" };
  if (s >= 80) return { grade: "B", label: "OPERATING WITHIN BOUNDS",   color: "#60a5fa" };
  if (s >= 70) return { grade: "C", label: "WATCH â€” REVIEW REQUIRED",   color: "#f59e0b" };
  if (s >= 60) return { grade: "D", label: "AT RISK â€” ACTION REQUIRED", color: "#f97316" };
  return              { grade: "F", label: "CRITICAL â€” SYSTEM AT RISK",  color: "#ef4444" };
}

function confidenceColor(c: "High" | "Medium" | "Low") {
  return c === "High" ? "#22c55e" : c === "Medium" ? "#f59e0b" : "#ef4444";
}

function signalColor(l: SignalLevel) {
  return l === "clean" ? "#22c55e" : l === "warn" ? "#f59e0b" : "#ef4444";
}

function signalIcon(l: SignalLevel) {
  return l === "clean" ? "âœ“" : l === "warn" ? "â–³" : "âœ•";
}

function metricColor(value: number, good: number, warn: number, invert = false) {
  const v = invert ? 100 - value : value;
  if (v >= good) return "#22c55e";
  if (v >= warn) return "#f59e0b";
  return "#ef4444";
}

function fmtHours(h: number | null): string {
  if (h === null) return "â€”";
  if (h < 1)      return "< 1h";
  if (h < 24)     return `${Math.round(h)}h`;
  const d = Math.floor(h / 24);
  const r = Math.round(h % 24);
  return r > 0 ? `${d}d ${r}h` : `${d}d`;
}

// â”€â”€â”€ SVG Ring â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function ScoreRing({ score, color }: { score: number; color: string }) {
  const r = 80; const cx = 100; const cy = 100;
  const circ = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 200 200" className="w-44 h-44 flex-shrink-0"
      style={{ filter: `drop-shadow(0 0 24px ${color}28)` }}>
      <defs>
        <filter id="arc-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3.5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="13" />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="13"
        strokeLinecap="round"
        strokeDasharray={`${(circ * score) / 100} ${circ}`}
        transform={`rotate(-90 ${cx} ${cy})`}
        filter="url(#arc-glow)"
        style={{ transition: "stroke-dasharray 1.1s cubic-bezier(0.4,0,0.2,1), stroke 0.4s ease" }}
      />
      <text x={cx} y={cy - 10} textAnchor="middle" dominantBaseline="middle"
        fill={color} fontSize="44" fontWeight="800"
        fontFamily="system-ui, -apple-system, sans-serif"
        style={{ fontVariantNumeric: "tabular-nums" }}>
        {score}
      </text>
      <text x={cx} y={cy + 22} textAnchor="middle" dominantBaseline="middle"
        fill="rgba(255,255,255,0.22)" fontSize="9" fontWeight="700"
        fontFamily="system-ui, -apple-system, sans-serif" letterSpacing="3">
        INTEGRITY
      </text>
    </svg>
  );
}

// â”€â”€â”€ Mini ring (for domains) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function MiniRing({ score, color }: { score: number; color: string }) {
  const r = 22; const cx = 28; const cy = 28;
  const circ = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 56 56" className="w-14 h-14 flex-shrink-0">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="5" />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={`${(circ * score) / 100} ${circ}`}
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: "stroke-dasharray 0.9s ease" }}
      />
      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle"
        fill={color} fontSize="12" fontWeight="800"
        fontFamily="system-ui, -apple-system, sans-serif">
        {score}
      </text>
    </svg>
  );
}

// â”€â”€â”€ Mini bar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function MiniBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="mt-2.5 h-1 w-full rounded-full bg-white/[0.06] overflow-hidden">
      <div className="h-full rounded-full transition-all duration-700"
        style={{ width: `${Math.min(100, Math.max(0, pct))}%`, backgroundColor: color }} />
    </div>
  );
}

// â”€â”€â”€ Score Breakdown row (Section 8 â€” improved clarity) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function BreakdownRow({
  label, weight, pts, pct, color, rawLabel,
}: {
  label: string; weight: string; pts: number; pct: number; color: string; rawLabel: string;
}) {
  return (
    <div className="py-3.5 border-b border-white/[0.06] last:border-0">
      <div className="flex items-center justify-between gap-4 mb-2">
        <div className="flex items-center gap-4">
          <div className="text-[10px] font-extrabold tracking-widest text-white/35 w-24">{label}</div>
          <div className="text-[10px] font-mono text-white/20">{weight}</div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {/* Section 8: show raw signal â†’ pts format */}
          <div className="font-mono text-[11px] text-white/25">{rawLabel}</div>
          <div className="text-white/20 text-[10px]">â†’</div>
          <div className="text-sm font-extrabold w-10 text-right" style={{ color }}>
            +{pts}
          </div>
        </div>
      </div>
      <div className="h-1 w-full rounded-full bg-white/[0.06] overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700"
          style={{ width: `${Math.min(100, Math.max(0, pct))}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

// â”€â”€â”€ Page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function IntegrityPage() {
  const [stats,   setStats]   = useState<IntegrityStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [err,     setErr]     = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/integrity/stats");
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
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  const scoreInfo = stats ? scoreGrade(stats.integrity_score) : null;
  const signals   = stats ? buildSignals(stats) : [];

  return (
    <AkShell title="Integrity" subtitle="Five signals. One score. No hiding.">

      {/* â”€â”€ Loading â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {loading && (
        <div className="flex items-center gap-3 text-sm text-white/35">
          <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Computing integrity scoreâ€¦
        </div>
      )}

      {/* â”€â”€ Error â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {!loading && err && (
        <AkPanel className="p-6">
          <div className="text-sm font-extrabold text-red-400 mb-2">Error</div>
          <div className="text-sm text-white/70">{err}</div>
          <button onClick={loadStats} className="mt-4 text-xs font-bold text-white/40 hover:text-white/80 transition">Retry â†’</button>
        </AkPanel>
      )}

      {!loading && !err && stats && scoreInfo && (
        <>

          {/* â•â• HERO â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
          <AkPanel className="p-8 mb-6 overflow-hidden relative">
            <div
              className="pointer-events-none absolute -left-12 top-1/2 -translate-y-1/2 h-64 w-64 rounded-full blur-3xl opacity-15"
              style={{ backgroundColor: scoreInfo.color }}
            />
            <div className="relative flex flex-col md:flex-row items-center gap-10">

              <ScoreRing score={stats.integrity_score} color={scoreInfo.color} />

              <div className="flex-1 text-center md:text-left">
                <div className="text-[10px] font-extrabold tracking-[0.32em] text-white/30 mb-4">
                  SYSTEM INTEGRITY SCORE
                </div>

                {/* Score + Grade */}
                <div className="flex items-end gap-4 justify-center md:justify-start">
                  <span className="text-[5.5rem] font-extrabold leading-none" style={{ color: scoreInfo.color }}>
                    {stats.integrity_score}
                  </span>
                  <span className="text-5xl font-extrabold leading-none mb-2" style={{ color: scoreInfo.color, opacity: 0.35 }}>
                    {scoreInfo.grade}
                  </span>
                </div>

                {/* Status + Confidence */}
                <div className="mt-3 flex items-center gap-3 justify-center md:justify-start flex-wrap">
                  <span className="text-xs font-extrabold tracking-[0.2em]" style={{ color: scoreInfo.color }}>
                    {scoreInfo.label}
                  </span>
                  <span className="text-white/20">Â·</span>
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-extrabold tracking-wide"
                    style={{
                      color:           confidenceColor(stats.confidence),
                      borderColor:     `${confidenceColor(stats.confidence)}30`,
                      backgroundColor: `${confidenceColor(stats.confidence)}0d`,
                    }}
                  >
                    <span className="h-1 w-1 rounded-full" style={{ backgroundColor: confidenceColor(stats.confidence) }} />
                    CONFIDENCE: {stats.confidence.toUpperCase()}
                  </span>
                </div>

                {/* Formula */}
                <div className="mt-4 font-mono text-[10px] text-white/20 leading-relaxed">
                  score = 0.30Ã—CR + 0.25Ã—(100âˆ’BR) + 0.20Ã—EC + 0.15Ã—LS + 0.10Ã—PS
                  <br />
                  <span className="text-white/35">
                    = {stats.pts_closure} + {stats.pts_breach} + {stats.pts_coverage} + {stats.pts_latency} + {stats.pts_proof}{" "}
                    = <span style={{ color: scoreInfo.color }}>{stats.integrity_score}</span>
                  </span>
                </div>

                <div className="mt-3 text-[11px] text-white/20">
                  {stats.total_obligations} obligations sampled Â· {new Date(stats.computed_at).toLocaleTimeString()} Â·{" "}
                  <button onClick={loadStats} className="text-white/30 hover:text-white/60 transition">Refresh</button>
                </div>
              </div>
            </div>
          </AkPanel>

          {/* â•â• SYSTEM INTELLIGENCE SIGNALS (Section 19) â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
          <div className="mb-6">
            <AkSectionHeader label="System Intelligence" />
            <div className="mt-3 space-y-2">
              {signals.map((sig, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 rounded-xl border px-4 py-3"
                  style={{
                    borderColor:     `${signalColor(sig.level)}20`,
                    backgroundColor: `${signalColor(sig.level)}08`,
                  }}
                >
                  <span className="text-[11px] font-extrabold mt-0.5 w-4 text-center flex-shrink-0"
                    style={{ color: signalColor(sig.level) }}>
                    {signalIcon(sig.level)}
                  </span>
                  <span className="text-sm text-white/70 leading-snug">{sig.message}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ══ SCORE DELTA LOG ══════════════════════════════════════════ */}
          <div className="mb-6">
            <AkSectionHeader label="Score Movement" />
            <div className="mt-3 flex flex-wrap gap-2">
              {stats.delta_log.map((item, i) => {
                const color = item.direction === "up" ? "#22c55e" : item.direction === "down" ? "#ef4444" : "#6b7280";
                const icon  = item.direction === "up" ? "▲" : item.direction === "down" ? "▼" : "·";
                return (
                  <span key={i} className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold"
                    style={{ color, borderColor: `${color}25`, backgroundColor: `${color}0a` }}>
                    <span>{icon}</span>{item.label}
                  </span>
                );
              })}
              {stats.aging_penalty > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold"
                  style={{ color: "#f97316", borderColor: "#f9731625", backgroundColor: "#f974160a" }}>
                  ⏳ {stats.open_obligations} open obligations aging
                </span>
              )}
            </div>
          </div>

          <div className="h-px bg-gradient-to-r from-white/10 via-white/5 to-transparent mb-6" />

          {/* â•â• FIVE METRICS â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
          <div className="grid gap-4 grid-cols-2 md:grid-cols-5 mb-8">

            {/* Closure Rate */}
            {(() => {
              const c = metricColor(stats.closure_rate, 80, 60);
              return (
                <AkPanel className="p-5">
                  <div className="text-[10px] font-extrabold tracking-widest text-white/30 mb-1">CLOSURE RATE</div>
                  <div className="text-3xl font-extrabold" style={{ color: c }}>{stats.closure_rate}%</div>
                  <div className="mt-1 text-[11px] text-white/30">{stats.sealed_obligations} of {stats.total_obligations} sealed</div>
                  <MiniBar pct={stats.closure_rate} color={c} />
                </AkPanel>
              );
            })()}

            {/* Breach Rate */}
            {(() => {
              const c = metricColor(stats.breach_rate, 0, 10, true);
              return (
                <AkPanel className="p-5">
                  <div className="text-[10px] font-extrabold tracking-widest text-white/30 mb-1">BREACH RATE</div>
                  <div className="text-3xl font-extrabold" style={{ color: c }}>{stats.breach_rate}%</div>
                  <div className="mt-1 text-[11px] text-white/30">{stats.breach_count} of {stats.open_obligations} open</div>
                  <MiniBar pct={stats.breach_rate} color={c} />
                </AkPanel>
              );
            })()}

            {/* Event Coverage */}
            {(() => {
              const c = metricColor(stats.event_coverage, 90, 70);
              return (
                <AkPanel className="p-5">
                  <div className="text-[10px] font-extrabold tracking-widest text-white/30 mb-1">EVENT COVERAGE</div>
                  <div className="text-3xl font-extrabold" style={{ color: c }}>{stats.event_coverage}%</div>
                  <div className="mt-1 text-[11px] text-white/30">
                    {stats.covered_events} processed Â· {stats.events_awaiting} awaiting
                  </div>
                  <MiniBar pct={stats.event_coverage} color={c} />
                </AkPanel>
              );
            })()}

            {/* Obligation Latency */}
            {(() => {
              const c = metricColor(stats.latency_score, 70, 50);
              return (
                <AkPanel className="p-5">
                  <div className="text-[10px] font-extrabold tracking-widest text-white/30 mb-1">OBL. LATENCY</div>
                  <div className="text-3xl font-extrabold" style={{ color: c }}>{fmtHours(stats.avg_closure_hours)}</div>
                  <div className="mt-1 text-[11px] text-white/30">avg time to closure</div>
                  <MiniBar pct={stats.latency_score} color={c} />
                </AkPanel>
              );
            })()}

            {/* Proof Lag */}
            {(() => {
              const c = stats.proof_lag === 0 ? "#22c55e" : stats.proof_lag < 3 ? "#f59e0b" : "#ef4444";
              return (
                <AkPanel className="p-5">
                  <div className="text-[10px] font-extrabold tracking-widest text-white/30 mb-1">PROOF LAG</div>
                  <div className="text-3xl font-extrabold" style={{ color: c }}>{stats.proof_lag}</div>
                  <div className="mt-1 text-[11px] text-white/30">sealed without receipt</div>
                  <MiniBar pct={stats.proof_score} color={c} />
                </AkPanel>
              );
            })()}
          </div>

          {/* â•â• SCORE BREAKDOWN (Section 8 â€” improved clarity) â•â•â•â•â•â•â•â•â•â• */}
          <div className="mb-8">
            <AkSectionHeader label="Score Breakdown" />
            <AkPanel className="mt-4 px-5 py-1">
              <BreakdownRow
                label="CLOSURE"    weight="30%"
                pts={stats.pts_closure}
                pct={stats.closure_rate}
                color={metricColor(stats.closure_rate, 80, 60)}
                rawLabel={`${stats.closure_rate}% sealed`}
              />
              <BreakdownRow
                label="BREACH"     weight="25%"
                pts={stats.pts_breach}
                pct={100 - stats.breach_rate}
                color={metricColor(stats.breach_rate, 0, 10, true)}
                rawLabel={`${stats.breach_rate}% overdue`}
              />
              <BreakdownRow
                label="COVERAGE"   weight="20%"
                pts={stats.pts_coverage}
                pct={stats.event_coverage}
                color={metricColor(stats.event_coverage, 90, 70)}
                rawLabel={`${stats.event_coverage}% of events`}
              />
              <BreakdownRow
                label="LATENCY"    weight="15%"
                pts={stats.pts_latency}
                pct={stats.latency_score}
                color={metricColor(stats.latency_score, 70, 50)}
                rawLabel={fmtHours(stats.avg_closure_hours)}
              />
              {stats.aging_penalty > 0 && (
                <BreakdownRow
                  label="AGING"     weight="−pts"
                  pts={-stats.aging_penalty}
                  pct={Math.max(0, 100 - stats.aging_penalty * 3)}
                  color="#f97316"
                  rawLabel={`${stats.open_obligations} open aging`}
                />
              )}
              <BreakdownRow
                label="PROOF"      weight="10%"
                pts={stats.pts_proof}
                pct={stats.proof_score}
                color={stats.proof_lag === 0 ? "#22c55e" : stats.proof_lag < 3 ? "#f59e0b" : "#ef4444"}
                rawLabel={`${stats.proof_lag} lag`}
              />
            </AkPanel>
          </div>

          {/* â•â• ENFORCEMENT DOMAINS (Section 17) â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
          <div className="mb-8">
            <AkSectionHeader label="Enforcement Domains" />
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              {stats.domains.map((d) => {
                const { color } = scoreGrade(d.integrity_score);
                const cColor = metricColor(d.closure_rate, 80, 60);
                const bColor = metricColor(d.breach_rate, 0, 10, true);
                return (
                  <AkPanel key={d.face} className="p-5">
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div>
                        <div className="text-[10px] font-extrabold tracking-widest text-white/30 mb-1">
                          {d.face.toUpperCase()}
                        </div>
                        <div className="text-sm font-extrabold text-white/90 leading-snug">{d.label}</div>
                      </div>
                      <MiniRing score={d.integrity_score} color={color} />
                    </div>

                    {d.total === 0 ? (
                      <div className="text-xs text-white/30 italic">No obligations yet</div>
                    ) : (
                      <>
                        <div className="grid grid-cols-2 gap-3 mb-3">
                          <div>
                            <div className="text-[10px] font-extrabold tracking-widest text-white/20 mb-0.5">CLOSURE</div>
                            <div className="text-lg font-extrabold" style={{ color: cColor }}>{d.closure_rate}%</div>
                            <div className="text-[11px] text-white/20">{d.sealed}/{d.total}</div>
                          </div>
                          <div>
                            <div className="text-[10px] font-extrabold tracking-widest text-white/20 mb-0.5">BREACH</div>
                            <div className="text-lg font-extrabold" style={{ color: bColor }}>{d.breach_rate}%</div>
                            <div className="text-[11px] text-white/20">{d.breach_count} active</div>
                          </div>
                        </div>

                        {/* Domain bar */}
                        <div className="h-1 w-full rounded-full bg-white/[0.06] overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-700"
                            style={{ width: `${d.integrity_score}%`, backgroundColor: color }} />
                        </div>
                      </>
                    )}
                  </AkPanel>
                );
              })}
            </div>
          </div>

          {/* Divider */}
          <div className="h-px bg-gradient-to-r from-white/8 via-transparent to-transparent mb-6" />

          {/* â•â• NAV â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
          <div className="flex flex-wrap gap-3">
            <Link href="/billing-ops"
              className="rounded-2xl bg-white px-4 py-2.5 text-sm font-semibold text-neutral-950 transition hover:scale-[1.01]">
              Billing Enforcement â†’
            </Link>
            <Link href="/receipts"
              className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-white/70 transition hover:bg-white/[0.08]">
              All Receipts â†’
            </Link>
            <Link href="/command"
              className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-white/70 transition hover:bg-white/[0.08]">
              Command â†’
            </Link>
          </div>
        </>
      )}
    </AkShell>
  );
}


