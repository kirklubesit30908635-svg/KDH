"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  CreditCard,
  Gauge,
  Lock,
  LogIn,
  Mail,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import {
  AkBadge,
  AkButton,
  AkInput,
  AkPanel,
  AkShell,
  AkUtilityLink,
} from "@/components/ak/ak-ui";
import { OperatorSummaryPanel } from "@/components/operator-summary-panel";
import {
  buildUnavailableSummary,
  type OperatorSummary,
} from "@/lib/operator-summary";
import { fetchOperatorSummary } from "@/lib/operator-summary-client";
import { createBrowserSupabaseClient } from "@/lib/supabase/supabaseBrowser";

const FLOW_STEPS: Array<{ label: string; href?: string }> = [
  { label: "event" },
  { label: "obligation", href: "/command" },
  { label: "closure", href: "/command" },
  { label: "receipt", href: "/command/receipts" },
  { label: "signal", href: "/command/integrity" },
] as const;

const SURFACE_LINKS = [
  {
    href: "/command",
    eyebrow: "Action rail",
    title: "Command queue",
    body: "Open the governed queue, resolve the oldest unresolved duty first, and let closure emit proof.",
    Icon: Activity,
  },
  {
    href: "/command/receipts",
    eyebrow: "Proof layer",
    title: "Receipts",
    body: "Read the receipt record for every finished obligation. If there is no receipt, it did not happen.",
    Icon: ReceiptText,
  },
  {
    href: "/command/integrity",
    eyebrow: "Signal layer",
    title: "Integrity",
    body: "See whether the system is actually healthy, degraded, or carrying proof lag and hidden pressure.",
    Icon: Gauge,
  },
  {
    href: "/subscribe",
    eyebrow: "Access rail",
    title: "Operator access",
    body: "Start or renew governed operator access through the Stripe-backed subscription entry point.",
    Icon: CreditCard,
  },
] as const;

const ENTRY_PRINCIPLES = [
  "The first screen must tell the truth.",
  "Operators consume one authoritative summary contract.",
  "Closure is not complete until proof exists.",
] as const;

function normalizeAppPath(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/command";
  }

  return value;
}

function FlowRail() {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-slate-300">
      {FLOW_STEPS.map((step, index) => (
        <div key={step.label} className="flex items-center gap-2">
          {step.href ? (
            <Link
              href={step.href}
              className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm text-slate-200 transition hover:border-white/20 hover:bg-white/[0.08]"
            >
              {step.label}
            </Link>
          ) : (
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm text-slate-300">
              {step.label}
            </span>
          )}
          {index < FLOW_STEPS.length - 1 ? (
            <ArrowRight className="h-4 w-4 text-slate-600" />
          ) : null}
        </div>
      ))}
    </div>
  );
}

function SurfaceCard({
  href,
  eyebrow,
  title,
  body,
  Icon,
}: (typeof SURFACE_LINKS)[number]) {
  return (
    <Link href={href}>
      <AkPanel className="group h-full p-5 transition hover:border-white/20 hover:bg-white/[0.05]">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[10px] uppercase tracking-[0.24em] text-slate-500">{eyebrow}</div>
          <Icon className="h-4 w-4 text-white/25 transition group-hover:text-white/50" />
        </div>
        <div className="mt-4 text-xl font-semibold tracking-tight text-white">{title}</div>
        <p className="mt-3 text-sm leading-6 text-slate-400">{body}</p>
        <div className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-slate-200">
          Open surface
          <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
        </div>
      </AkPanel>
    </Link>
  );
}

