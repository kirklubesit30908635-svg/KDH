'use client'

import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, ShieldCheck, Workflow, Receipt, Activity, PlugZap, LineChart, CheckCircle2, AlertCircle, Link2 } from "lucide-react";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0 },
};

export default function AutoKirkHomepage() {
  const [integrity, setIntegrity] = useState<number | null>(null);
  const [closureRate, setClosureRate] = useState<number | null>(null);
  const [proofLag, setProofLag] = useState<string | null>(null);
  const [openActions, setOpenActions] = useState<number | null>(null);
  const [recentReceipt, setRecentReceipt] = useState<any | null>(null);

  useEffect(() => {
    async function loadSystemState() {
      try {
        const res = await fetch('/api/system-state');
        if (!res.ok) return;
        const data = await res.json();
        setIntegrity(data.integrity);
        setClosureRate(data.closure_rate);
        setProofLag(data.proof_lag);
        setOpenActions(data.open_actions);
        setRecentReceipt(data.recent_receipt);
      } catch (err) {
        console.error('system state fetch failed', err);
      }
    }
    loadSystemState();
  }, []);

  const architectureCards = [
    {
      eyebrow: "Event ledger",
      title: "Operational reality becomes immutable.",
      body: "Critical events are recorded as durable system truth so execution can be measured against what actually happened.",
      icon: Activity,
    },
    {
      eyebrow: "Requirement engine",
      title: "Work that matters becomes enforceable.",
      body: "The system derives required actions from live events, preventing important operational steps from disappearing into assumption.",
      icon: Workflow,
    },
    {
      eyebrow: "Receipt system",
      title: "Completion leaves permanent proof.",
      body: "Verified closures emit receipts that show what happened, who completed it, when it occurred, and whether proof satisfied the rule.",
      icon: Receipt,
    },
  ];

  const connectors = [
    { name: "Stripe", state: "Connected", note: "Payments, payout-adjacent events, economic anchors" },
    { name: "Operator Console", state: "Live", note: "Action, closure, and exception handling surfaces" },
    { name: "Operational System", state: "Connected", note: "Customer‑specific workflow system feeding operational events" },
    { name: "Founder Control", state: "Active", note: "Integrity, receipts, command surfaces, billing ops" },
  ];

  const painPoints = [
    "Work is verbally confirmed but never actually proven.",
    "Revenue leaks through missing follow-through and late discovery.",
    "Managers see lagging dashboards instead of live operational truth.",
    "Teams clean up exceptions manually because systems cannot enforce reality.",
  ];

  const systemFlow = [
    "Event captured", "Requirement issued", "Action required",
    "Closure submitted", "Receipt emitted", "Integrity updated",
  ];

  const integritySignals = [
    ["Closure Rate", "30%", "How often required work reaches verified completion."],
    ["Breach Rate", "25%", "How often obligations fail, expire, or break."],
    ["Event Coverage", "20%", "Whether the business is capturing the reality that matters."],
    ["Requirement Latency", "15%", "How quickly important work is acknowledged and resolved."],
    ["Proof Lag", "10%", "How long verification takes after execution is claimed."],
  ];

  const surfaceCards = [
    { label: "Action", title: "What must happen next", body: "Operators see the exact work that requires proof before the business can safely move forward." },
    { label: "Closure", title: "What was completed", body: "Teams submit completion with evidence so operational claims become verifiable rather than assumed." },
    { label: "Receipt", title: "What the system can certify", body: "The kernel emits an immutable proof artifact once the requirement has been properly satisfied." },
    { label: "Integrity", title: "What leadership should trust", body: "Founders see whether the business is operating correctly, not just whether work was reported as done." },
  ];

  const trustSignals = [
    "Append-only operational proof",
    "Deterministic enforcement kernel",
    "Operator-simple action surfaces",
    "Founder-grade control visibility",
  ];

  const comparison = {
    without: ["Service performed", "Closure never submitted", "Payout processed anyway", "Revenue leakage discovered later"],
    with: ["Event recorded", "Requirement issued", "Action surfaced", "Receipt verified", "Integrity preserved"],
  };

  const timeline = [
    { label: "Event captured", body: "Stripe, operator, or customer system activity enters the kernel through governed intake." },
    { label: "Requirement created", body: "The system determines what must happen before the business can trust the outcome." },
    { label: "Action worked", body: "An operator or system process resolves the required work and submits closure evidence." },
    { label: "Receipt emitted", body: "The kernel seals the result into an append-only proof artifact tied to the obligation." },
    { label: "Integrity updated", body: "Leadership sees the operating truth shift immediately across the live control surface." },
  ];

  const routes = [
    { name: "Integrity", href: "/integrity" },
    { name: "Action", href: "/command" },
    { name: "Billing Ops", href: "/billing-ops" },
    { name: "Receipts", href: "/receipts" },
    { name: "Login", href: "/login" },
  ];

  return (
    <div className="min-h-screen overflow-x-hidden bg-neutral-950 text-white selection:bg-white selection:text-neutral-950">
      <div className="absolute inset-x-0 top-0 -z-10 h-[44rem] bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.14),transparent_40%)]" />
      <div className="absolute left-1/2 top-[28rem] -z-10 h-[30rem] w-[30rem] -translate-x-1/2 rounded-full bg-white/5 blur-3xl" />

      <header className="sticky top-0 z-50 border-b border-white/10 bg-neutral-950/75 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 lg:px-8">
          <a href="/" className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/15 bg-white/5 text-sm font-semibold tracking-[0.22em] shadow-[0_12px_40px_rgba(255,255,255,0.08)]">
              AK
            </div>
            <div>
              <div className="text-sm font-semibold tracking-[0.26em] text-white/80">AUTOKIRK</div>
              <div className="text-xs text-white/45">Revenue Integrity Operating Layer</div>
            </div>
          </a>
          <nav className="hidden items-center gap-8 text-sm text-white/60 md:flex">
            <a href="#why" className="transition hover:text-white">Why</a>
            <a href="#system" className="transition hover:text-white">System</a>
            <a href="#connect" className="transition hover:text-white">Connect</a>
            <a href="#integrity" className="transition hover:text-white">Integrity</a>
            <a href="#surfaces" className="transition hover:text-white">Surfaces</a>
          </nav>
          <div className="flex items-center gap-3">
            <a href="/login" className="hidden rounded-2xl border border-white/15 px-4 py-2 text-sm text-white/80 transition hover:border-white/30 hover:bg-white/5 hover:text-white md:inline-flex">
              Open System
            </a>
            <a href="#connect" className="rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-neutral-950 transition hover:scale-[1.02]">
              Connect Operations
            </a>
          </div>
        </div>
      </header>

      <main>
        {/* HERO */}
        <section className="relative overflow-hidden">
          <div className="mx-auto grid max-w-7xl gap-14 px-6 py-20 lg:grid-cols-[1.04fr_0.96fr] lg:px-8 lg:py-28">
            <motion.div className="relative z-10" initial="hidden" animate="visible" variants={fadeUp} transition={{ duration: 0.55 }}>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.22em] text-white/70">
                Kernel-first operational enforcement
              </div>
              <h1 className="mt-7 max-w-5xl text-5xl font-semibold leading-[0.92] tracking-tight text-white sm:text-6xl lg:text-7xl">
                Know with proof that critical work actually happened.
                <span className="mt-3 block text-white/58">
                  AutoKirk connects live operations to verified execution, enforceable requirements, and measurable integrity.
                </span>
              </h1>
              <p className="mt-8 max-w-2xl text-lg leading-8 text-white/72 sm:text-xl">
                The system is already real and running. AutoKirk provides the connective layer that captures operational events, derives required work, verifies completion with receipts, and exposes integrity before revenue disappears into assumption.
              </p>
              <div className="mt-10 flex flex-col gap-4 sm:flex-row">
                <a href="#connect" className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-6 py-3 text-sm font-semibold text-neutral-950 shadow-[0_18px_60px_rgba(255,255,255,0.14)] transition hover:scale-[1.02]">
                  Connect live operation <ArrowRight className="h-4 w-4" />
                </a>
                <a href="/login" className="inline-flex items-center justify-center rounded-2xl border border-white/15 px-6 py-3 text-sm font-semibold text-white/85 transition hover:border-white/30 hover:bg-white/5">
                  Open founder control
                </a>
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                {routes.map((route) => (
                  <a key={route.href} href={route.href} className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs text-white/70 transition hover:border-white/20 hover:text-white">
                    {route.name}
                  </a>
                ))}
              </div>
              <div className="mt-14 grid gap-4 md:grid-cols-3">
                {architectureCards.map((item, index) => {
                  const Icon = item.icon;
                  return (
                    <motion.div key={item.title} initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.4 }} transition={{ duration: 0.4, delay: index * 0.07 }} className="rounded-[1.75rem] border border-white/10 bg-white/[0.035] p-5 shadow-2xl shadow-black/25">
                      <div className="flex items-center justify-between">
                        <div className="text-xs uppercase tracking-[0.2em] text-white/38">{item.eyebrow}</div>
                        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2 text-white/70"><Icon className="h-4 w-4" /></div>
                      </div>
                      <div className="mt-3 text-lg font-semibold text-white">{item.title}</div>
                      <p className="mt-3 text-sm leading-6 text-white/60">{item.body}</p>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>

            <motion.div className="relative z-10" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, delay: 0.12 }}>
              <div className="rounded-[2.25rem] border border-white/10 bg-white/[0.035] p-5 shadow-[0_24px_100px_rgba(0,0,0,0.5)]">
                <div className="rounded-[1.75rem] border border-white/10 bg-neutral-900 p-5">
                  <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-5">
                    <div>
                      <div className="text-xs uppercase tracking-[0.22em] text-white/45">Live operating signal</div>
                      <div className="mt-2 text-4xl font-semibold tracking-tight">Integrity: {integrity ?? "--"}</div>
                      <p className="mt-2 text-sm text-white/52">
                        {integrity !== null ? "Live kernel-backed operating state loaded from the running system." : "Waiting for live kernel state from the running system."}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-300">Healthy / actionable</div>
                  </div>
                  <div className="mt-5 grid gap-4">
                    <motion.div initial={{ opacity: 0, scale: 0.98 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-white/60">Closure Rate</span>
                        <span className="font-medium text-white">{closureRate !== null ? `${closureRate}%` : "--"}</span>
                      </div>
                      <div className="mt-3 h-2 rounded-full bg-white/10">
                        <motion.div initial={{ width: 0 }} whileInView={{ width: closureRate !== null ? `${Math.max(0, Math.min(100, closureRate))}%` : "0%" }} viewport={{ once: true }} transition={{ duration: 0.9, ease: "easeOut" }} className="h-2 rounded-full bg-white" />
                      </div>
                    </motion.div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                        <div className="text-sm text-white/60">Proof Lag</div>
                        <div className="mt-2 text-2xl font-semibold">{proofLag ?? "--"}</div>
                        <div className="mt-1 text-xs text-white/45">Median verification delay</div>
                      </div>
                      <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                        <div className="text-sm text-white/60">Open actions</div>
                        <div className="mt-2 text-2xl font-semibold">{openActions !== null ? String(openActions).padStart(2, "0") : "--"}</div>
                        <div className="mt-1 text-xs text-white/45">Awaiting closure or proof</div>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm text-white/60">Action Required</div>
                          <div className="mt-2 text-lg font-medium text-white">Verify missed service closure before payout window</div>
                        </div>
                        <div className="rounded-xl border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">High risk</div>
                      </div>
                      <div className="mt-4 flex items-center justify-between text-xs text-white/45">
                        <span>Assigned to operator</span><span>Receipt required</span>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                      <div className="text-sm text-white/60">Recent verified receipt</div>
                      <div className="mt-3 flex items-center justify-between gap-4 rounded-2xl border border-white/8 bg-neutral-950/80 px-4 py-3">
                        <div>
                          <div className="text-sm font-medium text-white">{recentReceipt?.title ?? "Recent receipt will appear here"}</div>
                          <div className="mt-1 text-xs text-white/45">{recentReceipt ? `${recentReceipt.operator ?? "operator"} · ${recentReceipt.timestamp ?? "timestamp"}` : "Waiting for sealed proof from the live system"}</div>
                        </div>
                        <div className="inline-flex items-center gap-1 text-xs text-emerald-300"><CheckCircle2 className="h-4 w-4" />Verified</div>
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      {routes.slice(0, 3).map((route) => (
                        <a key={route.href} href={route.href} className="rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-white/75 transition hover:border-white/20 hover:text-white">{route.name}</a>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* CONNECT */}
        <section id="connect" className="border-y border-white/10 bg-white/[0.02]">
          <div className="mx-auto max-w-7xl px-6 py-20 lg:px-8">
            <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
              <div>
                <div className="text-sm font-semibold uppercase tracking-[0.22em] text-white/45">Connecting pieces</div>
                <h2 className="mt-3 max-w-4xl text-3xl font-semibold tracking-tight text-white sm:text-5xl">Connect AutoKirk to a live operation without replacing the operation.</h2>
                <p className="mt-6 max-w-2xl text-lg leading-8 text-white/68">Existing systems keep doing the work they already do. AutoKirk attaches to revenue-critical workflows, watches the real events, binds them to economic anchors, and becomes the proof and enforcement layer around the operation.</p>
                <div className="mt-8 rounded-[1.8rem] border border-white/10 bg-neutral-950/70 p-6">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-xl border border-white/10 bg-white/[0.03] p-2 text-white/70"><Link2 className="h-4 w-4" /></div>
                    <div>
                      <div className="text-sm font-medium text-white">Connection model</div>
                      <p className="mt-2 text-sm leading-7 text-white/60">Source systems emit activity. AutoKirk normalizes that activity into events, derives requirements, surfaces actions, verifies closures, emits receipts, and updates integrity continuously.</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {connectors.map((connector, index) => (
                  <motion.div key={connector.name} initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.35 }} transition={{ duration: 0.35, delay: index * 0.06 }} className="rounded-[1.8rem] border border-white/10 bg-neutral-950/70 p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-lg font-semibold text-white">{connector.name}</div>
                        <p className="mt-2 text-sm leading-6 text-white/60">{connector.note}</p>
                      </div>
                      <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-300">{connector.state}</div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
            <div className="mt-14 grid gap-4 lg:grid-cols-5">
              {[["1","Connect","Bind Stripe, operator surfaces, and live workflow sources."],["2","Capture","Normalize source activity into canonical events and object anchors."],["3","Derive","Issue requirements automatically when proof or follow-through is required."],["4","Verify","Collect closure evidence, emit receipts, and resolve exceptions."],["5","Govern","Update integrity and protect economic movement when proof is missing."]].map(([num, title, body]) => (
                <div key={title} className="rounded-[1.6rem] border border-white/10 bg-white/[0.03] p-5">
                  <div className="text-sm uppercase tracking-[0.18em] text-white/35">{num}</div>
                  <div className="mt-3 text-lg font-semibold text-white">{title}</div>
                  <p className="mt-3 text-sm leading-6 text-white/60">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* WHY */}
        <section id="why" className="border-y border-white/10 bg-neutral-950">
          <div className="mx-auto max-w-7xl px-6 py-20 lg:px-8">
            <div className="max-w-3xl">
              <div className="text-sm font-semibold uppercase tracking-[0.22em] text-white/45">Why AutoKirk exists</div>
              <h2 className="mt-3 max-w-4xl text-3xl font-semibold tracking-tight text-white sm:text-5xl">The biggest operational risk is invisible work that never actually gets finished.</h2>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-white/68">Revenue loss begins in the gap between claimed execution and provable completion. AutoKirk closes that gap by making required work visible, enforceable, and verifiable.</p>
            </div>
            <div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {painPoints.map((point) => (
                <div key={point} className="rounded-[1.8rem] border border-white/10 bg-white/[0.03] p-6 text-base leading-7 text-white/78 shadow-xl shadow-black/20">{point}</div>
              ))}
            </div>
          </div>
        </section>

        {/* SYSTEM */}
        <section id="system">
          <div className="mx-auto max-w-7xl px-6 py-20 lg:px-8">
            <div className="grid gap-12 lg:grid-cols-[0.86fr_1.14fr] lg:items-start">
              <div>
                <div className="text-sm font-semibold uppercase tracking-[0.22em] text-white/45">System flow</div>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-5xl">Operational integrity comes from a clear, enforceable system.</h2>
                <p className="mt-6 max-w-xl text-lg leading-8 text-white/68">AutoKirk is not another dashboard. It is a controlled loop that records operational reality, derives required work, validates completion, and updates trust in the business continuously.</p>
                <div className="mt-8 rounded-[1.8rem] border border-white/10 bg-white/[0.03] p-6">
                  <div className="text-xs uppercase tracking-[0.2em] text-white/38">What the system does</div>
                  <p className="mt-3 text-sm leading-7 text-white/62">Existing tools continue to run the operation. AutoKirk attaches to the workflow, watches real events, issues requirements, surfaces actions, and protects economic movement when proof is missing.</p>
                </div>
              </div>
              <div className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-6">
                <div className="space-y-4">
                  {systemFlow.map((step, index) => (
                    <motion.div key={step} initial={{ opacity: 0, x: 20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, amount: 0.35 }} transition={{ duration: 0.35, delay: index * 0.06 }} className="group flex items-center gap-4 rounded-2xl border border-white/8 bg-neutral-950/65 p-4 transition hover:border-white/20 hover:bg-white/[0.04]">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-sm font-semibold text-neutral-950">{index + 1}</div>
                      <div>
                        <div className="text-sm uppercase tracking-[0.18em] text-white/35">Stage {index + 1}</div>
                        <div className="mt-1 text-lg font-medium text-white">{step}</div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* TIMELINE */}
        <section className="border-y border-white/10 bg-neutral-950">
          <div className="mx-auto max-w-7xl px-6 py-20 lg:px-8">
            <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
              <div>
                <div className="text-sm font-semibold uppercase tracking-[0.22em] text-white/45">System timeline</div>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-5xl">One governed loop from event to receipt.</h2>
                <p className="mt-6 max-w-2xl text-lg leading-8 text-white/68">The UI should not feel like disconnected screens. It should reveal one continuous operating loop that the kernel governs end to end.</p>
              </div>
              <div className="space-y-4">
                {timeline.map((item, index) => (
                  <motion.div key={item.label} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.3 }} transition={{ duration: 0.35, delay: index * 0.06 }} className="rounded-[1.7rem] border border-white/10 bg-white/[0.03] p-5">
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white text-sm font-semibold text-neutral-950">{index + 1}</div>
                      <div>
                        <div className="text-lg font-semibold text-white">{item.label}</div>
                        <p className="mt-1 text-sm leading-6 text-white/60">{item.body}</p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* INTEGRITY */}
        <section id="integrity" className="border-y border-white/10 bg-white/[0.02]">
          <div className="mx-auto max-w-7xl px-6 py-20 lg:px-8">
            <div className="max-w-3xl">
              <div className="text-sm font-semibold uppercase tracking-[0.22em] text-white/45">Primary operating KPI</div>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-5xl">Integrity is the single number that shows if your business is actually operating correctly.</h2>
              <p className="mt-6 text-lg leading-8 text-white/68">Instead of reading fragmented metrics, leadership sees one operating truth signal derived from closures, breaches, event coverage, response speed, and proof arrival.</p>
            </div>
            <div className="mt-12 grid gap-5 lg:grid-cols-5">
              {integritySignals.map(([title, weight, desc]) => (
                <div key={title} className="rounded-[1.8rem] border border-white/10 bg-neutral-950/70 p-6">
                  <div className="text-sm uppercase tracking-[0.18em] text-white/40">{weight}</div>
                  <div className="mt-3 text-lg font-semibold text-white">{title}</div>
                  <p className="mt-3 text-sm leading-6 text-white/60">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* PROOF */}
        <section id="proof">
          <div className="mx-auto max-w-7xl px-6 py-20 lg:px-8">
            <div className="grid gap-10 lg:grid-cols-[0.95fr_1.05fr]">
              <div className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-7">
                <div className="text-sm font-semibold uppercase tracking-[0.22em] text-white/45">Proof over promises</div>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Confidence grows when operations leave a permanent trail of proof.</h2>
                <p className="mt-5 text-lg leading-8 text-white/68">AutoKirk turns real business activity into append-only proof surfaces that can be used to resolve disputes, expose gaps, and govern what should count as completed work.</p>
                <div className="mt-8 grid gap-3">
                  {trustSignals.map((signal, index) => (
                    <motion.div key={signal} initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.3, delay: index * 0.05 }} className="rounded-2xl border border-white/8 bg-neutral-950/65 px-4 py-4 text-sm text-white/78">{signal}</motion.div>
                  ))}
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {surfaceCards.map((card) => (
                  <div key={card.title} className="rounded-[1.8rem] border border-white/10 bg-neutral-950/70 p-6">
                    <div className="text-xs uppercase tracking-[0.18em] text-white/40">{card.label}</div>
                    <div className="mt-3 text-lg font-semibold text-white">{card.title}</div>
                    <p className="mt-3 text-sm leading-6 text-white/60">{card.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* COMPARISON */}
        <section className="border-y border-white/10 bg-neutral-950">
          <div className="mx-auto max-w-7xl px-6 py-20 lg:px-8">
            <div className="grid gap-14 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
              <div>
                <div className="text-sm font-semibold uppercase tracking-[0.22em] text-white/45">A real operational moment</div>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-5xl">When proof is missing, revenue risk appears.</h2>
                <p className="mt-6 text-lg leading-8 text-white/68">A service can be performed, but if closure never arrives the business cannot safely trust it. AutoKirk detects the missing proof, surfaces an action, and protects the operation before payouts or accounting continue.</p>
              </div>
              <div className="grid gap-8 md:grid-cols-2">
                <div className="rounded-[2rem] border border-red-400/20 bg-red-400/5 p-7">
                  <div className="flex items-center gap-2 text-sm uppercase tracking-[0.18em] text-red-300"><AlertCircle className="h-4 w-4" />Without AutoKirk</div>
                  <ul className="mt-6 space-y-4 text-sm text-white/75">{comparison.without.map((item) => <li key={item}>{item}</li>)}</ul>
                </div>
                <div className="rounded-[2rem] border border-emerald-400/20 bg-emerald-400/5 p-7">
                  <div className="flex items-center gap-2 text-sm uppercase tracking-[0.18em] text-emerald-300"><ShieldCheck className="h-4 w-4" />With AutoKirk</div>
                  <ul className="mt-6 space-y-4 text-sm text-white/75">{comparison.with.map((item) => <li key={item}>{item}</li>)}</ul>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SURFACES */}
        <section id="surfaces" className="border-y border-white/10 bg-white/[0.02]">
          <div className="mx-auto max-w-7xl px-6 py-20 lg:px-8">
            <div className="max-w-3xl">
              <div className="text-sm font-semibold uppercase tracking-[0.22em] text-white/45">Inside the system</div>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-5xl">Operators interact with clear actions, proof, and outcomes.</h2>
              <p className="mt-6 text-lg leading-8 text-white/68">Teams should not need to think about the kernel. They should see the required action, complete the work, attach proof, and let the system determine whether the business can trust the outcome.</p>
            </div>
            <div className="mt-14 grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
              <div className="rounded-[2rem] border border-white/10 bg-neutral-950 p-6">
                <div className="flex items-center justify-between gap-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-white/40">Operator workspace</div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-white/60"><PlugZap className="h-3.5 w-3.5" />Live surface</div>
                </div>
                <div className="mt-5 space-y-4">
                  <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm text-white/60">Action Required</div>
                        <div className="mt-2 text-lg font-medium text-white">Submit closure proof for completed service before payout release</div>
                      </div>
                      <div className="rounded-xl border border-white/10 px-3 py-2 text-xs text-white/65">Due now</div>
                    </div>
                    <div className="mt-4 flex gap-2">
                      <button className="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-neutral-950">Open action</button>
                      <button className="rounded-xl border border-white/12 px-3 py-2 text-xs text-white/75">Request exception</button>
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                      <div className="text-sm text-white/60">Required proof</div>
                      <ul className="mt-3 space-y-2 text-sm text-white/72"><li>Closure confirmation</li><li>Operator identity</li><li>Checklist or media proof</li></ul>
                    </div>
                    <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                      <div className="text-sm text-white/60">System outcome</div>
                      <ul className="mt-3 space-y-2 text-sm text-white/72"><li>Receipt emitted</li><li>Requirement satisfied</li><li>Integrity updated</li></ul>
                    </div>
                  </div>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {surfaceCards.map((card) => (
                  <div key={card.label} className="rounded-[1.8rem] border border-white/10 bg-neutral-950/70 p-6">
                    <div className="text-xs uppercase tracking-[0.18em] text-white/40">{card.label}</div>
                    <div className="mt-3 text-lg font-semibold text-white">{card.title}</div>
                    <p className="mt-3 text-sm leading-6 text-white/60">{card.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="border-t border-white/10 bg-neutral-950">
          <div className="mx-auto max-w-5xl px-6 py-20 text-center lg:px-8">
            <div className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.22em] text-white/70">
              Founder-useful operating visibility
            </div>
            <h2 className="mt-6 text-4xl font-semibold tracking-tight text-white sm:text-6xl">Run your business on verified execution, not assumptions.</h2>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-white/68">AutoKirk helps teams move from invisible operational failure to enforced execution, verifiable proof, and live integrity across the workflows that actually affect revenue.</p>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <a href="#connect" className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-6 py-3 text-sm font-semibold text-neutral-950 transition hover:scale-[1.02]">
                Connect operations <ArrowRight className="h-4 w-4" />
              </a>
              <a href="/login" className="inline-flex items-center justify-center rounded-2xl border border-white/15 px-6 py-3 text-sm font-semibold text-white/85 transition hover:border-white/30 hover:bg-white/5">
                Enter AutoKirk
              </a>
            </div>
            <div className="mt-12 grid gap-4 sm:grid-cols-3">
              <div className="rounded-[1.6rem] border border-white/10 bg-white/[0.03] p-5 text-left">
                <div className="flex items-center gap-2 text-sm font-medium text-white"><PlugZap className="h-4 w-4 text-white/70" />Live connectors</div>
                <p className="mt-3 text-sm leading-6 text-white/60">Connect the running system to the kernel instead of rebuilding the operation from scratch.</p>
              </div>
              <div className="rounded-[1.6rem] border border-white/10 bg-white/[0.03] p-5 text-left">
                <div className="flex items-center gap-2 text-sm font-medium text-white"><Receipt className="h-4 w-4 text-white/70" />Receipt-backed truth</div>
                <p className="mt-3 text-sm leading-6 text-white/60">Use verifiable receipts as the operating proof layer across actions, closures, and exceptions.</p>
              </div>
              <div className="rounded-[1.6rem] border border-white/10 bg-white/[0.03] p-5 text-left">
                <div className="flex items-center gap-2 text-sm font-medium text-white"><LineChart className="h-4 w-4 text-white/70" />Founder control</div>
                <p className="mt-3 text-sm leading-6 text-white/60">See integrity, breaches, actions, and receipts as a live operating control surface, not a passive dashboard.</p>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
