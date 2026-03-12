"use client";

import { useState } from "react";

export default function SubscribePage() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleActivate() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/stripe/checkout", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      window.location.href = json.url;
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        {/* Wordmark */}
        <div className="mb-10 text-center">
          <div className="inline-flex items-center gap-2 mb-2">
            <div className="h-7 w-7 rounded-md bg-white flex items-center justify-center">
              <span className="text-neutral-950 text-xs font-extrabold tracking-tight">AK</span>
            </div>
            <span className="text-white text-sm font-extrabold tracking-widest">AUTOKIRK</span>
          </div>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8">
          <div className="text-[10px] font-extrabold tracking-[0.28em] text-white/30 mb-3">
            OPERATOR ACCESS
          </div>
          <h1 className="text-2xl font-extrabold text-white leading-tight mb-2">
            AutoKirk Access
          </h1>
          <div className="text-4xl font-extrabold text-white mb-1">
            $50<span className="text-lg font-semibold text-white/40">/mo</span>
          </div>
          <p className="text-sm text-white/40 mb-8 leading-relaxed">
            Full access to the enforcement console — integrity scoring, billing
            enforcement, receipts, and operator registry.
          </p>

          {err && (
            <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {err}
            </div>
          )}

          <button
            onClick={handleActivate}
            disabled={loading}
            className="w-full rounded-xl bg-white px-4 py-3.5 text-sm font-extrabold text-neutral-950 transition hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Redirecting to Stripe…" : "Activate Access →"}
          </button>

          <p className="mt-4 text-center text-[11px] text-white/25">
            Secure checkout via Stripe · Cancel anytime
          </p>
        </div>
      </div>
    </div>
  );
}