export default function LoginPage() {
  const [supabase] = useState(() => createBrowserSupabaseClient());
  const [summary, setSummary] = useState<OperatorSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [nextPath, setNextPath] = useState("/command");
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [queryMessage, setQueryMessage] = useState<string | null>(null);

  async function loadSummary() {
    setSummaryLoading(true);
    try {
      const nextSummary = await fetchOperatorSummary();
      setSummary(nextSummary);
    } catch {
      setSummary(
        buildUnavailableSummary("Unable to reach the authoritative operator summary."),
      );
    } finally {
      setSummaryLoading(false);
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setNextPath(normalizeAppPath(params.get("redirect") ?? params.get("next")));
    setQueryMessage(params.get("detail") ?? params.get("error"));
    void loadSummary();
  }, []);

  async function handleMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthSubmitting(true);
    setAuthMessage(null);
    setAuthError(null);

    try {
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(
        nextPath,
      )}`;
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo },
      });

      if (error) {
        throw error;
      }

      setAuthMessage("Check your email for the AutoKirk access link.");
    } catch (error) {
      setAuthError(
        error instanceof Error ? error.message : "Unable to send access link.",
      );
    } finally {
      setAuthSubmitting(false);
    }
  }

  return (
    <AkShell
      title="Operator entry"
      subtitle="Cross into the governed runtime, read the sealed summary contract, and move from duty to proof without leaving the system's own truth surface."
      eyebrow="Authoritative Entry Surface"
      actions={
        <div className="flex flex-wrap gap-3">
          <AkUtilityLink href="/command">Command</AkUtilityLink>
          <AkUtilityLink href="/command/receipts">Receipts</AkUtilityLink>
          <AkUtilityLink href="/command/integrity">Integrity</AkUtilityLink>
          <button
            type="button"
            onClick={() => void loadSummary()}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-slate-300 transition hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
          >
            <RefreshCw className={`h-4 w-4 ${summaryLoading ? "animate-spin" : ""}`} />
            Refresh summary
          </button>
        </div>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <AkPanel className="p-6 lg:p-7">
          <div className="flex flex-wrap items-center gap-3">
            <AkBadge color="#6ee7b7">
              <span className="inline-flex items-center gap-2">
                <ShieldCheck className="h-3.5 w-3.5" />
                Governed read surface
              </span>
            </AkBadge>
            <AkBadge tone="muted">Redirect target: {nextPath}</AkBadge>
          </div>

          <h2 className="mt-5 max-w-3xl text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            The first screen should tell the truth before the operator moves.
          </h2>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
            AutoKirk entry is not a marketing page. It is the crossing point into a governed system where obligations, closure, receipts, and integrity are meant to read as one machine.
          </p>

          <div className="mt-6">
            <FlowRail />
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {ENTRY_PRINCIPLES.map((principle) => (
              <div
                key={principle}
                className="rounded-[1.4rem] border border-white/10 bg-[#09111a]/85 px-4 py-4 text-sm leading-6 text-slate-300"
              >
                {principle}
              </div>
            ))}
          </div>
        </AkPanel>

        <AkPanel className="p-6 lg:p-7">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-white/70">
              <Lock className="h-5 w-5" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.24em] text-slate-500">
                Operator sign-in
              </div>
              <div className="mt-1 text-xl font-semibold text-white">
                Send a secure access link
              </div>
            </div>
          </div>

          <p className="mt-4 text-sm leading-7 text-slate-400">
            Use the work email that owns the operator seat. AutoKirk returns you to the governed runtime after authentication.
          </p>

          {queryMessage ? (
            <div className="mt-4 rounded-2xl border border-rose-300/20 bg-rose-300/10 px-4 py-3 text-sm text-rose-100">
              {queryMessage}
            </div>
          ) : null}

          <form onSubmit={handleMagicLink} className="mt-5 space-y-4">
            <label className="block">
              <span className="mb-2 inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-slate-500">
                <Mail className="h-3.5 w-3.5" />
                Work email
              </span>
              <AkInput
                type="email"
                value={email}
                onChange={setEmail}
                placeholder="operator@company.com"
              />
            </label>

            {authError ? (
              <div className="rounded-2xl border border-rose-300/20 bg-rose-300/10 px-4 py-3 text-sm text-rose-100">
                {authError}
              </div>
            ) : null}

            {authMessage ? (
              <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-sm text-emerald-100">
                {authMessage}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-3">
              <AkButton type="submit" variant="primary" disabled={authSubmitting}>
                <span className="inline-flex items-center gap-2">
                  <LogIn className="h-4 w-4" />
                  {authSubmitting ? "Sending access link..." : "Send access link"}
                </span>
              </AkButton>
              <Link
                href="/subscribe"
                className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-slate-100 transition hover:border-white/20 hover:bg-white/[0.08]"
              >
                Start operator access
              </Link>
            </div>
          </form>
        </AkPanel>
      </div>

      {summaryLoading ? (
        <AkPanel className="p-6 text-sm text-slate-300">
          Pulling the authoritative operator summary...
        </AkPanel>
      ) : summary ? (
        <OperatorSummaryPanel summary={summary} />
      ) : null}

      <div className="grid gap-4 xl:grid-cols-4">
        {SURFACE_LINKS.map((surface) => (
          <SurfaceCard key={surface.href} {...surface} />
        ))}
      </div>
    </AkShell>
  );
}
