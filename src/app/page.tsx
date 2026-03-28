import Link from "next/link";
import { Activity, ArrowRight, Gauge, Lock, ReceiptText, Shield } from "lucide-react";

const FLOW = [
  { label: "Stripe event" },
  { label: "obligation" },
  { label: "command", href: "/command" },
  { label: "closure" },
  { label: "receipt", href: "/command/receipts" },
  { label: "integrity signal", href: "/command/integrity" },
];

const SURFACES = [
  {
    href: "/command",
    Icon: Activity,
    eyebrow: "Action Rail",
    title: "Command",
    body: "The governed operator queue. Resolve the oldest open duty first, then work through at-risk and due-today obligations. Every action produces a receipt.",
  },
  {
    href: "/command/integrity",
    Icon: Gauge,
    eyebrow: "Governance Score",
    title: "Integrity",
    body: "A composite score derived from closure rate, breach rate, event coverage, obligation latency, and proof lag. The kernel keeps this honest.",
  },
  {
    href: "/command/receipts",
    Icon: ReceiptText,
    eyebrow: "Proof Layer",
    title: "Receipts",
    body: "Closure is not finished until a receipt exists. Every seal produces a hash-chained ledger event and a receipt operators can always point back to.",
  },
  {
    href: "/login",
    Icon: Lock,
    eyebrow: "Operator Entry",
    title: "Sign in",
    body: "Cross the auth membrane. Magic link authentication — use the work email that owns this operator seat.",
  },
];

const KERNEL_DOCTRINE = [
  {
    label: "Kernel authority",
    body: "The Kernel is the sole mutation authority. Operators submit intent; the truth engine decides and records.",
  },
  {
    label: "Idempotent ingest",
    body: "Stripe events are ingested idempotently. Duplicate events do not produce duplicate obligations or double-count receipts.",
  },
  {
    label: "Hash-chained ledger",
    body: "Every ledger event and receipt carries a SHA-256 hash chaining from the previous record. Nothing can be silently deleted or reordered.",
  },
  {
    label: "Receipt consequence",
    body: "Closure is not finished until a receipt exists. Integrity and leadership can always point back to cryptographic proof.",
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#071018] text-slate-100">
      {/* Ambient background */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-[-14%] top-[-8%] h-[26rem] w-[26rem] rounded-full bg-cyan-300/10 blur-3xl" />
        <div className="absolute right-[-10%] top-[8%] h-[28rem] w-[28rem] rounded-full bg-amber-300/10 blur-3xl" />
        <div className="absolute bottom-[-14%] left-[16%] h-[24rem] w-[24rem] rounded-full bg-emerald-300/8 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.7) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.7) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#071018]/88 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl border border-white/10 bg-white/[0.04] text-sm font-semibold text-white shadow-[0_12px_30px_rgba(0,0,0,0.22)]">
              AK
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.34em] text-slate-500">AutoKirk</div>
              <div className="text-sm text-slate-300">Revenue integrity operating layer</div>
            </div>
          </div>

          <nav className="hidden items-center gap-2 md:flex">
            <Link
              href="/command"
              className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-slate-300 transition hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
            >
              Command
            </Link>
            <Link
              href="/command/integrity"
              className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-slate-300 transition hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
            >
              Integrity
            </Link>
            <Link
              href="/command/receipts"
              className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-slate-300 transition hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
            >
              Receipts
            </Link>
            <Link
              href="/login"
              className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-sm text-cyan-100 transition hover:border-cyan-300/30 hover:bg-cyan-300/15"
            >
              Sign in
            </Link>
          </nav>

          {/* Mobile nav */}
          <div className="flex items-center gap-2 md:hidden">
            <Link
              href="/login"
              className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-sm text-cyan-100"
            >
              Sign in
            </Link>
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-[88rem] space-y-16 px-4 py-12 sm:px-6 lg:px-8 lg:py-20">
        {/* Hero */}
        <section className="rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-8 shadow-[0_28px_90px_rgba(0,0,0,0.3)] sm:p-12">
          <div className="text-[10px] uppercase tracking-[0.34em] text-slate-500">
            Stripe billing wedge · Kernel governed
          </div>
          <h1 className="mt-4 text-5xl font-semibold tracking-tight text-white sm:text-6xl lg:text-7xl">
            AutoKirk
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-7 text-slate-300 sm:text-xl">
            A receipt-backed revenue integrity operating layer. Every Stripe billing event produces a
            governed obligation. Every resolved obligation produces a cryptographic receipt. Integrity
            is a live score, not a guess.
          </p>

          {/* Flow rail */}
          <div className="mt-10 flex flex-wrap items-center gap-2 text-sm">
            {FLOW.map((step, i) => (
              <div key={step.label} className="flex items-center gap-2">
                {step.href ? (
                  <Link
                    href={step.href}
                    className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-sm text-slate-200 transition hover:border-white/20 hover:bg-white/[0.08]"
                  >
                    {step.label}
                  </Link>
                ) : (
                  <span className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5 text-sm text-slate-500">
                    {step.label}
                  </span>
                )}
                {i < FLOW.length - 1 && (
                  <ArrowRight className="h-3.5 w-3.5 text-slate-600" />
                )}
              </div>
            ))}
          </div>

          {/* CTAs */}
          <div className="mt-10 flex flex-wrap gap-3">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-medium text-slate-950 transition hover:bg-white/90"
            >
              <Lock className="h-4 w-4" />
              Sign in
            </Link>
            <Link
              href="/command"
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-5 py-3 text-sm font-medium text-white transition hover:border-white/20 hover:bg-white/[0.08]"
            >
              <Activity className="h-4 w-4" />
              Command
            </Link>
            <Link
              href="/command/integrity"
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-5 py-3 text-sm font-medium text-white transition hover:border-white/20 hover:bg-white/[0.08]"
            >
              <Shield className="h-4 w-4" />
              Integrity
            </Link>
          </div>
        </section>

        {/* Operator surfaces */}
        <section>
          <div className="mb-6 text-[10px] uppercase tracking-[0.34em] text-slate-500">
            Operator surfaces
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {SURFACES.map(({ href, Icon, eyebrow, title, body }) => (
              <Link
                key={href}
                href={href}
                className="group flex flex-col justify-between rounded-[1.6rem] border border-white/10 bg-white/[0.02] p-6 transition hover:border-white/20 hover:bg-white/[0.05]"
              >
                <div>
                  <div className="flex items-center justify-between gap-4">
                    <div className="text-[10px] uppercase tracking-[0.24em] text-slate-500">
                      {eyebrow}
                    </div>
                    <Icon className="h-4 w-4 text-white/20 transition group-hover:text-white/40" />
                  </div>
                  <div className="mt-3 text-xl font-semibold text-white">{title}</div>
                  <p className="mt-3 text-sm leading-6 text-slate-400">{body}</p>
                </div>
                <div className="mt-6 inline-flex items-center gap-1.5 text-sm text-slate-400 transition group-hover:text-white">
                  Open{" "}
                  <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Kernel doctrine */}
        <section>
          <div className="mb-6 text-[10px] uppercase tracking-[0.34em] text-slate-500">
            Kernel doctrine
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {KERNEL_DOCTRINE.map(({ label, body }) => (
              <div
                key={label}
                className="rounded-[1.6rem] border border-white/10 bg-white/[0.02] p-6"
              >
                <div className="text-[10px] uppercase tracking-[0.24em] text-slate-500">{label}</div>
                <p className="mt-3 text-sm leading-6 text-slate-300">{body}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
