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

  return (
    <div className="min-h-screen bg-neutral-950 px-4 py-10 text-white">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-5xl items-center justify-center">
        <div className="grid w-full gap-6 lg:grid-cols-[1.08fr_0.92fr]">
          <div className="rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.03))] p-8 shadow-[0_30px_90px_rgba(0,0,0,0.34)]">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/15 bg-emerald-400/10 px-3 py-1 text-xs uppercase tracking-[0.22em] text-emerald-200">
              <ShieldCheck className="h-3.5 w-3.5" />
              Operator access setup
            </div>

            <h1 className="mt-6 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Activate access for this operator.
            </h1>

            <p className="mt-5 max-w-2xl text-base leading-7 text-white/70">
              Activate operator access through Stripe. The operator identity must already exist so the subscription can bind
              back to the correct account and return to the right AutoKirk surface.
            </p>

            <div className="mt-8 space-y-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="text-[10px] uppercase tracking-[0.24em] text-white/35">Step 1</div>
                <div className="mt-2 text-lg font-medium text-white">Sign in as the operator</div>
                <div className="mt-2 text-sm leading-6 text-white/60">
                  Use the work email that should own the AutoKirk access.
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="text-[10px] uppercase tracking-[0.24em] text-white/35">Step 2</div>
                <div className="mt-2 text-lg font-medium text-white">Open Stripe checkout</div>
                <div className="mt-2 text-sm leading-6 text-white/60">
                  Stripe activates the paid access path for that operator account.
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="text-[10px] uppercase tracking-[0.24em] text-white/35">Step 3</div>
                <div className="mt-2 text-lg font-medium text-white">Return to the operator surface</div>
                <div className="mt-2 text-sm leading-6 text-white/60">
                  After checkout, AutoKirk returns the operator to the working console.
                </div>
              </div>
            </div>

            <div className="mt-8 flex flex-wrap gap-3 text-sm">
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

          <div className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-8">
            <div className="inline-flex items-center gap-2">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-white text-xs font-extrabold text-neutral-950">AK</div>
              <span className="text-sm font-extrabold tracking-[0.2em] text-white">AUTOKIRK</span>
            </div>

            <div className="mt-8 text-[10px] font-extrabold tracking-[0.28em] text-white/35">OPERATOR ACCESS</div>
            <h2 className="mt-3 text-3xl font-extrabold leading-tight text-white">AutoKirk Access</h2>
            <div className="mt-3 text-5xl font-extrabold text-white">
              $50<span className="ml-1 text-lg font-semibold text-white/40">/mo</span>
            </div>
            <p className="mt-3 text-sm leading-6 text-white/50">
              Full access to the operator surface: integrity, command, receipts, and billing enforcement.
            </p>

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
              Secure checkout via Stripe · access binds to the signed-in operator
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
