"use client";
import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  ArrowRight,
  BadgeCheck,
  Bell,
  Brain,
  Building2,
  CheckCircle2,
  CircleDashed,
  Filter,
  Receipt,
  Search,
  Shield,
  Siren,
  Target,
  TrendingUp,
  UserRound,
  Workflow,
  XCircle,
} from "lucide-react";

const shell = "min-h-screen bg-zinc-950 text-zinc-50";
const card = "rounded-3xl border border-zinc-800 bg-zinc-900/80 shadow-2xl shadow-black/30";
const muted = "text-zinc-400";
const pill =
  "inline-flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-300";
const statCard = "rounded-2xl border border-zinc-800 bg-zinc-950/90 p-4";

const movements = [
  {
    id: "mv_82014",
    object: "Service Work Order",
    objectId: "wo_2144",
    face: "Marine Dealership",
    domain: "Service / Washbay",
    action: "Wash completed",
    actor: "Operator: J. Ellis",
    tier: "Tier 1 • Auto-close allowed",
    value: "$145",
    status: "Receipted",
    time: "08:43 AM",
    date: "Mar 12, 2026",
    outcome: "Closed",
  },
  {
    id: "mv_82015",
    object: "Invoice",
    objectId: "inv_9118",
    face: "Billing Enforcement",
    domain: "Payments",
    action: "Charge succeeded",
    actor: "Stripe webhook",
    tier: "Tier 2 • Assisted close",
    value: "$4,980",
    status: "Open Obligation",
    time: "08:47 AM",
    date: "Mar 12, 2026",
    outcome: "Awaiting closure",
  },
  {
    id: "mv_82016",
    object: "Ad Campaign",
    objectId: "cmp_102",
    face: "Advertising Enforcement",
    domain: "Lead Flow",
    action: "Campaign underperforming",
    actor: "Schema AI suggestion",
    tier: "Tier 2 • Assisted close",
    value: "$1,250 spend",
    status: "Suggested action",
    time: "09:01 AM",
    date: "Mar 12, 2026",
    outcome: "Review needed",
  },
  {
    id: "mv_82017",
    object: "Lead",
    objectId: "lead_459",
    face: "Sales Reality",
    domain: "Follow-Up",
    action: "No follow-up within 24h",
    actor: "Policy timer",
    tier: "Tier 1 • Auto-close allowed",
    value: "$12,000 potential",
    status: "Eliminated",
    time: "09:18 AM",
    date: "Mar 12, 2026",
    outcome: "Receipted elimination",
  },
];

const receipts = [
  {
    id: "rcpt_0a19d3",
    obligation: "obl_6012",
    object: "wo_2144",
    face: "Marine Dealership",
    actor: "J. Ellis",
    state: "SEALED",
    timestamp: "2026-03-12 08:43:19",
    lineage: "hash_89f2...d221",
  },
  {
    id: "rcpt_0a19d4",
    obligation: "obl_6013",
    object: "inv_9118",
    face: "Billing Enforcement",
    actor: "Stripe webhook",
    state: "OPEN",
    timestamp: "2026-03-12 08:47:03",
    lineage: "hash_9ab2...e410",
  },
  {
    id: "rcpt_0a19d5",
    obligation: "obl_6014",
    object: "lead_459",
    face: "Sales Reality",
    actor: "Policy timer",
    state: "ELIMINATED",
    timestamp: "2026-03-12 09:18:47",
    lineage: "hash_123f...af04",
  },
];

const faces = [
  {
    name: "Marine Dealership",
    domains: ["Service", "Washbay", "Parts", "Sales"],
    integrity: 97,
    pressure: "1 stalled object",
    note: "Highest readiness for first deployment",
  },
  {
    name: "Billing Enforcement",
    domains: ["Stripe", "Reconciliation", "Collections"],
    integrity: 100,
    pressure: "0 breaches",
    note: "Cleanest proof chain today",
  },
  {
    name: "Advertising Enforcement",
    domains: ["Spend", "Lead", "Outcome", "Renewal"],
    integrity: 91,
    pressure: "2 review items",
    note: "Best premium advisory wedge",
  },
];

