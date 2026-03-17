"use client";

import Link from "next/link";
import {
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import { Cormorant_Garamond } from "next/font/google";
import {
  Building2,
  Factory,
  Gift,
  Landmark,
  ReceiptText,
  ShieldCheck,
  Siren,
  Volume2,
  VolumeX,
  Wallet,
  Workflow,
} from "lucide-react";

const display = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
});

type Scenario = {
  sector: string;
  object: string;
  amount: string;
  work: string;
  duty: string;
  action: string;
  proof: string;
  leak: string;
  result: string;
};

const SCENARIOS: Scenario[] = [
  {
    sector: "Service business",
    object: "Work order closed in the shop",
    amount: "$1,240",
    work: "The job is finished.",
    duty: "Invoice and collection still need to happen.",
    action: "The next move stays visible until someone owns it.",
    proof: "When it is closed, the receipt stays with the business.",
    leak: "Jobs get done. Billing follow-through drifts.",
    result: "Revenue stops slipping between the wrench and the invoice.",
  },
  {
    sector: "Subscription company",
    object: "Renewal charge succeeds",
    amount: "$4,980",
    work: "The payment lands.",
    duty: "Continuity, follow-up, and account health still matter.",
    action: "The team sees what still needs to be confirmed.",
    proof: "The close is proven instead of assumed.",
    leak: "Money came in, but nobody can prove the rest was handled.",
    result: "Renewal money and follow-through stay tied together.",
  },
  {
    sector: "Donation flow",
    object: "Gift received",
    amount: "$48,200",
    work: "The money arrives.",
    duty: "Acknowledgement, allocation, and stewardship are still owed.",
    action: "AutoKirk keeps the path open until the client can see it finished.",
    proof: "The organization keeps proof instead of relying on memory.",
    leak: "Donations arrive. Follow-through gets scattered across people and tools.",
    result: "The money, the obligation, and the proof stay in one place.",
  },
  {
    sector: "Grant / funding",
    object: "Award accepted",
    amount: "$250,000",
    work: "The funding is booked.",
    duty: "Restrictions, reporting, and ownership still have to be handled.",
    action: "The next responsibility is visible before it becomes a problem.",
    proof: "What was finished can be shown later.",
    leak: "A big number lands. The real work gets lost after the celebration.",
    result: "Funding obligations stay visible until they are actually closed.",
  },
];

const HOW_IT_WORKS = [
  {
    title: "Work starts",
    body: "A payment lands, a service job finishes, a renewal hits, a donation comes in, or money moves internally.",
    icon: Wallet,
  },
  {
    title: "A next step is owed",
    body: "AutoKirk makes the missing follow-through visible instead of letting it disappear into handoffs.",
    icon: Siren,
  },
  {
    title: "Someone owns the close",
    body: "The next move is clear. The team can see who needs to act and what still has to happen.",
    icon: Workflow,
  },
  {
    title: "Proof stays behind",
    body: "If it was finished, there is something to show for it later.",
    icon: ReceiptText,
  },
];

const SYSTEM_LAYERS = [
  {
    name: "Kernel",
    body: "The authoritative truth engine. Revenue-linked movement is governed through object, event, obligation, resolution, and receipt.",
  },
  {
    name: "Watchdog",
    body: "The observation layer. It watches committed truth for stale obligations, proof lag, breach risk, and integrity degradation.",
  },
  {
    name: "Learning",
    body: "The advisory layer. It studies receipts and outcomes to improve operator judgment without receiving mutation authority.",
  },
] as const;

const SECTORS = [
  ["Companies", "Sales, subscriptions, service work, collections, payouts", Building2],
  ["Organizations", "Dues, fees, approvals, internal money movement", Workflow],
  ["Funding", "Grants, restrictions, disbursements, reporting", Landmark],
  ["Donations", "Pledges, acknowledgements, allocation, stewardship", Gift],
  ["Service teams", "Jobs, inspections, work orders, billing follow-through", Factory],
  ["Proof", "Receipts that back up what your team says got finished", ReceiptText],
] as const;

