<<<<<<< HEAD
import Link from "next/link";

const faces = [
  {
    code: "FACE 003",
    title: "Dealership Enforcement",
    desc: "Next Actions · Reassurance Search · Daily Check-In",
    href: "/command",
    status: "Operational",
    statusDot: "green" as const,
    cta: "Enter Face",
  },
  {
    code: "FACE 001",
    title: "Billing Enforcement",
    desc: "Stripe intake → obligations → closure → receipts",
    href: "/billing-ops",
    status: "Operational",
    statusDot: "green" as const,
    cta: "Enter Face",
  },
  {
    code: "FACE 004",
    title: "Advertising Enforcement",
    desc: "Spend → Lead → Follow-Up → Sale → Margin → Renewal Gate",
    href: "/advertising",
    status: "Operational",
    statusDot: "green" as const,
    cta: "Enter Face",
  },
  {
    code: "PROOF LAYER",
    title: "Receipts",
    desc: "Institutional proof — every sealed obligation leaves a receipt.",
    href: "/receipts",
    status: "Append-Only",
    statusDot: "gold" as const,
    cta: "View Receipts",
  },
];

const intelligence = {
  code: "SYSTEM INTELLIGENCE",
  title: "Integrity",
  desc: "Integrity Score · Closure Rate · Breach Rate · Revenue Leakage — the single number that cannot lie.",
  href: "/integrity",
  status: "Live",
  statusDot: "gold" as const,
  cta: "View Integrity Score",
};

const statusDotCls = {
  green: "bg-emerald-400",
  amber: "bg-amber-400",
  gold: "bg-[#d6b24a]",
  blue: "bg-blue-400",
};

export default function Home() {
  return (
    <main className="min-h-screen bg-black text-zinc-100">
      {/* atmosphere */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[600px] w-[900px] -translate-x-1/2 rounded-full bg-[#6b4e12]/12 blur-3xl" />
        <div className="absolute top-60 -left-20 h-[500px] w-[500px] rounded-full bg-indigo-600/8 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-[500px] w-[500px] rounded-full bg-purple-600/8 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-6xl px-6 py-16">
        {/* header */}
        <div className="text-xs font-extrabold tracking-[0.32em] text-[#d6b24a]/80">
          AUTOKIRK OPERATOR CONSOLE
        </div>

        {/* hero */}
        <div className="mt-8 max-w-2xl">
          <h1 className="text-6xl font-extrabold leading-[1.02] text-[#d6b24a] drop-shadow-[0_0_40px_rgba(214,178,74,0.15)]">
            Surface Simplicity.
            <br />
            Core Ruthlessness.
          </h1>
          <p className="mt-5 text-base leading-relaxed text-zinc-400">
            This UI does not govern. It routes you into governed execution.{" "}
            <span className="text-zinc-300 font-semibold">
              If it isn't written here, it didn't happen.
            </span>
          </p>
        </div>

        {/* rule */}
        <div className="mt-10 h-px bg-gradient-to-r from-[#d6b24a]/20 via-[#d6b24a]/5 to-transparent" />

        {/* Integrity — full-width anchor */}
        <div className="mt-10">
          <div className="text-[10px] font-extrabold tracking-[0.28em] text-zinc-600 mb-3">
            SYSTEM INTELLIGENCE
          </div>
          <Link href={intelligence.href} className="group block">
            <FaceCard f={intelligence} interactive fullWidth />
          </Link>
        </div>

        {/* face grid */}
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          {faces.map((f) => (
            <Link key={f.title} href={f.href} className="group block">
              <FaceCard f={f} interactive />
            </Link>
          ))}
        </div>

        {/* login strip */}
        <div className="mt-8 flex items-center justify-between rounded-2xl border border-[#2a2516] bg-[#070707]/80 px-6 py-4 backdrop-blur-sm">
          <div>
            <div className="text-xs font-extrabold tracking-[0.22em] text-zinc-500">
              OPERATOR ACCESS
            </div>
            <div className="mt-1 text-sm font-semibold text-zinc-200">
              Supabase magic-link — access controlled
            </div>
          </div>
          <Link
            href="/login"
            className="rounded-xl bg-[#d6b24a] px-5 py-2.5 text-sm font-extrabold text-black hover:brightness-105 transition"
          >
            Authenticate →
          </Link>
        </div>

        <footer className="mt-10 text-xs tracking-wide text-zinc-600">
          Authority lives in the Core. UI is routing only.
        </footer>
      </div>
    </main>
  );
}

function FaceCard({
  f,
  interactive,
  fullWidth,
}: {
  f: (typeof faces)[0] | typeof intelligence;
  interactive?: boolean;
  fullWidth?: boolean;
}) {
  return (
    <div
      className={[
        "rounded-2xl border bg-[#070707]/90 backdrop-blur-sm",
        fullWidth
          ? "border-[#3a2f12] p-6 shadow-[0_0_0_1px_rgba(214,178,74,0.12),0_18px_60px_rgba(0,0,0,0.5)]"
          : "border-[#2a2516] p-6 shadow-[0_0_0_1px_rgba(214,178,74,0.06),0_18px_60px_rgba(0,0,0,0.5)]",
        interactive && fullWidth
          ? "transition-all duration-200 group-hover:border-[#d6b24a]/50 group-hover:shadow-[0_0_0_1px_rgba(214,178,74,0.22),0_0_60px_rgba(214,178,74,0.06),0_24px_80px_rgba(0,0,0,0.6)]"
          : interactive
          ? "transition-all duration-200 group-hover:border-[#d6b24a]/30 group-hover:shadow-[0_0_0_1px_rgba(214,178,74,0.14),0_24px_80px_rgba(0,0,0,0.6)]"
          : "",
      ].join(" ")}
    >
      {/* top row */}
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-full border border-[#3a2f12] bg-[#0d0a03] px-2.5 py-1 text-[10px] font-extrabold tracking-widest text-[#d6b24a]">
          {f.code}
        </span>
        <div className="flex items-center gap-2">
          <div
            className={[
              "h-1.5 w-1.5 rounded-full",
              statusDotCls[f.statusDot],
            ].join(" ")}
          />
          <span className="text-[11px] tracking-[0.14em] text-zinc-500">
            {f.status}
          </span>
        </div>
      </div>

      {/* title + desc */}
      <div className="mt-5">
        <div className="text-xl font-extrabold text-zinc-100 leading-snug">
          {f.title}
        </div>
        <div className="mt-2 text-sm leading-relaxed text-zinc-400">{f.desc}</div>
      </div>

      {/* rule */}
      <div className="my-5 h-px bg-[#2a2516]" />

      {/* CTA */}
      <div
        className={[
          "flex w-full items-center justify-between rounded-xl px-4 py-3 text-sm font-extrabold transition",
          interactive
            ? "bg-[#d6b24a] text-black group-hover:brightness-105"
            : "bg-zinc-800 text-zinc-500",
        ].join(" ")}
      >
        <span>{f.cta}</span>
        <span>→</span>
      </div>
    </div>
  );
=======
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/command");
>>>>>>> origin/claude/launch-osm-salesman-We0vX
}
