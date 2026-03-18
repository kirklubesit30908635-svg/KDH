"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, CreditCard, LogIn, ShieldCheck } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/supabaseBrowser";

function normalizeAppPath(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/command";
  }

  return value;
}

export default function SubscribePage() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [operatorEmail, setOperatorEmail] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [redirectPath, setRedirectPath] = useState("/command");

  useEffect(() => {
    let active = true;

    void (async () => {
      const params = new URLSearchParams(window.location.search);
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!active) return;

      setRedirectPath(normalizeAppPath(params.get("redirect") ?? "/command"));
      setOperatorEmail(user?.email ?? null);
      setCheckingAuth(false);
    })();

    return () => {
      active = false;
    };
  }, [supabase]);

  async function handleActivate() {
    if (!operatorEmail) {
      setErr("Operator sign-in is required before access can be activated in Stripe.");
      return;
    }

    setLoading(true);
    setErr(null);

    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ next: redirectPath }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          json && typeof json === "object" && "error" in json && typeof json.error === "string"
            ? json.error
            : `HTTP ${res.status}`
        );
      }
      window.location.href = json.url;
    } catch (error) {
      setErr(error instanceof Error ? error.message : String(error));
      setLoading(false);
    }
  }

  const returnToSubscribe = `/subscribe?redirect=${encodeURIComponent(redirectPath)}`;
  const loginHref = `/login?redirect=${encodeURIComponent(returnToSubscribe)}`;
  const seatBenefits = [
    "Governed command queue for open obligations",
    "Receipt-backed proof surface for closed work",
    "Integrity and enforcement domain visibility",
  ];

  return (
    <div className="min-h-screen bg-[#081019] px-4 py-8 text-white sm:px-6 lg:px-8 lg:py-10">
      <div className="mx-auto max-w-[88rem] space-y-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <Link href="/" className="inline-flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl border border-white/10 bg-white/[0.04] text-sm font-semibold text-white">
              AK
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.32em] text-white/35">AutoKirk</div>
              <div className="mt-1 text-sm text-white/70">Access activation</div>
            </div>
          </Link>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/"
              className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white/80 transition hover:border-white/20 hover:bg-white/[0.08]"
            >
              Overview
            </Link>
            <Link
              href={loginHref}
              className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white/80 transition hover:border-white/20 hover:bg-white/[0.08]"
            >
              Operator sign-in
            </Link>
          </div>
        </header>

        <section className="grid gap-8 xl:grid-cols-[1.05fr_0.95fr] xl:items-start">
          <div className="rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.03))] p-8 shadow-[0_30px_90px_rgba(0,0,0,0.34)] sm:p-10">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/15 bg-emerald-400/10 px-3 py-1 text-xs uppercase tracking-[0.22em] text-emerald-200">
                <ShieldCheck className="h-3.5 w-3.5" />
                Operator seat activation
              </div>

              <h1 className="mt-6 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                Activate the operator seat.
              </h1>

              <p className="mt-5 max-w-2xl text-base leading-7 text-white/70">
                Start the paid access path through Stripe, then return the operator directly to the governed AutoKirk surface.
                Identity comes first so the subscription binds to the correct account and workspace flow.
              </p>
            </div>

            <div className="mt-10 grid gap-4 md:grid-cols-3">
              <StepCard
                step="Step 1"
                title="Sign in as the operator"
                body="Use the work email that should own the AutoKirk access."
              />
              <StepCard
                step="Step 2"
                title="Activate in Stripe"
                body="Stripe turns on the paid operator seat for that account."
              />
              <StepCard
                step="Step 3"
                title="Return to the live console"
                body="After checkout, AutoKirk returns the operator to the surface that triggered activation."
              />
            </div>

            <div className="mt-10 flex flex-wrap gap-3 text-sm">
              <Link
                href={loginHref}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 text-white transition hover:border-white/20 hover:bg-white/[0.08]"
              >
                <LogIn className="h-4 w-4" />
                Open operator sign-in
              </Link>
              <Link
                href={redirectPath}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-transparent px-5 py-3 text-white/70 transition hover:border-white/20 hover:bg-white/[0.05] hover:text-white"
              >
                Return to previous surface
              </Link>
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(145,226,255,0.08),rgba(255,255,255,0.03))] p-8 xl:sticky xl:top-28">
            <div className="inline-flex items-center gap-2">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-white text-xs font-extrabold text-neutral-950">AK</div>
              <span className="text-sm font-extrabold tracking-[0.2em] text-white">AUTOKIRK</span>
            </div>

            <div className="mt-8 text-[10px] font-extrabold tracking-[0.28em] text-white/35">OPERATOR SEAT</div>
            <h2 className="mt-3 text-3xl font-extrabold leading-tight text-white">AutoKirk Access</h2>
            <div className="mt-3 text-5xl font-extrabold text-white">
              $50<span className="ml-1 text-lg font-semibold text-white/40">/mo</span>
            </div>
            <p className="mt-3 text-sm leading-6 text-white/50">
              Full access to the governed operator surface: integrity, command, receipts, users, and active enforcement domains.
            </p>

            <div className="mt-6 grid gap-3">
              <div className="rounded-2xl border border-white/10 bg-[#09111a]/80 p-5">
                <div className="text-sm font-medium text-white">Included in the seat</div>
                <ul className="mt-3 space-y-2 text-sm leading-6 text-white/65">
                  {seatBenefits.map((item) => (
                    <li key={item}>• {item}</li>
                  ))}
                </ul>
              </div>
            </div>

            {checkingAuth ? (
              <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 text-sm text-white/60">
                Checking current operator session...
              </div>
            ) : operatorEmail ? (
              <div className="mt-6 rounded-2xl border border-emerald-400/15 bg-emerald-400/10 p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-200" />
                    <div>
                      <div className="text-sm font-medium text-emerald-100">Operator identity established</div>
                      <div className="mt-1 text-sm text-emerald-50/80">{operatorEmail}</div>
                    </div>
                  </div>
                </div>
            ) : (
              <div className="mt-6 rounded-2xl border border-amber-300/15 bg-amber-300/10 p-4">
                <div className="text-sm font-medium text-amber-100">Operator sign-in required</div>
                <p className="mt-2 text-sm leading-6 text-amber-50/80">
                  Stripe activation only works after the operator identity is established. Sign in first, then come back here to continue.
                </p>
                <Link
                  href={loginHref}
                  className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-neutral-950 transition hover:bg-white/90"
                >
                  <LogIn className="h-4 w-4" />
                  Sign in first
                </Link>
              </div>
            )}

            {err ? (
              <div className="mt-4 rounded-2xl border border-rose-300/15 bg-rose-300/10 px-4 py-3 text-sm text-rose-100">
                {err}
              </div>
            ) : null}

            <button
              onClick={handleActivate}
              disabled={loading || checkingAuth || !operatorEmail}
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3.5 text-sm font-extrabold text-neutral-950 transition hover:bg-white/90 disabled:cursor-not-allowed disabled:bg-white/15 disabled:text-white/35"
            >
              <CreditCard className="h-4 w-4" />
              {loading ? "Redirecting to Stripe..." : operatorEmail ? "Continue to Stripe checkout" : "Sign in to unlock Stripe"}
            </button>

            <p className="mt-4 text-center text-[11px] text-white/25">
              Secure Stripe checkout · seat binds to the signed-in operator
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

function StepCard({
  step,
  title,
  body,
}: {
  step: string;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="text-[10px] uppercase tracking-[0.24em] text-white/35">{step}</div>
      <div className="mt-3 text-lg font-medium text-white">{title}</div>
      <div className="mt-3 text-sm leading-6 text-white/60">{body}</div>
    </div>
  );
}
