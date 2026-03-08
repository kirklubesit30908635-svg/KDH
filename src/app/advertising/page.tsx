import Link from "next/link";

export default function AdvertisingPage() {
  const pipeline = [
    { label: "Spend", desc: "Ad spend ingestion + budget tracking" },
    { label: "Lead", desc: "Inbound lead capture + attribution" },
    { label: "Follow-Up", desc: "Contact cadence + obligation gates" },
    { label: "Sale", desc: "Closed deal → receipt proof" },
    { label: "Margin", desc: "Cost-per-lead vs margin contribution" },
    { label: "Renewal Gate", desc: "Recurring revenue obligation closure" },
  ];

  return (
    <main className="min-h-screen bg-black text-zinc-100">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute -top-40 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-indigo-700/10 blur-3xl" />
        <div className="absolute bottom-10 left-10 h-[400px] w-[400px] rounded-full bg-purple-600/8 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-6xl px-6 py-16">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <p className="text-[#caa84a] text-xs tracking-[0.24em]">FACE · ADVERTISING</p>
          <Link href="/" className="text-xs text-zinc-500 hover:text-zinc-300 transition">
            ← Console
          </Link>
        </div>
        <h1 className="text-4xl font-semibold text-zinc-100 mb-2">
          Advertising Enforcement
        </h1>
        <p className="text-sm text-zinc-400 mb-8">
          Spend → Lead → Follow-Up → Sale → Margin → Renewal Gate
        </p>

        {/* Status */}
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-6 py-4 mb-10 flex items-center gap-3">
          <div className="h-2 w-2 rounded-full bg-emerald-400" />
          <p className="text-sm text-emerald-300 font-semibold tracking-wide">OPERATIONAL</p>
          <p className="text-sm text-zinc-400 ml-2">Advertising enforcement pipeline is active.</p>
        </div>

        {/* Pipeline */}
        <div className="mb-10">
          <p className="text-xs tracking-[0.18em] text-zinc-400 mb-4">ENFORCEMENT PIPELINE</p>
          <div className="grid gap-4 md:grid-cols-3">
            {pipeline.map((step, i) => (
              <div
                key={step.label}
                className="rounded-2xl border border-white/10 bg-black/40 p-5 backdrop-blur"
              >
                <div className="text-[10px] tracking-[0.16em] text-zinc-600 mb-2">
                  STEP {String(i + 1).padStart(2, "0")}
                </div>
                <p className="text-sm font-semibold text-zinc-100">{step.label}</p>
                <p className="mt-1 text-xs text-zinc-500">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Obligations placeholder */}
        <div className="rounded-2xl border border-white/10 bg-black/40 p-6 backdrop-blur mb-6">
          <p className="text-xs tracking-[0.18em] text-zinc-400 mb-4">ACTIVE OBLIGATIONS</p>
          <p className="text-sm text-zinc-500 italic">
            Advertising obligations will appear here once connected to{" "}
            <code className="text-zinc-400 bg-zinc-900 px-1.5 py-0.5 rounded text-xs">
              core.v_next_actions
            </code>{" "}
            with <code className="text-zinc-400 bg-zinc-900 px-1.5 py-0.5 rounded text-xs">face = &apos;advertising&apos;</code>.
          </p>
        </div>

        {/* Quick Nav */}
        <div className="flex flex-wrap gap-3">
          <Link
            href="/command"
            className="rounded-xl bg-[#caa84a] text-black px-4 py-2.5 text-sm font-semibold hover:bg-[#d7b65a] transition"
          >
            Command View →
          </Link>
          <Link
            href="/receipts"
            className="rounded-xl bg-zinc-800 text-zinc-200 px-4 py-2.5 text-sm font-semibold hover:bg-zinc-700 transition"
          >
            View Receipts →
          </Link>
        </div>

        <footer className="mt-12 text-xs tracking-wide text-zinc-600">
          Authority lives in the Core. UI is routing only.
        </footer>
      </div>
    </main>
  );
}