const CATEGORY_ROWS = [
  {
    name: "Service business",
    rows: [
      ["Accountability", "Which finished jobs still need invoice, collection, callback, or approval."],
      ["Human oversight", "Who owns the next move when work is done but money is not closed."],
      ["Transparency", "Why the job is still open and what counts as finished."],
      ["Fairness / safety", "A clean timeline so nobody gets blamed through guesswork."],
    ],
  },
  {
    name: "Subscriptions",
    rows: [
      ["Accountability", "Which renewals, disputes, cancellations, or payment changes still need action."],
      ["Human oversight", "Where a person needs to review customer-impacting follow-through."],
      ["Transparency", "What opened the duty and what closes it."],
      ["Fairness / safety", "No silent auto-close on paths that affect real customers."],
    ],
  },
  {
    name: "Donations / grants",
    rows: [
      ["Accountability", "Which gifts or awards still require acknowledgement, allocation, restriction handling, or reporting."],
      ["Human oversight", "Who is responsible for donor, steward, or funding follow-through."],
      ["Transparency", "Where the money went and what is still owed."],
      ["Fairness / safety", "Trust stays protected because the close can be shown."],
    ],
  },
  {
    name: "Internal costs",
    rows: [
      ["Accountability", "Which vendor charges, AI usage, cloud spend, or software bills still need review."],
      ["Human oversight", "Who owns the spend and whether it should keep running."],
      ["Transparency", "What the charge is, what period it covers, and why it exists."],
      ["Fairness / safety", "No hidden recurring spend and no undocumented tool creep."],
    ],
  },
];

const displayStages = [
  "Work starts",
  "A next step is owed",
  "Someone has to move it",
  "Proof stays",
] as const;