function runSanityChecks() {
  const checks = [
    { name: "movements present", pass: movements.length > 0 },
    { name: "receipts present", pass: receipts.length > 0 },
    { name: "faces present", pass: faces.length > 0 },
    {
      name: "every receipt has an id and lineage",
      pass: receipts.every((r) => Boolean(r.id && r.lineage)),
    },
    {
      name: "every face has at least one domain",
      pass: faces.every((f) => Array.isArray(f.domains) && f.domains.length > 0),
    },
  ];

  return {
    passed: checks.every((c) => c.pass),
    checks,
  };
}

function SectionTitle({ eyebrow, title, body }) {
  return (
    <div className="space-y-2">
      <div className={pill}>{eyebrow}</div>
      <h2 className="text-3xl font-black tracking-tight md:text-4xl">{title}</h2>
      {body ? <p className={`max-w-3xl text-base ${muted}`}>{body}</p> : null}
    </div>
  );
}

function TopNav({ current, setCurrent }) {
  const items = [
    ["System", Activity],
    ["Command", Workflow],
    ["Proof", Receipt],
    ["Markets", Building2],
    ["Intelligence", Brain],
  ];

  return (
    <div className="sticky top-0 z-50 border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 md:px-8">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.28em] text-zinc-400">AutoKirk</div>
          <div className="text-lg font-black">Revenue Integrity Kernel</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {items.map(([label, Icon]) => {
            const active = current === label;
            return (
              <button
                key={label}
                onClick={() => setCurrent(label)}
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
                  active
                    ? "bg-white text-zinc-950"
                    : "border border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700 hover:text-white"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Hero({ setCurrent }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
      <div className={`${card} p-7 md:p-10`}>
        <div className={pill}>Surface simplicity. Core ruthlessness.</div>
        <h1 className="mt-4 max-w-4xl text-4xl font-black leading-[0.95] tracking-tight md:text-6xl">
          Every revenue action becomes accountable, searchable, and provable.
        </h1>
        <p className={`mt-5 max-w-3xl text-lg ${muted}`}>
          AutoKirk is not a dashboard. It is a kernel that turns economically meaningful movement into
          receipted truth. Events become obligations. Obligations reach closure, termination, or elimination.
          Nothing tied to revenue disappears without history.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <button
            onClick={() => setCurrent("System")}
            className="rounded-full bg-white px-5 py-3 text-sm font-bold text-zinc-950"
          >
            Enter operator system
          </button>
          <button
            onClick={() => setCurrent("Proof")}
            className="rounded-full border border-zinc-700 px-5 py-3 text-sm font-bold text-white"
          >
            View proof layer
          </button>
        </div>
      </div>
      <div className={`${card} p-7`}>
        <div className={pill}>Live operating grammar</div>
        <div className="mt-6 space-y-4">
          {[
            ["Event", CircleDashed, "Something crossed the kernel boundary"],
            ["Obligation", Siren, "Revenue movement now requires closure"],
            ["Command", Workflow, "Human or policy advances the object"],
            ["Receipt", Receipt, "Immutable proof emitted"],
            ["Integrity", Shield, "System truth is recalculated"],
          ].map(([label, Icon, text], idx) => (
            <motion.div
              key={label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.08 }}
              className="flex items-center gap-4 rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4"
            >
              <div className="rounded-2xl border border-zinc-700 p-3">
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <div className="text-sm font-black uppercase tracking-[0.18em] text-zinc-300">{label}</div>
                <div className={`text-sm ${muted}`}>{text}</div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SystemPage() {
  const stats = [
    ["Integrity", "97", "Governance clean"],
    ["Open obligations", "3", "1 requires human closure"],
    ["Receipts today", "41", "All revenue movement accounted"],
    ["Potential leakage", "$12,000", "1 eliminated lead path"],
  ];

  return (
    <div className="space-y-8">
      <SectionTitle
        eyebrow="System"
        title="The machine, not the menu."
        body="This page makes the kernel legible. It shows pressure, flow, and proof in one place so the operator understands what is moving, what is stuck, and what has already been sealed."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stats.map(([label, value, note]) => (
          <div key={label} className={statCard}>
            <div className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">{label}</div>
            <div className="mt-2 text-4xl font-black">{value}</div>
            <div className={`mt-2 text-sm ${muted}`}>{note}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className={`${card} p-6`}>
          <SectionTitle
            eyebrow="Live movement"
            title="Revenue flow through the kernel"
            body="This is the visual centerpiece. Operators should see movement passing through stages, not disconnected pages."
          />
          <div className="mt-6 grid gap-3 md:grid-cols-5">
            {[
              ["Events", "18", Activity],
              ["Obligations", "7", Siren],
              ["Command", "3", Workflow],
              ["Receipts", "41", Receipt],
              ["Closures", "16", CheckCircle2],
            ].map(([label, value, Icon], i) => (
              <div key={label} className="relative rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4">
                <Icon className="mb-3 h-5 w-5 text-zinc-300" />
                <div className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">{label}</div>
                <div className="mt-1 text-3xl font-black">{value}</div>
                {i < 4 ? (
                  <ArrowRight className="absolute -right-3 top-1/2 hidden h-5 w-5 -translate-y-1/2 text-zinc-700 md:block" />
                ) : null}
              </div>
            ))}
          </div>
        </div>

        <div className={`${card} p-6`}>
          <SectionTitle
            eyebrow="Pressure"
            title="What needs attention now"
            body="This is where the system earns its keep. It converts abstract architecture into operator pressure."
          />
          <div className="mt-5 space-y-3">
            {[
              ["Billing obligation waiting for closure", "Human required", Bell],
              ["Advertising campaign underperforming", "Suggested review", Brain],
              ["Lead path eliminated automatically", "Proof stored", XCircle],
            ].map(([title, note, Icon]) => (
              <div key={title} className="flex items-start gap-3 rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4">
                <div className="rounded-xl border border-zinc-700 p-2">
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <div className="font-semibold">{title}</div>
                  <div className={`text-sm ${muted}`}>{note}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function CommandPage() {
  return (
    <div className="space-y-8">
      <SectionTitle
        eyebrow="Command"
        title="Where revenue-linked duty becomes visible."
        body="Command is not a task list. It is the live queue of governed obligations that have not yet reached closure, termination, or elimination."
      />
      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div className={`${card} p-6`}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">Queue pressure</div>
              <div className="mt-2 text-5xl font-black">3</div>
            </div>
            <div className="rounded-full border border-zinc-700 px-4 py-2 text-sm font-semibold">
              1 human-close required
            </div>
          </div>
          <div className="mt-6 space-y-3">
            {movements
              .filter((m) => m.status !== "Receipted")
              .map((m) => (
                <div key={m.id} className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-black uppercase tracking-[0.16em] text-zinc-500">{m.face}</div>
                      <div className="mt-1 text-lg font-semibold">{m.action}</div>
                      <div className={`mt-1 text-sm ${muted}`}>
                        {m.object} • {m.objectId} • {m.value}
                      </div>
                    </div>
                    <div className="rounded-full border border-zinc-700 px-3 py-1 text-xs font-semibold">
                      {m.status}
                    </div>
                  </div>
                  <div className={`mt-3 text-sm ${muted}`}>{m.actor} • {m.tier}</div>
                  <div className="mt-4 flex gap-2">
                    <button className="rounded-full bg-white px-4 py-2 text-sm font-bold text-zinc-950">
                      Inspect object
                    </button>
                    <button className="rounded-full border border-zinc-700 px-4 py-2 text-sm font-bold">
                      Close or escalate
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>
        <div className={`${card} p-6`}>
          <SectionTitle
            eyebrow="Why this page wins"
            title="A real painkiller"
            body="This is the page that makes AutoKirk sellable. It shows where money is at risk, what requires action, and whether policy or a human must close the path."
          />
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            {[
              ["Unknown revenue leakage becomes visible", Target],
              ["Human authority only where needed", UserRound],
              ["Low-value noise can auto-close without disappearing", Workflow],
              ["Every step still leaves proof", Receipt],
            ].map(([text, Icon]) => (
              <div key={text} className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4">
                <Icon className="mb-3 h-5 w-5 text-zinc-300" />
                <div className="font-semibold">{text}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProofPage() {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return receipts;
    return receipts.filter((r) => JSON.stringify(r).toLowerCase().includes(q));
  }, [query]);

  return (
    <div className="space-y-8">
      <SectionTitle
        eyebrow="Proof"
        title="Searchable revenue forensics"
        body="This is one of the strongest pages in the product. Any revenue-linked movement should be retrievable by time, date, category, actor, obligation, object, or receipt identity."
      />
      <div className={`${card} p-6`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-xl">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search receipt id, object id, face, actor, obligation, time, or status"
              className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-11 py-4 text-sm outline-none ring-0 placeholder:text-zinc-500"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {['Date range', 'Face', 'Actor', 'Status', 'Tier'].map((f) => (
              <button
                key={f}
                className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-950 px-4 py-2 text-sm font-semibold"
              >
                <Filter className="h-4 w-4" />
                {f}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-6 space-y-3">
          {filtered.map((r) => (
            <div key={r.id} className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4">
              <div className="grid gap-3 md:grid-cols-[1.1fr_0.9fr_0.9fr]">
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">Receipt</div>
                  <div className="mt-1 text-lg font-semibold">{r.id}</div>
                  <div className={`mt-1 text-sm ${muted}`}>Object {r.object} • Obligation {r.obligation}</div>
                </div>
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">Proof state</div>
                  <div className="mt-1 text-lg font-semibold">{r.state}</div>
                  <div className={`mt-1 text-sm ${muted}`}>{r.face}</div>
                </div>
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">Lineage</div>
                  <div className="mt-1 inline-flex items-center gap-2 text-sm font-semibold">
                    <Shield className="h-4 w-4" /> {r.lineage}
                  </div>
                  <div className={`mt-1 text-sm ${muted}`}>{r.actor} • {r.timestamp}</div>
                </div>
              </div>
            </div>
          ))}
          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/80 p-8 text-center">
              <div className="text-lg font-semibold">No proof records matched your search.</div>
              <div className={`mt-2 text-sm ${muted}`}>
                Try searching by receipt id, object id, face, actor, or timestamp.
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function MarketsPage() {
  return (
    <div className="space-y-8">
      <SectionTitle
        eyebrow="Markets"
        title="One kernel. Different faces."
        body="This page explains the deployment strategy. The kernel stays fixed. Faces change vocabulary. Domains generate objects. That is how AutoKirk expands without back-solving the core."
      />
      <div className="grid gap-4 lg:grid-cols-3">
        {faces.map((face) => (
          <div key={face.name} className={`${card} p-6`}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">Face</div>
                <div className="mt-1 text-2xl font-black">{face.name}</div>
              </div>
              <div className="rounded-full border border-zinc-700 px-3 py-2 text-sm font-bold">
                Integrity {face.integrity}
              </div>
            </div>
            <div className={`mt-3 text-sm ${muted}`}>{face.note}</div>
            <div className="mt-5 flex flex-wrap gap-2">
              {face.domains.map((d) => (
                <span key={d} className="rounded-full border border-zinc-800 bg-zinc-950 px-3 py-1 text-xs font-semibold">
                  {d}
                </span>
              ))}
            </div>
            <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4">
              <div className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">Pressure</div>
              <div className="mt-1 text-lg font-semibold">{face.pressure}</div>
            </div>
          </div>
        ))}
      </div>

      <div className={`${card} p-6`}>
        <SectionTitle
          eyebrow="Highest revenue path"
          title="Service departments first"
          body="If I were optimizing for survival and revenue, I would lead with service environments where leakage is obvious, tickets are meaningful, and closeout chaos is common. Marine service is a strong first wedge."
        />
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          {[
            ['Leakage is constant', 'Work orders, inspections, parts, and follow-up disappear without proof.'],
            ['Value is easy to measure', 'Each missed closeout has direct revenue consequences.'],
            ['Expansion path is natural', 'Washbay to service to parts to billing to sales.'],
          ].map(([title, body]) => (
            <div key={title} className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4">
              <div className="font-semibold">{title}</div>
              <div className={`mt-2 text-sm ${muted}`}>{body}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function IntelligencePage() {
  return (
    <div className="space-y-8">
      <SectionTitle
        eyebrow="Intelligence"
        title="Proof outranks inference"
        body="Schema AI should not mutate the system. It should learn from receipts, compare patterns, and recommend stronger movement policies without crossing the authority boundary."
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className={`${card} p-6`}>
          <div className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">Learns from</div>
          <div className="mt-5 space-y-3">
            {[
              'Time to closure',
              'Positive vs negative outcomes',
              'Market face differences',
              'Actor behavior',
              'Termination and elimination frequency',
            ].map((item) => (
              <div key={item} className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4">
                <BadgeCheck className="h-5 w-5 text-zinc-300" />
                <div className="font-semibold">{item}</div>
              </div>
            ))}
          </div>
        </div>
        <div className={`${card} p-6`}>
          <div className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">Premium revenue route</div>
          <div className="mt-3 text-2xl font-black">Advisory and optimization on top of the kernel</div>
          <div className={`mt-3 text-sm ${muted}`}>
            The real upsell is not generic AI. It is market-aware, receipted, closure-aware recommendations that
            show where money is being lost and what policy changes could stop it.
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {[
              ['Leak detection advisory', TrendingUp],
              ['Closure policy tuning', Shield],
              ['Notification tuning', Bell],
              ['Cross-market intelligence', Building2],
            ].map(([label, Icon]) => (
              <div key={label} className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4">
                <Icon className="mb-3 h-5 w-5 text-zinc-300" />
                <div className="font-semibold">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SanityChecksPanel() {
  const results = useMemo(() => runSanityChecks(), []);

  return (
    <div className={`${card} p-6`}>
      <SectionTitle
        eyebrow="Sanity checks"
        title="Blueprint integrity"
        body="These lightweight checks make sure the demo data model backing the pages is internally coherent."
      />
      <div className="mt-5 grid gap-3 md:grid-cols-2 lg:grid-cols-5">
        {results.checks.map((check) => (
          <div key={check.name} className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4">
            <div className="mb-2 inline-flex rounded-full border border-zinc-700 px-2 py-1 text-xs font-bold uppercase tracking-[0.16em]">
              {check.pass ? "Pass" : "Fail"}
            </div>
            <div className="text-sm font-semibold">{check.name}</div>
          </div>
        ))}
      </div>
      <div className={`mt-4 text-sm ${results.passed ? 'text-emerald-400' : 'text-amber-400'}`}>
        {results.passed ? 'All sanity checks passed.' : 'One or more sanity checks failed.'}
      </div>
    </div>
  );
}

export default function AutoKirkWebpagesBlueprint() {
  const [current, setCurrent] = useState('System');

  const CurrentPage = useMemo(() => {
    switch (current) {
      case 'Command':
        return <CommandPage />;
      case 'Proof':
        return <ProofPage />;
      case 'Markets':
        return <MarketsPage />;
      case 'Intelligence':
        return <IntelligencePage />;
      default:
        return <SystemPage />;
    }
  }, [current]);

  return (
    <div className={shell}>
      <TopNav current={current} setCurrent={setCurrent} />
      <main className="mx-auto max-w-7xl space-y-10 px-5 py-8 md:px-8 md:py-10">
        <Hero setCurrent={setCurrent} />
        {CurrentPage}
        <SanityChecksPanel />
        <div className={`${card} p-6`}>
          <SectionTitle
            eyebrow="Design summary"
            title="What these webpages are trying to accomplish"
            body="Make AutoKirk understandable as a machine, sellable through one painful wedge, and scalable without diluting the kernel. These pages are designed to eliminate abstraction, expose operator pressure, and emphasize proof as the center of trust."
          />
          <div className="mt-6 grid gap-3 md:grid-cols-4">
            {[
              ['Kernel stays strict', Shield],
              ['Service wedge first', Building2],
              ['Proof is searchable', Search],
              ['AI remains subordinate', Brain],
            ].map(([label, Icon]) => (
              <div key={label} className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4">
                <Icon className="mb-3 h-5 w-5 text-zinc-300" />
                <div className="font-semibold">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
