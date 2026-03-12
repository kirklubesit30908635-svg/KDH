"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
  { href: "/command",    label: "Inbox" },
  { href: "/integrity",  label: "Integrity" },
  { href: "/billing-ops", label: "Billing" },
  { href: "/advertising", label: "Advertising" },
  { href: "/receipts",   label: "Receipts" },
  { href: "/users",      label: "Users" },
] as const;

// ─── Shell ─────────────────────────────────────────────────────────────────────

export function AkShell(props: { title: string; subtitle?: string; children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      {/* Subtle radial glow */}
      <div className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[44rem] bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.06),transparent_50%)]" />

      {/* Header bar */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-neutral-950/80 backdrop-blur-xl">
        <div className="flex items-center justify-between px-6 py-3">
          <Link href="/" className="flex items-center gap-3 flex-shrink-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-xs font-semibold tracking-[0.22em]">
              AK
            </div>
            <div className="hidden sm:block">
              <div className="text-xs font-semibold tracking-[0.26em] text-white/80">AUTOKIRK</div>
            </div>
          </Link>

          {/* Nav links */}
          <nav className="flex items-center gap-1">
            {NAV_LINKS.map(({ href, label }) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  className={[
                    "rounded-xl px-3 py-1.5 text-[11px] font-semibold tracking-wide transition",
                    active
                      ? "bg-white/10 text-white"
                      : "text-white/40 hover:text-white/80 hover:bg-white/[0.05]",
                  ].join(" ")}
                >
                  {label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            <span className="text-[10px] uppercase tracking-[0.18em] text-white/45 hidden sm:inline">Kernel live</span>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-6xl px-6 py-10">
        {/* Page eyebrow */}
        <div className="mb-2 text-[10px] uppercase tracking-[0.3em] text-white/30">
          // {props.title}
        </div>

        {/* Page title */}
        <h1 className="text-4xl font-semibold tracking-tight text-white">
          {props.title}
        </h1>

        {props.subtitle && (
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/50">{props.subtitle}</p>
        )}

        <div className="mt-10">{props.children}</div>
      </div>
    </div>
  );
}

// ─── Panel ─────────────────────────────────────────────────────────────────────

export function AkPanel(props: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={[
        "rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm",
        props.className ?? "",
      ].join(" ")}
    >
      {props.children}
    </div>
  );
}

// ─── Badge ─────────────────────────────────────────────────────────────────────

export function AkBadge(props: {
  tone?: "gold" | "primary" | "muted" | "danger";
  children: React.ReactNode;
}) {
  const tone = props.tone ?? "muted";
  const cls =
    tone === "gold" || tone === "primary"
      ? "border-white/20 bg-white/[0.08] text-white/90"
      : tone === "danger"
      ? "border-red-400/20 bg-red-400/5 text-red-300"
      : "border-white/10 bg-white/[0.04] text-white/50";

  return (
    <span
      className={[
        "inline-flex items-center rounded-full border px-2.5 py-1",
        "text-[11px] font-semibold tracking-wide",
        cls,
      ].join(" ")}
    >
      {props.children}
    </span>
  );
}

// ─── Section Header ───────────────────────────────────────────────────────────

export function AkSectionHeader(props: {
  label: string;
  count?: number;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="text-[10px] font-semibold tracking-[0.22em] text-white/35 uppercase">
          {props.label}
        </div>
        {typeof props.count === "number" ? (
          <div className="text-[10px] text-white/25">{props.count}</div>
        ) : null}
      </div>
      {props.right ? <div>{props.right}</div> : null}
    </div>
  );
}

// ─── Input ────────────────────────────────────────────────────────────────────

export function AkInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={[
        "w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white",
        "placeholder:text-white/25 outline-none transition",
        "focus:border-white/30 focus:bg-white/[0.06]",
        props.className ?? "",
      ].join(" ")}
    />
  );
}

// ─── Button ───────────────────────────────────────────────────────────────────

export function AkButton(
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    tone?: "gold" | "primary" | "muted" | "danger";
  }
) {
  const { tone = "primary", className, ...rest } = props;

  const cls =
    tone === "gold" || tone === "primary"
      ? "bg-white text-neutral-950 border-transparent hover:scale-[1.01] hover:shadow-[0_8px_32px_rgba(255,255,255,0.12)]"
      : tone === "danger"
      ? "bg-red-400/10 text-red-300 border-red-400/20 hover:bg-red-400/20"
      : "bg-white/[0.04] text-white/70 border-white/10 hover:bg-white/[0.08]";

  return (
    <button
      {...rest}
      className={[
        "inline-flex items-center justify-center rounded-2xl border px-4 py-3 text-sm font-semibold transition",
        "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100",
        cls,
        className ?? "",
      ].join(" ")}
    />
  );
}
