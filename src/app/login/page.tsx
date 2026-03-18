"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  CircleAlert,
  CircleCheckBig,
  CreditCard,
  Lock,
  LogIn,
  Mail,
  ReceiptText,
  RefreshCw,
  Shield,
  Sparkles,
} from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/supabaseBrowser";

type Confidence = "High" | "Medium" | "Low";

type SeverityGroup = "critical" | "at_risk" | "due_today" | "queue";

interface DomainStat {
  face: string;
  label: string;
  total: number;
  sealed: number;
  open: number;
  breach_count: number;
  closure_rate: number;
  breach_rate: number;
  integrity_score: number;
}

interface IntegrityStats {
  integrity_score: number;
  confidence: Confidence;
  closure_rate: number;
  breach_rate: number;
  event_coverage: number;
  events_awaiting: number;
  avg_closure_hours: number | null;
  latency_score: number;
  proof_lag: number;
  proof_score: number;
  pts_closure: number;
  pts_breach: number;
  pts_coverage: number;
  pts_latency: number;
  pts_proof: number;
  domains: DomainStat[];
  open_obligations: number;
  sealed_obligations: number;
  total_obligations: number;
  breach_count: number;
  stripe_events: number;
  covered_events: number;
  computed_at: string;
}

interface CommandRow {
  obligation_id: string;
  title: string;
  why: string | null;
  face: string | null;
  severity: SeverityGroup;
  due_at: string | null;
  created_at: string | null;
  age_hours: number | null;
  is_breach: boolean | null;
  economic_ref_type: string | null;
  economic_ref_id: string | null;
  location: string | null;
}

interface ReceiptRow {
  receipt_id: string;
  obligation_id: string;
  sealed_at: string;
  sealed_by: string | null;
  face: string | null;
  economic_ref_type: string | null;
  economic_ref_id: string | null;
  ledger_event_id: string | null;
}

class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const DOMAIN_ROUTES: Record<string, string | null> = {
  billing: "/billing-ops",
  advertising: "/advertising",
  dealership: null,
  washbay: null,
};

const FLOW_STEPS: Array<{ label: string; href?: string }> = [
  { label: "event" },
  { label: "obligation" },
  { label: "command", href: "/command" },
  { label: "closure" },
  { label: "receipt", href: "/receipts" },
  { label: "integrity signal", href: "/integrity" },
];

const SYSTEM_DOCTRINE = [
  {
    label: "Kernel authority",
    body: "The Kernel remains the sole mutation authority. Operators submit intent; the truth engine decides and records.",
  },
  {
    label: "Read membrane",
    body: "Live operator reads flow through authenticated route handlers instead of direct browser access to core truth.",
  },
  {
    label: "Receipt consequence",
    body: "Closure is not considered finished until a receipt exists that integrity and leadership can point back to later.",
  },
] as const;

function normalizeAppPath(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/command";
  }

  return value;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json().catch(() => null);

  if (!res.ok) {
    const message =
      json && typeof json === "object" && "error" in json && typeof json.error === "string"
        ? json.error
        : `HTTP ${res.status}`;
    throw new ApiError(res.status, message);
  }

  return json as T;
}

function scoreColor(score: number): string {
  if (score >= 90) return "#3ddc97";
  if (score >= 75) return "#63a8ff";
  if (score >= 60) return "#f6c453";
  return "#ff6b7a";
}

function gradeLabel(score: number): string {
  if (score >= 90) return "Governance clean";
  if (score >= 75) return "Within operating bounds";
  if (score >= 60) return "Needs review";
  return "At risk";
}

function confidenceTone(confidence: Confidence): string {
  if (confidence === "High") return "text-emerald-300 border-emerald-400/20 bg-emerald-400/10";
  if (confidence === "Medium") return "text-amber-200 border-amber-300/20 bg-amber-300/10";
  return "text-rose-200 border-rose-300/20 bg-rose-300/10";
}

function severityTone(severity: SeverityGroup): string {
  switch (severity) {
    case "critical":
      return "text-rose-200 border-rose-300/20 bg-rose-300/10";
    case "at_risk":
      return "text-amber-200 border-amber-300/20 bg-amber-300/10";
    case "due_today":
      return "text-sky-200 border-sky-300/20 bg-sky-300/10";
    default:
      return "text-slate-300 border-white/10 bg-white/5";
  }
}

