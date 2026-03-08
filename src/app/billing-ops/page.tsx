import Link from "next/link";

export default function BillingOpsPage() {
  return (
    <main className="min-h-screen bg-black text-zinc-100">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute -top-40 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-indigo-700/10 blur-3xl" />
        <div className="absolute bottom-10 right-10 h-[400px] w-[400px] rounded-full bg-purple-600/8 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-6xl px-6 py-16">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <p className="text-[#caa84a] text-xs tracking-[0.24em]">FACE 001</p>
          <Link href="/" className="text-xs text-zinc-500 hover:text-zinc-300 transition">
            ← Console
          </Link>
        </div>
        <h1 className="text-4xl font-semibold text-zinc-100 mb-2">
          Billing Enforcement
        </h1>
        <p className="text-sm text-zinc-400 mb-8">
          Stripe intake → obligations → closure → receipts
        </p>

        {/* Paused Banner */}
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 px-6 py-5 mb-10">
          <div className="flex items-center gap-3">
            <div className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
            <p className="text-sm font-semibold text-amber-300 tracking-wide">
              EXECUTION RUNNER PAUSED
            </p>
          </div>
          <p className="mt-2 text-sm text-zinc-400">
            The billing execution runner is not active. Stripe events are being
            ingested but obligation creation and automated closure are suspended.
            Manual review required.
          </p>
        </div>

        {/* Pipeline */}
        <div className="grid gap-4 md:grid-cols-4 mb-10">
          {[
            { label: "Stripe Intake", desc: "Raw events → api.ingest_stripe_event", status: "active" },
            { label: "Obligations", desc: "core.obligations — billing duties", status: "paused" },
            { label: "Closure", desc: "fn_execute_proposal → receipts", status: "paused" },
            { label: "Receipts", desc: "ak_kernel.receipts — sealed proof", status: "active" },
          ].map((step) => (
            <div
              key={step.label}
              className="rounded-2xl border border-white/10 bg-black/40 p-5 backdrop-blur"
            >
              <div className={[
                "text-[10px] tracking-[0.16em] font-semibold mb-3",
                step.status === "active" ? "text-emerald-400" : "text-amber-400",
              ].join(" ")}>
                {step.status === "active" ? "● ACTIVE" : "⏸ PAUSED"}
              </div>
              <p className="text-sm font-semibold text-zinc-100">{step.label}</p>
              <p className="mt-1 text-xs text-zinc-500">{step.desc}</p>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="rounded-2xl border border-white/10 bg-black/40 p-6 backdrop-blur">
          <p className="text-xs tracking-[0.18em] text-zinc-400 mb-4">QUICK NAVIGATION</p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/receipts"
              className="rounded-xl bg-[#caa84a] text-black px-4 py-2.5 text-sm font-semibold hover:bg-[#d7b65a] transition"
            >
              View Receipts →
            </Link>
            <Link
              href="/command"
              className="rounded-xl bg-zinc-800 text-zinc-200 px-4 py-2.5 text-sm font-semibold hover:bg-zinc-700 transition"
            >
              Command View →
            </Link>
          </div>
        </div>

        <footer className="mt-12 text-xs tracking-wide text-zinc-600">
          Authority lives in the Core. UI is routing only.
        </footer>
      </div>
    </main>
  );
}
