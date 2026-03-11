"use client";

import { useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/supabaseBrowser";
import { ShieldCheck, Activity, Receipt, CheckCircle2 } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail]     = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent]       = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const supabase = createBrowserSupabaseClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error: otpErr } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: "https://autokirk.com/auth/callback" },
    });
    setLoading(false);
    if (otpErr) { setError(otpErr.message); } else { setSent(true); }
  }

  const statCards = [
    { label: "Integrity Score", value: "100", sub: "Governance clean", icon: ShieldCheck, fill: "100%" },
    { label: "Breach Rate", value: "0%", sub: "Zero overdue", icon: Activity, fill: "100%" },
    { label: "Sealed Receipts", value: "43+", sub: "SHA-256 fingerprinted", icon: Receipt, fill: "100%" },
    { label: "Direct Mutations", value: "0", sub: "Client never writes core", icon: CheckCircle2, fill: "0%" },
  ];

  return (
    <div className="min-h-screen overflow-hidden bg-neutral-950 text-white">
      {/* Subtle radial glow */}
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[44rem] bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.1),transparent_50%)]" />

      {/* Top bar — matches homepage header style */}
      <header className="border-b border-white/10 bg-neutral-950/80 backdrop-blur-xl">
        <div className="flex items-center justify-between px-6 py-4">
          <a href="/" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-xs font-semibold tracking-[0.22em]">
              AK
            </div>
            <div>
              <div className="text-sm font-semibold tracking-[0.26em] text-white/80">AUTOKIRK</div>
              <div className="text-[10px] text-white/40">Revenue Integrity Operating Layer</div>
            </div>
          </a>
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            <span className="text-[10px] uppercase tracking-[0.18em] text-white/45">Kernel live</span>
          </div>
        </div>
      </header>

      {/* Split layout */}
      <div className="grid min-h-[calc(100vh-53px)] lg:grid-cols-[1fr_420px]">

        {/* LEFT — Brand + stat cards */}
        <div className="relative flex flex-col justify-center overflow-hidden border-r border-white/10 px-10 py-16 lg:px-16">
          {/* Animated grid pattern */}
          <div className="pointer-events-none absolute inset-0 opacity-[0.025]"
            style={{
              backgroundImage: "linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)",
              backgroundSize: "48px 48px",
            }}
          />

          <div className="relative z-10">
            <div className="text-[10px] uppercase tracking-[0.3em] text-white/38 mb-4">
              Enforcement Operating System
            </div>
            <h1 className="text-5xl font-semibold tracking-tight text-white sm:text-6xl lg:text-7xl leading-[0.9] mb-2">
              AUTO<br />KIRK
            </h1>
            <div className="text-xs uppercase tracking-[0.25em] text-white/35 mb-8">
              // Kernel v1.0
            </div>
            <p className="max-w-md text-sm leading-7 text-white/55 mb-12">
              Every business action flows through the{" "}
              <span className="text-white/80 font-medium">proposal → approval → execution → receipt</span>{" "}
              chain. Append-only ledger. SHA-256 fingerprinted.{" "}
              <span className="text-white/80 font-medium">No shortcuts. No hiding.</span>
            </p>

            {/* Bento stat grid */}
            <div className="grid grid-cols-2 gap-3 max-w-[480px]">
              {statCards.map(({ label, value, sub, icon: Icon, fill }) => (
                <div key={label} className="rounded-[1.4rem] border border-white/10 bg-white/[0.03] p-5 relative overflow-hidden group transition hover:border-white/20 hover:bg-white/[0.05]">
                  <div className="flex items-start justify-between mb-3">
                    <div className="text-[9px] uppercase tracking-[0.22em] text-white/35">{label}</div>
                    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-1.5 text-white/40">
                      <Icon className="h-3 w-3" />
                    </div>
                  </div>
                  <div className="text-3xl font-semibold text-white mb-1">{value}</div>
                  <div className="text-[10px] text-white/35 uppercase tracking-[0.1em] mb-3">{sub}</div>
                  <div className="h-px rounded-full bg-white/10 overflow-hidden">
                    <div className="h-full rounded-full bg-white/60 transition-all" style={{ width: fill }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT — Login form */}
        <div className="flex flex-col justify-center px-10 py-16 bg-white/[0.015] backdrop-blur-sm lg:px-12">
          {sent ? (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-[10px] uppercase tracking-[0.2em] text-emerald-300">
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Link dispatched
              </div>
              <h2 className="text-4xl font-semibold tracking-tight text-white mb-4 leading-tight">
                Check your<br />email.
              </h2>
              <p className="text-sm leading-7 text-white/55 mb-8">
                Sign-in link sent to{" "}
                <span className="text-white font-medium">{email}</span>.<br />
                Click it to enter the operator console.<br />
                Link expires in 1 hour.
              </p>
              <button
                className="text-[10px] uppercase tracking-[0.2em] text-white/35 transition hover:text-white/70"
                onClick={() => { setSent(false); setEmail(""); }}
              >
                ← Use a different email
              </button>
            </div>
          ) : (
            <>
              <div className="mb-8">
                <div className="text-[9px] uppercase tracking-[0.3em] text-white/35 mb-4">
                  // Operator sign-in
                </div>
                <h2 className="text-4xl font-semibold tracking-tight text-white mb-3 leading-tight">
                  Access the<br />console.
                </h2>
                <p className="text-sm leading-6 text-white/50">
                  Enter your email — a sign-in link will be dispatched instantly.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                {error && (
                  <div className="rounded-2xl border border-red-400/20 bg-red-400/5 px-4 py-3 text-sm text-red-300">
                    {error}
                  </div>
                )}

                <div>
                  <label className="block text-[9px] uppercase tracking-[0.25em] text-white/38 mb-3">
                    Email address
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="operator@autokirk.com"
                    required
                    autoFocus
                    className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white placeholder-white/25 outline-none transition focus:border-white/30 focus:bg-white/[0.06] focus:ring-0"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-2xl bg-white px-6 py-3.5 text-sm font-semibold text-neutral-950 transition hover:scale-[1.01] hover:shadow-[0_16px_48px_rgba(255,255,255,0.15)] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                >
                  {loading ? "Dispatching…" : "Send sign-in link →"}
                </button>
              </form>

              <div className="mt-8 flex items-center gap-5">
                <div className="flex items-center gap-1.5">
                  <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  <span className="text-[9px] uppercase tracking-[0.12em] text-white/30">Secure</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  <span className="text-[9px] uppercase tracking-[0.12em] text-white/30">No password</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-1.5 w-1.5 rounded-full bg-white/20" />
                  <span className="text-[9px] uppercase tracking-[0.12em] text-white/30">Operator only</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