function fmtFace(face: string | null | undefined): string {
  if (!face) return "Unknown";
  return face.replace(/[_-]/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function fmtAge(hours: number | null): string {
  if (hours == null) return "No age";
  if (hours < 1) return "< 1h old";
  if (hours < 24) return `${Math.round(hours)}h old`;
  return `${Math.round(hours / 24)}d old`;
}

function fmtHours(hours: number | null): string {
  if (hours == null) return "—";
  if (hours < 1) return "< 1h";
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = Math.floor(hours / 24);
  const remainder = Math.round(hours % 24);
  return remainder > 0 ? `${days}d ${remainder}h` : `${days}d`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "No timestamp";
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function sortCommands(rows: CommandRow[]): CommandRow[] {
  return [...rows].sort((a, b) => {
    const dueA = a.due_at ? new Date(a.due_at).getTime() : Number.MAX_SAFE_INTEGER;
    const dueB = b.due_at ? new Date(b.due_at).getTime() : Number.MAX_SAFE_INTEGER;
    if (dueA !== dueB) return dueA - dueB;

    const createdA = a.created_at ? new Date(a.created_at).getTime() : 0;
    const createdB = b.created_at ? new Date(b.created_at).getTime() : 0;
    return createdA - createdB;
  });
}

function ScoreDial({ score }: { score: number | null }) {
  const accent = score == null ? "rgba(255,255,255,0.18)" : scoreColor(score);
  const sweep = score == null ? 300 : Math.max(0, Math.min(360, Math.round((score / 100) * 360)));

  return (
    <div
      className="relative grid h-40 w-40 place-items-center rounded-full p-3 shadow-[0_0_80px_rgba(61,220,151,0.12)] sm:h-48 sm:w-48"
      style={{
        background: `conic-gradient(from 220deg, ${accent} 0deg ${sweep}deg, rgba(255,255,255,0.08) ${sweep}deg 360deg)`,
      }}
    >
      <div className="grid h-full w-full place-items-center rounded-full border border-white/10 bg-[#070b15]">
        <div className="text-center">
          <div className="text-5xl font-semibold tracking-tight sm:text-6xl">{score ?? "—"}</div>
          <div className="mt-2 text-[10px] uppercase tracking-[0.35em] text-slate-500">{score == null ? "Locked" : "Integrity"}</div>
        </div>
      </div>
    </div>
  );
}

function MetricTile({
  label,
  value,
  supporting,
}: {
  label: string;
  value: string;
  supporting: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="text-[10px] uppercase tracking-[0.24em] text-slate-500">{label}</div>
      <div className="mt-3 text-3xl font-semibold tracking-tight text-slate-50">{value}</div>
      <div className="mt-2 text-sm text-slate-400">{supporting}</div>
    </div>
  );
}

function SurfaceLink({
  eyebrow,
  title,
  body,
  href,
  locked,
}: {
  eyebrow: string;
  title: string;
  body: string;
  href?: string | null;
  locked?: boolean;
}) {
  const content = (
    <div className="group flex min-h-[11.5rem] flex-col justify-between rounded-3xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] p-6 transition hover:border-white/20 hover:bg-white/[0.06]">
      <div className="flex items-center justify-between gap-4">
        <div className="text-[10px] uppercase tracking-[0.24em] text-slate-500">{eyebrow}</div>
        <div className="text-sm text-slate-400">{locked ? "Not exposed yet" : "Open"}</div>
      </div>
      <div className="mt-3 text-2xl font-semibold tracking-tight text-slate-50">{title}</div>
      <p className="mt-3 max-w-md text-sm leading-6 text-slate-400">{body}</p>
      <div className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-slate-100">
        {locked ? "Held inside kernel" : "Enter sector"}
        <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
      </div>
    </div>
  );

  if (!href || locked) return content;
  return <Link href={href}>{content}</Link>;
}

export default function HomePage() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [integrity, setIntegrity] = useState<IntegrityStats | null>(null);
  const [command, setCommand] = useState<CommandRow[]>([]);
  const [receipts, setReceipts] = useState<ReceiptRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);
  const [authLocked, setAuthLocked] = useState(false);
  const [email, setEmail] = useState("");
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [nextPath, setNextPath] = useState("/command");
  const [authQueryError, setAuthQueryError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErrors([]);

    const results = await Promise.allSettled([
      fetchJson<IntegrityStats>("/api/integrity/stats"),
      fetchJson<{ rows: CommandRow[] }>("/api/command/feed"),
      fetchJson<{ rows: ReceiptRow[] }>("/api/receipts/feed"),
    ]);

    const nextErrors: string[] = [];
    let unauthorized = false;

    const [integrityRes, commandRes, receiptRes] = results;

    if (integrityRes.status === "fulfilled") {
      setIntegrity(integrityRes.value);
    } else {
      if (integrityRes.reason instanceof ApiError && integrityRes.reason.status === 401) {
        unauthorized = true;
      } else {
        nextErrors.push(`Integrity: ${integrityRes.reason instanceof Error ? integrityRes.reason.message : "Load failed"}`);
      }
      setIntegrity(null);
    }

    if (commandRes.status === "fulfilled") {
      setCommand(commandRes.value.rows ?? []);
    } else {
      if (commandRes.reason instanceof ApiError && commandRes.reason.status === 401) {
        unauthorized = true;
      } else {
        nextErrors.push(`Command: ${commandRes.reason instanceof Error ? commandRes.reason.message : "Load failed"}`);
      }
      setCommand([]);
    }

    if (receiptRes.status === "fulfilled") {
      setReceipts(receiptRes.value.rows ?? []);
    } else {
      if (receiptRes.reason instanceof ApiError && receiptRes.reason.status === 401) {
        unauthorized = true;
      } else {
        nextErrors.push(`Receipts: ${receiptRes.reason instanceof Error ? receiptRes.reason.message : "Load failed"}`);
      }
      setReceipts([]);
    }

    const hasLiveData = [integrityRes, commandRes, receiptRes].some((r) => r.status === "fulfilled");
    setAuthLocked(unauthorized && !hasLiveData);
    setErrors(nextErrors);
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setNextPath(normalizeAppPath(params.get("redirect") ?? params.get("next") ?? "/command"));
    setAuthQueryError(params.get("detail") ?? params.get("error"));
  }, []);

  async function handleMagicLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthSubmitting(true);
    setAuthError(null);
    setAuthMessage(null);

    try {
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: redirectTo,
        },
      });

      if (error) throw error;

      setAuthMessage("Check your email for the AutoKirk access link.");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Unable to send access link.");
    } finally {
      setAuthSubmitting(false);
    }
  }

  const queue = useMemo(() => sortCommands(command).slice(0, 5), [command]);
  const recentReceipts = useMemo(() => receipts.slice(0, 4), [receipts]);
  const accessSetupHref = `/subscribe?redirect=${encodeURIComponent(nextPath)}`;
  const domains = useMemo(() => {
    return [...(integrity?.domains ?? [])]
      .filter((domain) => domain.face !== "washbay")
      .sort((a, b) => {
        if (a.integrity_score !== b.integrity_score) return a.integrity_score - b.integrity_score;
        if (a.open !== b.open) return b.open - a.open;
        return a.label.localeCompare(b.label);
      });
  }, [integrity]);

  const pulseCopy = integrity
    ? integrity.open_obligations > 0
      ? `${integrity.open_obligations} live obligation${integrity.open_obligations === 1 ? "" : "s"} require attention.`
      : "No open obligations. The system is operating cleanly."
    : authLocked
      ? "Sign in to load governed state."
      : loading
        ? "Pulling system state..."
        : "Live state unavailable.";

  return (
    <div className="min-h-screen bg-[#050816] text-slate-100">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-[-10%] top-[8%] h-72 w-72 rounded-full bg-emerald-400/10 blur-3xl" />
        <div className="absolute right-[-5%] top-[20%] h-80 w-80 rounded-full bg-sky-400/10 blur-3xl" />
        <div className="absolute bottom-[-10%] left-[20%] h-72 w-72 rounded-full bg-fuchsia-400/5 blur-3xl" />
      </div>

      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#050816]/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div>
            <div className="text-[11px] uppercase tracking-[0.35em] text-slate-500">AutoKirk · Operator Entry</div>
            <div className="mt-1 text-sm text-slate-300">Sign in · Activate · Cross the auth membrane</div>
          </div>

          <div className="hidden items-center gap-2 md:flex">
            <Link href="/integrity" className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 transition hover:border-white/20 hover:bg-white/10">
              System
            </Link>
            <Link href="/command" className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 transition hover:border-white/20 hover:bg-white/10">
              Command
            </Link>
            <Link href="/receipts" className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 transition hover:border-white/20 hover:bg-white/10">
              Receipts
            </Link>
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 transition hover:border-white/20 hover:bg-white/10"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-[88rem] space-y-10 px-4 py-8 sm:px-6 lg:px-8 lg:space-y-12 lg:py-12">
        <section className="grid gap-8 2xl:grid-cols-[1.12fr_0.88fr]">
          <div className="rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-7 shadow-[0_30px_80px_rgba(0,0,0,0.35)] sm:p-9">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/15 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-200">
              <Sparkles className="h-3.5 w-3.5" />
              Operator entry
            </div>

            <h1 className="mt-6 max-w-4xl text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-6xl">
              Cross the auth membrane.
              <span className="block">Enter the receipt-backed operating layer.</span>
            </h1>

            <p className="mt-5 max-w-3xl text-base leading-7 text-slate-300 sm:text-lg">
              AutoKirk is where the operator reads governed state, sees the oldest open duty, and verifies that closure actually
              produced proof. Sign in to cross into the live machine, then move between command, receipts, integrity, and the
              active enforcement domains.
            </p>

            <div className="mt-10 flex flex-wrap gap-2 text-sm text-slate-300">
              {FLOW_STEPS.map((step, index) => (
                <div key={step.label} className="flex items-center gap-2">
                  {step.href ? (
                    <Link
                      href={step.href}
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-200 transition hover:border-white/20 hover:bg-white/10"
                    >
                      {step.label}
                    </Link>
                  ) : (
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-200">
                      {step.label}
                    </span>
                  )}
                  {index < FLOW_STEPS.length - 1 && <ArrowRight className="h-4 w-4 text-slate-500" />}
                </div>
              ))}
            </div>

            <div className="mt-10 flex flex-wrap gap-3">
              <Link
                href="/integrity"
                className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-medium text-slate-950 transition hover:translate-y-[-1px]"
              >
                <Shield className="h-4 w-4" />
                Open system state
              </Link>
              <Link
                href="/command"
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-medium text-white transition hover:border-white/20 hover:bg-white/10"
              >
                <Activity className="h-4 w-4" />
                Go to command
              </Link>
              <Link
                href="/receipts"
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-medium text-white transition hover:border-white/20 hover:bg-white/10"
              >
                <ReceiptText className="h-4 w-4" />
                View receipts
              </Link>
              <Link
                href="#operator-sign-in"
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-transparent px-5 py-3 text-sm font-medium text-slate-300 transition hover:border-white/20 hover:bg-white/5"
              >
                <LogIn className="h-4 w-4" />
                Sign in
              </Link>
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              {SYSTEM_DOCTRINE.map((item) => (
                <div key={item.label} className="rounded-[1.5rem] border border-white/10 bg-[#08101a] p-5">
                  <div className="text-[10px] uppercase tracking-[0.24em] text-slate-500">{item.label}</div>
                  <div className="mt-3 text-sm leading-6 text-slate-300">{item.body}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-6">
            <div className="rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(7,11,21,0.92),rgba(7,11,21,0.72))] p-7 shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
              <div className="flex flex-wrap items-start justify-between gap-6">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.28em] text-slate-500">Integrity signal</div>
                  <div className="mt-3 text-3xl font-semibold tracking-tight text-white">
                    {integrity ? gradeLabel(integrity.integrity_score) : authLocked ? "Authentication required" : "Loading state"}
                  </div>
                  <p className="mt-3 max-w-sm text-sm leading-6 text-slate-400">{pulseCopy}</p>
                  {integrity && (
                    <div
                      className={`mt-4 inline-flex items-center rounded-full border px-3 py-1 text-xs ${confidenceTone(integrity.confidence)}`}
                    >
                      Confidence: {integrity.confidence}
                    </div>
                  )}
                </div>

                <div className="mx-auto sm:mx-0">
                  <ScoreDial score={integrity ? integrity.integrity_score : null} />
                </div>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <MetricTile
                  label="Open duty"
                  value={integrity ? String(integrity.open_obligations) : authLocked ? "Locked" : "—"}
                  supporting={integrity ? "active obligations in queue" : "authenticate to load"}
                />
                <MetricTile
                  label="Proof lag"
                  value={integrity ? String(integrity.proof_lag) : authLocked ? "Locked" : "—"}
                  supporting={integrity ? "sealed without receipt" : "proof surface not loaded"}
                />
                <MetricTile
                  label="Closure latency"
                  value={integrity ? fmtHours(integrity.avg_closure_hours) : authLocked ? "Locked" : "—"}
                  supporting={integrity ? "average time to close" : "live timing unavailable"}
                />
              </div>
            </div>

            {authLocked ? (
              <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
                <div className="flex flex-col gap-6">
                  <div className="flex items-start gap-3">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                      <Lock className="h-5 w-5 text-slate-200" />
                    </div>
                    <div>
                      <div className="text-lg font-medium text-white">Sign in or activate operator access.</div>
                      <p className="mt-2 max-w-lg text-sm leading-6 text-slate-400">
                        Sign in to open the governed read surfaces. If this operator still needs paid access, continue into the
                        activation path after the identity is established.
                      </p>
                      {authQueryError ? (
                        <div className="mt-3 rounded-2xl border border-rose-300/15 bg-rose-300/10 px-4 py-3 text-sm text-rose-100">
                          {authQueryError}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
                    <form id="operator-sign-in" onSubmit={handleMagicLink} className="rounded-[24px] border border-white/10 bg-[#080c17] p-5">
                      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-slate-500">
                        <Mail className="h-3.5 w-3.5" />
                        Operator sign-in
                      </div>
                      <div className="mt-3 text-xl font-semibold text-white">Send a secure access link</div>
                      <p className="mt-2 text-sm leading-6 text-slate-400">
                        Use the work email that owns this operator seat. AutoKirk will return you to the live console after sign-in.
                      </p>
                      <label className="mt-4 block">
                        <span className="sr-only">Email</span>
                        <input
                          type="email"
                          value={email}
                          onChange={(event) => setEmail(event.target.value)}
                          placeholder="you@company.com"
                          autoComplete="email"
                          className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-white/20 focus:bg-white/10"
                          required
                        />
                      </label>
                      {authError ? (
                        <div className="mt-3 rounded-2xl border border-rose-300/15 bg-rose-300/10 px-4 py-3 text-sm text-rose-100">
                          {authError}
                        </div>
                      ) : null}
                      {authMessage ? (
                        <div className="mt-3 rounded-2xl border border-emerald-300/15 bg-emerald-300/10 px-4 py-3 text-sm text-emerald-100">
                          {authMessage}
                        </div>
                      ) : null}
                      <button
                        type="submit"
                        disabled={authSubmitting}
                        className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-medium text-slate-950 transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <LogIn className="h-4 w-4" />
                        {authSubmitting ? "Sending access link..." : "Send access link"}
                      </button>
                    </form>

                    <div className="rounded-[24px] border border-[#f2c47e]/20 bg-[#f2c47e]/10 p-5">
                      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-[#f4d3a4]">
                        <CreditCard className="h-3.5 w-3.5" />
                        Access setup
                      </div>
                      <div className="mt-3 text-xl font-semibold text-white">Set up paid access</div>
                      <p className="mt-2 text-sm leading-6 text-slate-200/80">
                        Stripe activation comes after sign-in so the subscription binds to the right operator account.
                      </p>
                      <Link
                        href={accessSetupHref}
                        className="mt-4 inline-flex items-center gap-2 rounded-full border border-[#f2c47e]/30 bg-[#f2c47e]/16 px-5 py-3 text-sm font-medium text-[#fff2d6] transition hover:border-[#f2c47e]/45 hover:bg-[#f2c47e]/22"
                      >
                        <CreditCard className="h-4 w-4" />
                        Open access setup
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
                  <div className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Live command pressure</div>
                  <div className="mt-3 text-3xl font-semibold tracking-tight text-white">{command.length}</div>
                  <div className="mt-1 text-sm text-slate-400">items currently requiring operator action</div>
                  <div className="mt-4 flex items-center gap-2 text-sm text-slate-300">
                    {command.length === 0 ? (
                      <>
                        <CircleCheckBig className="h-4 w-4 text-emerald-300" />
                        All clear
                      </>
                    ) : (
                      <>
                        <CircleAlert className="h-4 w-4 text-amber-300" />
                        Queue has live pressure
                      </>
                    )}
                  </div>
                </div>
                <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
                  <div className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Recent proof</div>
                  <div className="mt-3 text-3xl font-semibold tracking-tight text-white">{receipts.length}</div>
                  <div className="mt-1 text-sm text-slate-400">receipts currently available in the proof layer</div>
                  <div className="mt-4 text-sm text-slate-300">{integrity ? fmtDate(integrity.computed_at) : "Waiting for live state"}</div>
                </div>
              </div>
            )}
          </div>
        </section>

        {errors.length > 0 && (
          <section className="rounded-3xl border border-rose-300/15 bg-rose-300/10 p-5 text-sm text-rose-100">
            <div className="font-medium">Some live surfaces failed to load.</div>
            <ul className="mt-2 space-y-1 text-rose-100/80">
              {errors.map((error) => (
                <li key={error}>• {error}</li>
              ))}
            </ul>
          </section>
        )}

        <section className="grid gap-6 2xl:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-[32px] border border-white/10 bg-white/[0.03] p-7">
            <div className="flex items-end justify-between gap-4">
              <div>
                <div className="text-[10px] uppercase tracking-[0.28em] text-slate-500">Command preview</div>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white">Resolve the oldest duty first.</h2>
              </div>
              <Link href="/command" className="text-sm text-slate-300 transition hover:text-white">
                Open queue →
              </Link>
            </div>

            <div className="mt-5 space-y-3">
              {authLocked && (
                <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-5">
                  <div className="text-sm text-slate-300">Sign in above to open the live queue.</div>
                </div>
              )}

              {!authLocked && queue.length === 0 && (
                <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/10 p-5">
                  <div className="flex items-center gap-2 text-emerald-100">
                    <CircleCheckBig className="h-4 w-4" />
                    <span className="font-medium">All clear</span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-emerald-50/80">
                    No open obligations are visible right now. When pressure returns, it should appear here before the operator
                    goes anywhere else.
                  </p>
                </div>
              )}

              {!authLocked &&
                queue.map((row) => (
                  <div key={row.obligation_id} className="rounded-2xl border border-white/10 bg-[#080c17] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] uppercase tracking-[0.2em] text-slate-400">
                            {fmtFace(row.face)}
                          </span>
                          <span className={`rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-[0.2em] ${severityTone(row.severity)}`}>
                            {row.severity.replace(/_/g, " ")}
                          </span>
                          {row.is_breach ? (
                            <span className="rounded-full border border-rose-300/15 bg-rose-300/10 px-2.5 py-1 text-[11px] uppercase tracking-[0.2em] text-rose-100">
                              breach
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-3 text-lg font-medium text-white">{row.title}</div>
                        {row.why ? <div className="mt-1 text-sm text-slate-400">{row.why}</div> : null}
                      </div>
                      <div className="text-right text-sm text-slate-400">
                        <div>{fmtAge(row.age_hours)}</div>
                        <div className="mt-1">{fmtDate(row.due_at ?? row.created_at)}</div>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>

          <div className="rounded-[32px] border border-white/10 bg-white/[0.03] p-7">
            <div className="flex items-end justify-between gap-4">
              <div>
                <div className="text-[10px] uppercase tracking-[0.28em] text-slate-500">Proof surface</div>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white">Institutional memory, not activity feed.</h2>
              </div>
              <Link href="/receipts" className="text-sm text-slate-300 transition hover:text-white">
                Open receipts →
              </Link>
            </div>

            <div className="mt-5 space-y-3">
              {authLocked && (
                <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-5">
                  <div className="text-sm text-slate-300">Sign in above to open the proof record.</div>
                </div>
              )}

              {!authLocked && recentReceipts.length === 0 && (
                <div className="rounded-2xl border border-white/10 bg-[#080c17] p-5 text-sm text-slate-400">
                  No receipts are visible yet.
                </div>
              )}

              {!authLocked &&
                recentReceipts.map((receipt) => (
                  <div key={receipt.receipt_id} className="rounded-2xl border border-white/10 bg-[#080c17] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-lg font-medium text-white">{receipt.receipt_id.slice(0, 18)}…</div>
                        <div className="mt-1 text-sm text-slate-400">
                          {fmtFace(receipt.face)} · {fmtDate(receipt.sealed_at)}
                        </div>
                        <div className="mt-3 text-xs uppercase tracking-[0.18em] text-slate-500">
                          obligation {receipt.obligation_id.slice(0, 16)}…
                        </div>
                      </div>
                      <div className="rounded-full border border-emerald-400/15 bg-emerald-400/10 px-3 py-1 text-xs uppercase tracking-[0.18em] text-emerald-100">
                        sealed
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </section>

        <section className="grid gap-6 2xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[32px] border border-white/10 bg-white/[0.03] p-7">
            <div className="flex items-end justify-between gap-4">
              <div>
                <div className="text-[10px] uppercase tracking-[0.28em] text-slate-500">Enforcement domains</div>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white">Domains ranked by real pressure.</h2>
              </div>
              <Link href="/integrity" className="text-sm text-slate-300 transition hover:text-white">
                Full system state →
              </Link>
            </div>

            <div className="mt-5 grid gap-3">
              {authLocked && (
                <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-5">
                  <div className="text-sm text-slate-300">Sign in above to rank live sectors by pressure.</div>
                </div>
              )}

              {!authLocked && domains.length === 0 && (
                <div className="rounded-2xl border border-white/10 bg-[#080c17] p-5 text-sm text-slate-400">
                  No domain stats are available yet.
                </div>
              )}

              {!authLocked &&
                domains.map((domain) => {
                  const route = DOMAIN_ROUTES[domain.face] ?? null;
                  const accent = scoreColor(domain.integrity_score);
                  const content = (
                    <div className="rounded-2xl border border-white/10 bg-[#080c17] p-4 transition hover:border-white/20 hover:bg-white/[0.05]">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Enforcement domain</div>
                          <div className="mt-2 text-lg font-medium text-white">{domain.label}</div>
                          <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-400">
                            <span>{domain.open} open</span>
                            <span>{domain.sealed} sealed</span>
                            <span>{domain.breach_count} breach</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-3xl font-semibold tracking-tight" style={{ color: accent }}>
                            {domain.integrity_score}
                          </div>
                          <div className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-500">integrity</div>
                        </div>
                      </div>
                      <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/5">
                        <div className="h-full rounded-full" style={{ width: `${domain.integrity_score}%`, backgroundColor: accent }} />
                      </div>
                    </div>
                  );

                  return route ? <Link key={domain.face} href={route}>{content}</Link> : <div key={domain.face}>{content}</div>;
                })}
            </div>
          </div>

          <div className="rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] p-7">
            <div className="max-w-md">
              <div className="text-[10px] uppercase tracking-[0.28em] text-slate-500">Next surfaces</div>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white">Move through the operator stack in a cleaner order.</h2>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                The entry page should lead operators into live state, action, proof, and access setup without forcing them to hunt for the next surface.
              </p>
            </div>

            <div className="mt-6 space-y-4">
              <SurfaceLink
                eyebrow="System"
                title="System state"
                body="Open the machine's current condition. Integrity tells the operator what is clean, what is degrading, and what needs attention."
                href="/integrity"
              />
              <SurfaceLink
                eyebrow="Command"
                title="Open queue"
                body="Oldest duty first. This is where the operator sees what still needs action and who needs to move it."
                href="/command"
              />
              <SurfaceLink
                eyebrow="Proof"
                title="Receipt record"
                body="Every sealed obligation leaves a record. Receipts turn finished work into proof the business can point back to."
                href="/receipts"
              />
              <SurfaceLink
                eyebrow="Access"
                title="Paid access setup"
                body="Operator identity comes first. Then the page continues into Stripe checkout with the correct account attached."
                href="/subscribe"
              />
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
