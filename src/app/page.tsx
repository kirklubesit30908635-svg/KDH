'use client'

import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-neutral-950 text-white flex flex-col">

      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-5 border-b border-neutral-800">
        <span className="text-sm font-semibold tracking-widest text-white uppercase">AutoKirk</span>
        <Link
          href="/login"
          className="text-sm px-4 py-2 bg-white text-neutral-950 font-semibold rounded hover:bg-neutral-200 transition-colors"
        >
          Sign In
        </Link>
      </nav>

      {/* Hero */}
      <section className="flex flex-col items-center justify-center text-center px-6 py-28 flex-1">
        <p className="text-xs font-semibold tracking-widest text-neutral-500 uppercase mb-4">
          Revenue Integrity Operating System
        </p>
        <h1 className="text-4xl sm:text-5xl font-bold leading-tight max-w-2xl mb-6">
          Every dollar earned. Every duty logged. No gaps.
        </h1>
        <p className="text-neutral-400 text-lg max-w-xl mb-10">
          AutoKirk gives automotive dealers a real-time integrity layer — an immutable record of every service event, billing action, and customer obligation so nothing slips through the cracks.
        </p>
        <Link
          href="/login"
          className="px-6 py-3 bg-white text-neutral-950 font-semibold rounded hover:bg-neutral-200 transition-colors"
        >
          Get Access — $50/mo
        </Link>
      </section>

      {/* Problems */}
      <section className="border-t border-neutral-800 px-8 py-20 max-w-5xl mx-auto w-full">
        <h2 className="text-xs font-semibold tracking-widest text-neutral-500 uppercase mb-10">
          The problem AutoKirk solves
        </h2>
        <div className="grid sm:grid-cols-3 gap-8">
          <div>
            <p className="text-white font-semibold mb-2">Revenue leaks silently</p>
            <p className="text-neutral-400 text-sm leading-relaxed">
              Dealers lose thousands monthly to unbilled labor, skipped warranty claims, and service tickets that close without receipts. No one catches it until the month-end audit — if at all.
            </p>
          </div>
          <div>
            <p className="text-white font-semibold mb-2">Operations run on memory</p>
            <p className="text-neutral-400 text-sm leading-relaxed">
              Service advisors, technicians, and managers operate on tribal knowledge. When someone leaves or a shift changes, obligations disappear. There is no authoritative record of what was promised, started, or finished.
            </p>
          </div>
          <div>
            <p className="text-white font-semibold mb-2">Accountability has no proof</p>
            <p className="text-neutral-400 text-sm leading-relaxed">
              When a customer disputes a charge or a compliance audit arrives, there is no tamper-evident trail. Logs can be edited. Spreadsheets can be deleted. AutoKirk cannot be rewritten.
            </p>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-neutral-800 px-8 py-20 max-w-5xl mx-auto w-full">
        <h2 className="text-xs font-semibold tracking-widest text-neutral-500 uppercase mb-10">
          How it works
        </h2>
        <div className="grid sm:grid-cols-4 gap-8">
          {[
            { step: "01", label: "Event recorded", body: "Every action — service open, repair complete, payment taken — is written as an immutable event." },
            { step: "02", label: "Receipt issued", body: "Each event must close with a cryptographically chained receipt. Open events surface as alerts." },
            { step: "03", label: "Integrity scored", body: "AutoKirk computes a live closure rate across all active workspaces. You always know where you stand." },
            { step: "04", label: "Proof on demand", body: "Any event, any receipt, any operator action can be retrieved and verified at any time." },
          ].map(({ step, label, body }) => (
            <div key={step}>
              <p className="text-neutral-600 text-xs font-mono mb-2">{step}</p>
              <p className="text-white font-semibold mb-2">{label}</p>
              <p className="text-neutral-400 text-sm leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-neutral-800 px-8 py-20 text-center">
        <h2 className="text-2xl font-bold mb-4">Ready to close the gaps?</h2>
        <p className="text-neutral-400 mb-8">One workspace. Full integrity layer. $50/mo.</p>
        <Link
          href="/login"
          className="px-6 py-3 bg-white text-neutral-950 font-semibold rounded hover:bg-neutral-200 transition-colors"
        >
          Activate Access
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t border-neutral-800 px-8 py-6 text-center text-neutral-600 text-xs">
        © {new Date().getFullYear()} AutoKirk — Kirk Digital Holdings LLC
      </footer>

    </main>
  );
}
