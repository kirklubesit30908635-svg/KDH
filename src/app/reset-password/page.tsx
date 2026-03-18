"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, KeyRound, ShieldCheck } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/supabaseBrowser";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const supabase = createBrowserSupabaseClient();

  async function handleReset(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setDone(true);
    window.setTimeout(() => router.push("/command"), 1800);
  }

  return (
    <div className="min-h-screen bg-[#050816] px-4 py-10 text-slate-100">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-[-10%] top-[12%] h-72 w-72 rounded-full bg-cyan-300/10 blur-3xl" />
        <div className="absolute right-[-6%] top-[20%] h-80 w-80 rounded-full bg-emerald-300/10 blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-[calc(100vh-5rem)] max-w-5xl items-center justify-center">
        <div className="grid w-full gap-6 lg:grid-cols-[1.08fr_0.92fr]">
          <div className="rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-8 shadow-[0_30px_90px_rgba(0,0,0,0.34)]">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/15 bg-cyan-300/10 px-3 py-1 text-xs uppercase tracking-[0.22em] text-cyan-100">
              <ShieldCheck className="h-3.5 w-3.5" />
              Auth membrane
            </div>

            <h1 className="mt-6 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Reset the operator credential.
            </h1>

            <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300">
              This keeps the operator identity inside the governed access path. Once the password is updated, AutoKirk will send
              you back into the command lane.
            </p>

            <div className="mt-8 space-y-3">
              <DoctrineCard
                label="Identity first"
                body="Access changes stay attached to the operator account before any governed surface opens."
              />
              <DoctrineCard
                label="Route continuity"
                body="The auth callback returns the operator to the same working system rather than dropping them into a dead end."
              />
              <DoctrineCard
                label="Operational return"
                body="Successful reset hands control back to command so open duty does not get stranded behind auth work."
              />
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-8">
            {done ? (
              <div className="flex h-full flex-col justify-center">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-300/20 bg-emerald-300/10">
                  <CheckCircle2 className="h-6 w-6 text-emerald-200" />
                </div>
                <h2 className="mt-6 text-3xl font-semibold tracking-tight text-white">Password updated</h2>
                <p className="mt-3 text-sm leading-6 text-slate-400">
                  Redirecting you back into the command surface now.
                </p>
              </div>
            ) : (
              <>
                <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-slate-500">
                  <KeyRound className="h-3.5 w-3.5" />
                  Operator credential reset
                </div>
                <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white">Set a new password</h2>
                <p className="mt-3 text-sm leading-6 text-slate-400">
                  Choose a password for the operator account that just passed through the recovery flow.
                </p>

                <form onSubmit={handleReset} className="mt-6 space-y-4">
                  <Field label="New password">
                    <input
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="At least 8 characters"
                      required
                      autoFocus
                      className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/25 focus:bg-white/[0.06]"
                    />
                  </Field>

                  <Field label="Confirm password">
                    <input
                      type="password"
                      value={confirm}
                      onChange={(event) => setConfirm(event.target.value)}
                      placeholder="Repeat the password"
                      required
                      className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/25 focus:bg-white/[0.06]"
                    />
                  </Field>

                  {error ? (
                    <div className="rounded-2xl border border-rose-300/15 bg-rose-300/10 px-4 py-3 text-sm text-rose-100">
                      {error}
                    </div>
                  ) : null}

                  <button
                    type="submit"
                    disabled={loading}
                    className="inline-flex w-full items-center justify-center rounded-2xl bg-white px-4 py-3.5 text-sm font-semibold text-slate-950 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:bg-white/15 disabled:text-white/35"
                  >
                    {loading ? "Saving password..." : "Set password"}
                  </button>
                </form>

                <Link
                  href="/login"
                  className="mt-5 inline-flex text-sm text-slate-400 transition hover:text-white"
                >
                  Return to operator entry →
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DoctrineCard({ label, body }: { label: string; body: string }) {
  return (
    <div className="rounded-[1.4rem] border border-white/10 bg-[#080f18] p-4">
      <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">{label}</div>
      <div className="mt-3 text-sm leading-6 text-slate-300">{body}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-2 text-[10px] uppercase tracking-[0.22em] text-slate-500">{label}</div>
      {children}
    </label>
  );
}
