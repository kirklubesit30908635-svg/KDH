"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Gauge,
  ReceiptText,
  ShieldCheck,
  Workflow,
} from "lucide-react";
import {
  AkBadge,
  AkButton,
  AkPanel,
  AkShell,
  AkUtilityLink,
} from "@/components/ak/ak-ui";

const SUBSCRIPTION_FEATURES = [
  {
    title: "Governed operator entry",
    body: "The runtime opens through one subscription-backed access rail instead of ad hoc founder routing.",
    Icon: ShieldCheck,
  },
  {
    title: "Receipt-backed closure",
    body: "Operators act inside the command surface and closure produces a ledger event plus proof receipt.",
    Icon: ReceiptText,
  },
  {
    title: "Signal visibility",
    body: "Integrity tells the operator whether the machine is actually clean, degraded, or carrying proof lag.",
    Icon: Gauge,
  },
  {
    title: "One movement path",
    body: "Event, obligation, closure, receipt, and signal stay inside one governed operator system.",
    Icon: Workflow,
  },
] as const;

const ACCESS_FLOW = [
  "Subscribe",
  "Authenticate",
  "Open command",
  "Resolve duty",
  "Produce receipt",
] as const;

export default function SubscribePage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubscribe() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/create-checkout-session", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        setError(
          data && typeof data === "object" && "error" in data && typeof data.error === "string"
            ? data.error
            : "Failed to start checkout.",
        );
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AkShell
      title="Operator access"
      subtitle="Start governed operator access through the Stripe-backed subscription rail. Access is part of the system, not a disconnected checkout face."
      eyebrow="Subscription Entry Surface"
      actions={
        <div className="flex flex-wrap gap-3">
          <AkUtilityLink href="/login">Operator entry</AkUtilityLink>
          <AkUtilityLink href="/command/integrity">Integrity</AkUtilityLink>
          <AkUtilityLink href="/command/receipts">Receipts</AkUtilityLink>
        </div>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <AkPanel className="p-6 lg:p-7">
          <div className="flex flex-wrap items-center gap-3">
            <AkBadge color="#fbbf24">$1 / day</AkBadge>
            <AkBadge tone="muted">Billed daily</AkBadge>
            <AkBadge tone="muted">Cancel any time</AkBadge>
          </div>

          <h2 className="mt-5 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Open the operator runtime without stepping outside the governed system.
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">
            Subscription exists to unlock the real surfaces: operator entry, command, receipts, and integrity. It should feel like part of the machine, not a detached payment widget.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-2 text-sm text-slate-300">
            {ACCESS_FLOW.map((step, index) => (
              <div key={step} className="flex items-center gap-2">
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
                  {step}
                </span>
                {index < ACCESS_FLOW.length - 1 ? (
                  <ArrowRight className="h-4 w-4 text-slate-600" />
                ) : null}
              </div>
            ))}
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {SUBSCRIPTION_FEATURES.map(({ title, body, Icon }) => (
              <div
                key={title}
                className="rounded-[1.4rem] border border-white/10 bg-[#09111a]/85 p-5"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[10px] uppercase tracking-[0.24em] text-slate-500">
                    System fit
                  </div>
                  <Icon className="h-4 w-4 text-white/30" />
                </div>
                <div className="mt-4 text-lg font-semibold text-white">{title}</div>
                <p className="mt-3 text-sm leading-6 text-slate-400">{body}</p>
              </div>
            ))}
          </div>
        </AkPanel>

        <AkPanel className="p-6 lg:p-7">
          <div className="rounded-[1.6rem] border border-amber-300/20 bg-amber-300/10 p-5">
            <div className="text-[10px] uppercase tracking-[0.24em] text-amber-100/80">
              Operator access plan
            </div>
            <div className="mt-4 flex items-end gap-3">
              <div className="text-5xl font-semibold tracking-tight text-white">$1</div>
              <div className="pb-2 text-sm text-amber-50/70">per day</div>
            </div>
            <p className="mt-4 text-sm leading-7 text-amber-50/80">
              Stripe manages the billing rail. AutoKirk manages the operator runtime that opens after payment succeeds.
            </p>
          </div>

          <div className="mt-6 space-y-3">
            <AkButton variant="primary" disabled={loading} onClick={() => void handleSubscribe()}>
              <span className="inline-flex items-center gap-2">
                {loading ? "Redirecting to Stripe..." : "Start subscription"}
                {!loading ? <ArrowRight className="h-4 w-4" /> : null}
              </span>
            </AkButton>

            <Link
              href="/login"
              className="inline-flex w-full items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-slate-100 transition hover:border-white/20 hover:bg-white/[0.08]"
            >
              I already have access
            </Link>
          </div>

          {error ? (
            <div className="mt-4 rounded-2xl border border-rose-300/20 bg-rose-300/10 px-4 py-3 text-sm text-rose-100">
              {error}
            </div>
          ) : null}

          <div className="mt-6 rounded-[1.4rem] border border-white/10 bg-[#09111a]/85 p-5">
            <div className="text-[10px] uppercase tracking-[0.24em] text-slate-500">
              What happens after payment
            </div>
            <div className="mt-4 space-y-3 text-sm leading-6 text-slate-300">
              <p>1. Stripe completes checkout.</p>
              <p>2. AutoKirk provisions governed operator access.</p>
              <p>3. You cross the auth membrane at operator entry.</p>
              <p>4. Command, receipts, and integrity become the working surfaces.</p>
            </div>
          </div>
        </AkPanel>
      </div>
    </AkShell>
  );
}