export default function HomePage() {
  const [tick, setTick] = useState(0);
  const [audioOn, setAudioOn] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const scenarioIndex = Math.floor(tick / displayStages.length) % SCENARIOS.length;
  const stageIndex = tick % displayStages.length;
  const scenario = useMemo(() => SCENARIOS[scenarioIndex], [scenarioIndex]);

  const playCurrentTone = useEffectEvent((stage: number) => {
    if (!audioOn) return;
    playTone(audioCtxRef, stage);
  });

  useEffect(() => {
    const id = window.setInterval(() => {
      setTick((value) => value + 1);
    }, 2200);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (tick === 0) return;
    playCurrentTone(stageIndex);
  }, [stageIndex, tick]);

  return (
    <div className={`${display.variable} min-h-screen overflow-hidden bg-[#0a1015] text-stone-100`}>
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(118,224,255,0.12),transparent_28%),radial-gradient(circle_at_84%_14%,rgba(245,192,116,0.12),transparent_24%),radial-gradient(circle_at_50%_100%,rgba(118,255,188,0.06),transparent_22%)]" />
        <div
          className="absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.7) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.7) 1px, transparent 1px)",
            backgroundSize: "54px 54px",
          }}
        />
      </div>

      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0a1015]/84 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div>
            <div className="text-[11px] uppercase tracking-[0.34em] text-stone-500">AutoKirk</div>
            <div className="mt-1 text-sm text-stone-300">Operator surface / page one</div>
          </div>
          <div className="hidden items-center gap-2 md:flex">
            <Link href="/login" className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-stone-200 transition hover:border-white/20 hover:bg-white/[0.08]">
              Operator entry
            </Link>
            <Link href="/command" className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-stone-200 transition hover:border-white/20 hover:bg-white/[0.08]">
              Command
            </Link>
            <Link href="/integrity" className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-stone-200 transition hover:border-white/20 hover:bg-white/[0.08]">
              Integrity
            </Link>
            <Link href="/founder" className="rounded-full border border-[#f2c47e]/25 bg-[#f2c47e]/10 px-4 py-2 text-sm text-[#f5d7a9] transition hover:border-[#f2c47e]/40 hover:bg-[#f2c47e]/16">
              Founder control
            </Link>
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-7xl space-y-20 px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        <section className="grid gap-8 xl:grid-cols-[1.04fr_0.96fr]">
          <div className="rounded-[36px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-7 shadow-[0_36px_110px_rgba(0,0,0,0.34)] sm:p-9">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#91e2ff]/18 bg-[#91e2ff]/10 px-4 py-1.5 text-xs uppercase tracking-[0.2em] text-[#d8f4ff]">
              <ShieldCheck className="h-3.5 w-3.5" />
              Stop losing money in the handoff
            </div>

            <h1 className="mt-6 max-w-5xl font-[var(--font-display)] text-5xl leading-[0.92] tracking-tight text-[#fff7ea] sm:text-6xl lg:text-8xl">
              If the work got done,
              <span className="block text-[#91e2ff]">you should be able to see the money follow it.</span>
            </h1>

            <p className="mt-6 max-w-3xl text-base leading-7 text-stone-300 sm:text-lg">
              AutoKirk helps a business see what started, what still needs attention, who owns the next step, and whether it was
              actually closed. It is built for the part of business where money usually gets messy: between the work and the
              follow-through.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/login" className="rounded-full bg-white px-5 py-3 text-sm font-medium text-slate-950 transition hover:translate-y-[-1px]">
                See AutoKirk
              </Link>
              <Link href="/founder" className="rounded-full border border-[#f2c47e]/25 bg-[#f2c47e]/10 px-5 py-3 text-sm font-medium text-[#f5d7a9] transition hover:border-[#f2c47e]/40 hover:bg-[#f2c47e]/16">
                Founder control
              </Link>
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              <QuickPoint
                title="See what is still open"
                body="Not just activity. The real work that still has money tied to it."
              />
              <QuickPoint
                title="See who owns the next step"
                body="No more handoff fog between teams, systems, or departments."
              />
              <QuickPoint
                title="Show proof when it is done"
                body="If someone says it is finished, you should be able to show it."
              />
            </div>
          </div>

          <div className="rounded-[36px] border border-white/10 bg-[#0c141b]/92 p-6 shadow-[0_34px_100px_rgba(0,0,0,0.36)] sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.28em] text-stone-500">AutoKirk board</div>
                <div className="mt-2 font-[var(--font-display)] text-4xl leading-none text-[#fff7ea]">
                  Work. Ownership. Proof.
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  const next = !audioOn;
                  setAudioOn(next);
                  if (next) playTone(audioCtxRef, stageIndex);
                }}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs uppercase tracking-[0.18em] text-stone-300 transition hover:border-white/20 hover:bg-white/[0.08]"
              >
                {audioOn ? <Volume2 className="h-4 w-4 text-[#91e2ff]" /> : <VolumeX className="h-4 w-4 text-stone-500" />}
                {audioOn ? "Audio on" : "Audio off"}
              </button>
            </div>

            <div className="mt-5 rounded-[26px] border border-white/10 bg-[#0d151c] p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.24em] text-stone-500">{scenario.sector}</div>
                  <div className="mt-2 text-2xl font-medium tracking-tight text-white">{scenario.object}</div>
                </div>
                <div className="rounded-full border border-amber-300/16 bg-amber-300/8 px-3 py-1 text-sm text-amber-100">
                  {scenario.amount}
                </div>
              </div>

              <div className="mt-5 inline-flex rounded-full border border-white/10 bg-white/[0.04] p-1">
                {displayStages.map((item, index) => (
                  <div
                    key={item}
                    className={`rounded-full px-3 py-1.5 text-xs uppercase tracking-[0.2em] transition ${
                      stageIndex === index ? "bg-white text-slate-950" : "text-stone-400"
                    }`}
                  >
                    {item}
                  </div>
                ))}
              </div>

              <div className="mt-5 grid gap-3">
                <BoardRow title="1. Work starts" body={scenario.work} active={stageIndex >= 0} />
                <BoardRow title="2. A next step is owed" body={scenario.duty} active={stageIndex >= 1} />
                <BoardRow title="3. Someone has to move it" body={scenario.action} active={stageIndex >= 2} />
                <BoardRow title="4. Proof stays" body={scenario.proof} active={stageIndex >= 3} />
                <FlowRail stage={stageIndex} />
              </div>

              <div className="mt-5 rounded-[22px] border border-rose-300/16 bg-rose-300/8 p-4">
                <div className="text-[10px] uppercase tracking-[0.24em] text-rose-100/70">What usually goes wrong</div>
                <div className="mt-2 text-sm leading-6 text-stone-200">{scenario.leak}</div>
              </div>

              <div className="mt-3 rounded-[22px] border border-emerald-300/16 bg-emerald-300/8 p-4">
                <div className="text-[10px] uppercase tracking-[0.24em] text-emerald-100/70">What AutoKirk changes</div>
                <div className="mt-2 text-sm leading-6 text-stone-200">{scenario.result}</div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <ContrastPanel
            eyebrow="Without AutoKirk"
            title="The work happened. The money got harder to see."
            items={[
              "Teams finish the work, but nobody owns the follow-through.",
              "A payment lands, but delivery, confirmation, or collection drifts.",
              "People say it was handled, but there is nothing solid to show later.",
            ]}
            tone="bad"
          />
          <ContrastPanel
            eyebrow="With AutoKirk"
            title="The path stays visible until someone closes it."
            items={[
              "Every revenue-linked movement opens visible duty.",
              "The next move has an owner instead of a guess.",
              "If it was finished, there is proof that stays with the business.",
            ]}
            tone="good"
          />
        </section>

        <section className="rounded-[36px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.03))] p-7 sm:p-8">
          <div className="max-w-3xl">
            <div className="text-[10px] uppercase tracking-[0.28em] text-stone-500">What AutoKirk actually does</div>
            <h2 className="mt-4 font-[var(--font-display)] text-4xl leading-none text-[#fff7ea] sm:text-5xl">
              It is not another dashboard.
              <span className="block text-[#91e2ff]">It makes the follow-through visible.</span>
            </h2>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-4">
            {HOW_IT_WORKS.map((item) => (
              <HowCard key={item.title} title={item.title} body={item.body} icon={item.icon} />
            ))}
          </div>
        </section>

        <section className="space-y-6">
          <div className="max-w-4xl">
            <div className="text-[10px] uppercase tracking-[0.28em] text-stone-500">How the machine is built</div>
            <h2 className="mt-4 font-[var(--font-display)] text-4xl leading-none text-[#fff7ea] sm:text-5xl">
              Kernel first. Watchdog next. Learning after proof.
            </h2>
            <p className="mt-4 text-base leading-7 text-stone-300">
              AutoKirk is not one loose stack of screens. The Kernel holds truth. Watchdog watches committed truth for risk and lag.
              Learning studies receipts and outcomes to improve judgment without getting mutation authority.
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {SYSTEM_LAYERS.map((layer) => (
              <div key={layer.name} className="rounded-[24px] border border-white/10 bg-[#0d151c] p-5">
                <div className="text-[10px] uppercase tracking-[0.24em] text-stone-500">{layer.name}</div>
                <div className="mt-4 text-2xl font-medium text-white">{layer.name}</div>
                <div className="mt-2 text-sm leading-6 text-stone-400">{layer.body}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-6">
          <div className="max-w-3xl">
            <div className="text-[10px] uppercase tracking-[0.28em] text-stone-500">Where this matters</div>
            <h2 className="mt-4 font-[var(--font-display)] text-4xl leading-none text-[#fff7ea] sm:text-5xl">
              Anywhere money movement creates responsibility.
            </h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {SECTORS.map(([name, body, Icon]) => (
              <div key={name} className="rounded-[24px] border border-white/10 bg-[#0d151c] p-5">
                <div className="flex items-center justify-between gap-3">
                  <Icon className="h-5 w-5 text-[#98ecff]" />
                  <div className="rounded-full border border-white/10 bg-[#0a1015] px-3 py-1 text-[10px] uppercase tracking-[0.24em] text-stone-500">
                    movement
                  </div>
                </div>
                <div className="mt-4 text-xl font-medium text-white">{name}</div>
                <div className="mt-2 text-sm leading-6 text-stone-400">{body}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-6">
          <div className="max-w-4xl">
            <div className="text-[10px] uppercase tracking-[0.28em] text-stone-500">What every company build needs</div>
            <h2 className="mt-4 font-[var(--font-display)] text-4xl leading-none text-[#fff7ea] sm:text-5xl">
              Every AutoKirk category needs the same four things.
            </h2>
            <p className="mt-4 text-base leading-7 text-stone-300">
              The sector changes. The structure does not. Every future company or market face needs clear accountability,
              human oversight, transparency, and fairness built into the experience.
            </p>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            {CATEGORY_ROWS.map((category) => (
              <div key={category.name} className="rounded-[28px] border border-white/10 bg-[#0d151c] p-5">
                <div className="text-2xl font-medium text-white">{category.name}</div>
                <div className="mt-4 grid gap-3">
                  {category.rows.map(([label, body]) => (
                    <div key={label} className="rounded-[18px] border border-white/10 bg-[#0a1015] p-4">
                      <div className="text-[10px] uppercase tracking-[0.24em] text-stone-500">{label}</div>
                      <div className="mt-2 text-sm leading-6 text-stone-200">{body}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[38px] border border-white/10 bg-[linear-gradient(180deg,rgba(145,226,255,0.10),rgba(255,255,255,0.03))] p-7 shadow-[0_30px_90px_rgba(0,0,0,0.28)] sm:p-9">
          <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-end">
            <div>
              <div className="text-[10px] uppercase tracking-[0.28em] text-stone-500">The line that matters</div>
              <h2 className="mt-4 font-[var(--font-display)] text-4xl leading-none text-[#fff7ea] sm:text-6xl">
                If it was finished,
                <span className="block text-[#91e2ff]">you should be able to show it.</span>
              </h2>
              <p className="mt-5 max-w-3xl text-base leading-7 text-stone-200">
                That is the standard AutoKirk brings into a business. Work, money, and follow-through stop drifting apart.
                Start simple or connect live systems right away. Either way, the client gets a clearer business and fewer places
                for money to slip away.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Link href="/login" className="rounded-[24px] bg-white px-5 py-5 text-slate-950 transition hover:translate-y-[-1px]">
                <div className="text-[10px] uppercase tracking-[0.24em] text-slate-600">Operator entry</div>
                <div className="mt-2 text-xl font-semibold">Open the operator side</div>
              </Link>
              <Link href="/founder" className="rounded-[24px] border border-[#f2c47e]/25 bg-[#f2c47e]/10 px-5 py-5 text-[#f5d7a9] transition hover:translate-y-[-1px]">
                <div className="text-[10px] uppercase tracking-[0.24em] text-[#f4d3a4]">Founder control</div>
                <div className="mt-2 text-xl font-semibold">Open founder control</div>
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function QuickPoint({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[22px] border border-white/10 bg-[#0d151c] p-4">
      <div className="text-lg font-medium text-white">{title}</div>
      <div className="mt-2 text-sm leading-6 text-stone-400">{body}</div>
    </div>
  );
}

function BoardRow({
  title,
  body,
  active,
}: {
  title: string;
  body: string;
  active: boolean;
}) {
  return (
    <div className={`rounded-[22px] border border-white/10 bg-[#0d1721] p-4 transition duration-500 ${active ? "opacity-100 shadow-[0_0_26px_rgba(145,226,255,0.06)]" : "opacity-45"}`}>
      <div className="text-[10px] uppercase tracking-[0.24em] text-stone-500">{title}</div>
      <div className="mt-2 text-sm leading-6 text-stone-200">{body}</div>
    </div>
  );
}

function FlowRail({ stage }: { stage: number }) {
  const widths = ["18%", "44%", "72%", "100%"] as const;

  return (
    <div className="rounded-[22px] border border-white/10 bg-[#0a1015] px-4 py-4">
      <div className="relative h-3 rounded-full bg-white/5">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-[linear-gradient(90deg,#f2c47e,#91e2ff,#92efc1)] transition-all duration-700"
          style={{ width: widths[stage] }}
        />
        <div
          className="absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full border border-white/20 bg-[#fff7ea] shadow-[0_0_20px_rgba(255,247,234,0.75)] transition-all duration-700"
          style={{ left: `calc(${widths[stage]} - 10px)` }}
        />
      </div>
    </div>
  );
}

function ContrastPanel({
  eyebrow,
  title,
  items,
  tone,
}: {
  eyebrow: string;
  title: string;
  items: string[];
  tone: "bad" | "good";
}) {
  const theme =
    tone === "good"
      ? "border-emerald-300/16 bg-emerald-300/8"
      : "border-rose-300/16 bg-rose-300/8";

  return (
    <div className={`rounded-[34px] border p-6 ${theme}`}>
      <div className="text-[10px] uppercase tracking-[0.28em] text-stone-500">{eyebrow}</div>
      <div className="mt-3 font-[var(--font-display)] text-4xl leading-none text-[#fff7ea]">{title}</div>
      <div className="mt-5 space-y-3">
        {items.map((item) => (
          <div key={item} className="rounded-[20px] border border-white/10 bg-[#0c151d] px-4 py-4 text-sm leading-6 text-stone-200">
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

function HowCard({
  title,
  body,
  icon: Icon,
}: {
  title: string;
  body: string;
  icon: typeof Wallet;
}) {
  return (
    <div className="rounded-[22px] border border-white/10 bg-[#0d151c] p-5">
      <Icon className="h-5 w-5 text-[#98ecff]" />
      <div className="mt-4 text-xl font-medium text-white">{title}</div>
      <div className="mt-2 text-sm leading-6 text-stone-400">{body}</div>
    </div>
  );
}

function playTone(audioCtxRef: React.MutableRefObject<AudioContext | null>, stage: number) {
  if (typeof window === "undefined") return;

  const AudioCtor =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!AudioCtor) return;

  const ctx = audioCtxRef.current ?? new AudioCtor();
  audioCtxRef.current = ctx;

  if (ctx.state === "suspended") {
    void ctx.resume();
  }

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = stage === 3 ? "sine" : "triangle";
  osc.frequency.value = [210, 290, 360, 510][stage] ?? 280;
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(stage === 3 ? 0.04 : 0.02, ctx.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.2);
}
