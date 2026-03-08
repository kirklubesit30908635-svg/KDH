"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/supabaseBrowser";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/command`,
      },
    });

    setLoading(false);
    if (err) {
      setError(err.message);
    } else {
      setSent(true);
    }
  }

  return (
    <main className="min-h-screen bg-black text-zinc-100 flex items-center justify-center px-6">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute -top-40 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-indigo-700/10 blur-3xl" />
        <div className="absolute bottom-10 right-10 h-[400px] w-[400px] rounded-full bg-purple-600/8 blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">
        <div className="mb-8">
          <p className="text-[#caa84a] text-xs tracking-[0.24em] mb-3">
            AUTOKIRK OPERATOR CONSOLE
          </p>
          <h1 className="text-3xl font-semibold text-zinc-100">
            Operator Access
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            Enter your email to receive a magic link. No password required.
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/40 p-6 backdrop-blur">
          {sent ? (
            <div className="text-center py-4">
              <div className="text-[#caa84a] text-2xl mb-3">✓</div>
              <p className="text-zinc-100 font-semibold">Check your email</p>
              <p className="mt-2 text-sm text-zinc-400">
                Magic link sent to <span className="text-zinc-200">{email}</span>.
                Click the link to access the console.
              </p>
              <button
                onClick={() => { setSent(false); setEmail(""); }}
                className="mt-4 text-xs text-zinc-500 hover:text-zinc-300 underline"
              >
                Send to a different email
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs tracking-[0.14em] text-zinc-400 mb-2">
                  EMAIL ADDRESS
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="operator@autokirk.com"
                  className="w-full rounded-xl bg-zinc-900 border border-white/10 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-[#caa84a]/40 transition"
                />
              </div>

              {error && (
                <p className="text-red-400 text-xs">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading || !email}
                className="w-full rounded-xl bg-[#caa84a] text-black px-4 py-3 text-sm font-semibold hover:bg-[#d7b65a] transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Sending…" : "Send Magic Link →"}
              </button>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-zinc-600">
          Authority lives in the Core. UI is routing only.
        </p>
      </div>
    </main>
  );
}
