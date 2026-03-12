'use client'

import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-neutral-950 text-white">

      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-5 border-b border-neutral-800 max-w-6xl mx-auto">
        <span className="text-sm font-semibold tracking-widest uppercase">AutoKirk</span>
        <Link href="/login" className="text-sm px-4 py-2 bg-white text-neutral-950 font-semibold rounded hover:bg-neutral-200 transition-colors">
          Sign In
        </Link>
      </nav>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-8 py-24">
        <p className="text-xs font-semibold tracking-widest text-neutral-500 uppercase mb-5">
          Revenue Integrity Operating System
        </p>
        <h1 className="text-5xl sm:text-6xl font-bold leading-[1.1] max-w-3xl mb-7">
          Every dollar earned.<br />Every duty logged.<br />No gaps.
        </h1>
        <p className="text-neutral-400 text-xl max-w-2xl mb-10 leading-relaxed">
          AutoKirk gives automotive dealers a real-time integrity layer — an immutable record of every service event, billing action, and customer obligation so nothing slips through the cracks.
        </p>
        <Link href="/login" className="inline-block px-7 py-3.5 bg-white text-neutral-950 font-semibold rounded hover:bg-neutral-200 transition-colors text-sm">
          Get Access — $50/mo
        </Link>
      </section>

      {/* Problems */}
      <section className="border-t border-neutral-800">
        <div className="max-w-6xl mx-auto px-8 py-20">
          <p className="text-xs font-semibold tracking-widest text-neutral-500 uppercase mb-12">
            The problem AutoKirk solves
          </p>
          <div className="grid sm:grid-cols-3 gap-6">
            {[
              {
                title: "Revenue leaks silently",
                body: "Dealers lose thousands monthly to unbilled labor, skipped warranty claims, and service tickets that close without receipts. No one catches it until month-end — if at all.",
              },
              {
                title: "Operations run on memory",
                body: "Advisors, technicians, and managers operate on tribal knowledge. When a shift changes or someone leaves, obligations disappear. There is no authoritative record of what was promised, started, or finished.",
              },
              {
                title: "Accountability has no proof",
                body: "When a customer disputes a charge or a compliance audit arrives, there is no tamper-evident trail. Logs can be edited. Spreadsheets can be deleted. AutoKirk cannot be rewritten.",
              },
            ].map(({ title, body }) => (
              <div key={title} className="border border-neutral-800 rounded-lg p-6">
                <p className="text-white font-semibold mb-3">{title}</p>
                <p className="text-neutral-400 text-sm leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-neutral-800">
        <div className="max-w-6xl mx-auto px-8 py-20">
          <p className="text-xs font-semibold tracking-widest text-neutral-500 uppercase mb-12">
            How it works
          </p>
          <div className="grid sm:grid-cols-4 gap-6">
            {[
              { n: "01", label: "Event recorded", body: "Every action — service open, repair complete, payment taken — is written as an immutable ledger entry." },
              { n: "02", label: "Receipt required", body: "Each event must close with a cryptographically chained receipt. Open events surface as live alerts." },
              { n: "03", label: "Integrity scored", body: "AutoKirk computes a live closure rate across all active workspaces. You always know where you stand." },
              { n: "04", label: "Proof on demand", body: "Any event, any receipt, any operator action can be retrieved and verified at any time — permanently." },
            ].map(({ n, label, body }) => (
              <div key={n}>
                <p className="text-neutral-600 text-xs font-mono mb-3">{n}</p>
                <p className="text-white font-semibold mb-2">{label}</p>
                <p className="text-neutral-400 text-sm leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Without / With */}
      <section className="border-t border-neutral-800">
        <div className="max-w-6xl mx-auto px-8 py-20">
          <p className="text-xs font-semibold tracking-widest text-neutral-500 uppercase mb-4">
            A real operational moment
          </p>
          <h2 className="text-3xl font-bold mb-12">When proof is missing, revenue risk appears.</h2>
          <div className="grid sm:grid-cols-2 gap-6">
            <div className="border border-red-900/50 bg-red-950/20 rounded-lg p-6">
              <p className="text-xs font-semibold tracking-widest text-red-500 uppercase mb-4">Without AutoKirk</p>
              <ul className="space-y-2 text-neutral-400 text-sm">
                <li>Service performed</li>
                <li>Closure never submitted</li>
                <li>Payout processed anyway</li>
                <li>Revenue leakage discovered later — or never</li>
              </ul>
            </div>
            <div className="border border-green-900/50 bg-green-950/20 rounded-lg p-6">
              <p className="text-xs font-semibold tracking-widest text-green-500 uppercase mb-4">With AutoKirk</p>
              <ul className="space-y-2 text-neutral-400 text-sm">
                <li>Event recorded on service open</li>
                <li>Requirement issued automatically</li>
                <li>Action surfaced to operator</li>
                <li>Receipt verified — integrity preserved</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-neutral-800">
        <div className="max-w-6xl mx-auto px-8 py-20 text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to close the gaps?</h2>
          <p className="text-neutral-400 mb-8">One workspace. Full integrity layer. $50/mo.</p>
          <Link href="/login" className="inline-block px-7 py-3.5 bg-white text-neutral-950 font-semibold rounded hover:bg-neutral-200 transition-colors text-sm">
            Activate Access
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-neutral-800 px-8 py-6 text-center text-neutral-600 text-xs">
        © {new Date().getFullYear()} AutoKirk — Kirk Digital Holdings LLC
      </footer>

    </main>
  );
}
