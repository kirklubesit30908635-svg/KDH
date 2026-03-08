"use client";

import React from "react";

export function AkShell(props: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-black text-zinc-100">
      {/* subtle “submarine” atmosphere */}
      <div className="pointer-events-none fixed inset-0 opacity-60">
        <div className="absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-[#6b4e12]/10 blur-3xl" />
        <div className="absolute top-40 left-10 h-[420px] w-[420px] rounded-full bg-indigo-500/5 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-[520px] w-[520px] rounded-full bg-purple-500/5 blur-3xl" />
      </div>

      <div className="relative mx-auto w-full max-w-6xl px-6 py-10">
        <div className="text-xs font-extrabold tracking-[0.32em] text-[#d6b24a]/90">
          AUTO KIRK • OPERATOR CONSOLE
        </div>

        <div className="mt-5">
          <h1 className="text-5xl font-extrabold leading-[1.05] text-[#d6b24a] drop-shadow-[0_0_28px_rgba(214,178,74,0.12)]">
            {props.title}
          </h1>
          {props.subtitle ? (
            <div className="mt-4 max-w-3xl text-base text-zinc-400">
              {props.subtitle}
            </div>
          ) : null}
        </div>

        <div className="mt-10">{props.children}</div>
      </div>
    </div>
  );
}

export function AkPanel(props: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={[
        "rounded-2xl border border-[#2a2516] bg-[#070707]/90",
        "shadow-[0_0_0_1px_rgba(214,178,74,0.08),0_18px_60px_rgba(0,0,0,0.55)]",
        "backdrop-blur-sm",
        props.className ?? "",
      ].join(" ")}
    >
      {props.children}
    </div>
  );
}

export function AkBadge(props: { tone?: "gold" | "muted" | "danger"; children: React.ReactNode }) {
  const tone = props.tone ?? "muted";
  const cls =
    tone === "gold"
      ? "border-[#3a2f12] bg-[#0d0a03] text-[#d6b24a]"
      : tone === "danger"
      ? "border-[#3a0f0f] bg-[#120606] text-[#ff3b30]"
      : "border-[#222] bg-[#0b0b0b] text-zinc-300";

  return (
    <span
      className={[
        "inline-flex items-center rounded-full border px-2.5 py-1",
        "text-[11px] font-extrabold tracking-wide",
        cls,
      ].join(" ")}
    >
      {props.children}
    </span>
  );
}

export function AkSectionHeader(props: { label: string; count?: number; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="text-xs font-extrabold tracking-[0.22em] text-zinc-500">
          {props.label.toUpperCase()}
        </div>
        {typeof props.count === "number" ? (
          <div className="text-xs font-bold text-zinc-600">{props.count}</div>
        ) : null}
      </div>
      {props.right ? <div>{props.right}</div> : null}
    </div>
  );
}

export function AkInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={[
        "w-full rounded-xl border border-[#2a2516] bg-black px-4 py-3 text-sm text-zinc-100",
        "placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-[#d6b24a]/30",
        props.className ?? "",
      ].join(" ")}
    />
  );
}

export function AkButton(props: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "gold" | "muted" | "danger" }) {
  const tone = props.tone ?? "gold";
  const cls =
    tone === "gold"
      ? "bg-[#d6b24a] text-black hover:brightness-105"
      : tone === "danger"
      ? "bg-[#ff3b30] text-black hover:brightness-105"
      : "bg-[#121212] text-zinc-200 hover:bg-[#181818]";

  return (
    <button
      {...props}
      className={[
        "inline-flex items-center justify-center rounded-xl px-4 py-3 text-sm font-extrabold",
        "border border-[#2a2516] shadow-[0_0_0_1px_rgba(214,178,74,0.10)]",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        cls,
        props.className ?? "",
      ].join(" ")}
    />
  );
}