"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import {
  Activity,
  Gauge,
  ReceiptText,
  Settings,
} from "lucide-react";

const TONES = {
  gold: {
    text: "text-amber-100",
    border: "border-amber-300/20",
    bg: "bg-amber-300/12",
  },
  danger: {
    text: "text-rose-100",
    border: "border-rose-300/20",
    bg: "bg-rose-300/12",
  },
  muted: {
    text: "text-slate-300",
    border: "border-white/10",
    bg: "bg-white/6",
  },
} as const;

type Tone = keyof typeof TONES;

type NavItem = {
  href: string;
  label: string;
  icon: typeof Activity;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/command", label: "Command", icon: Activity },
  { href: "/command/integrity", label: "Integrity", icon: Gauge },
  { href: "/command/receipts", label: "Receipts", icon: ReceiptText },
  { href: "/command/settings", label: "Settings", icon: Settings },
];

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AkShell({
  title,
  subtitle,
  eyebrow = "Kernel Governed Surface",
  actions,
  children,
}: {
  title?: string;
  subtitle?: string;
  eyebrow?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-[#071018] text-slate-100">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-[-14%] top-[-8%] h-[26rem] w-[26rem] rounded-full bg-cyan-300/10 blur-3xl" />
        <div className="absolute right-[-10%] top-[8%] h-[28rem] w-[28rem] rounded-full bg-amber-300/10 blur-3xl" />
        <div className="absolute bottom-[-14%] left-[16%] h-[24rem] w-[24rem] rounded-full bg-emerald-300/8 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.7) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.7) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
      </div>

      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#071018]/88 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="min-w-0">
            <Link href="/" className="inline-flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl border border-white/10 bg-white/[0.04] text-sm font-semibold text-white shadow-[0_12px_30px_rgba(0,0,0,0.22)]">
                AK
              </div>
              <div className="min-w-0">
                <div className="truncate text-[11px] uppercase tracking-[0.34em] text-slate-500">AutoKirk</div>
                <div className="truncate text-sm text-slate-300">Stripe billing wedge</div>
              </div>
            </Link>
          </div>

          <nav className="hidden flex-1 items-center justify-center gap-2 xl:flex">
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
              const active = isActive(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={cx(
                    "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition",
                    active
                      ? "border-cyan-300/25 bg-cyan-300/12 text-cyan-100"
                      : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/20 hover:bg-white/[0.06] hover:text-white",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              );
            })}
          </nav>

          <div className="hidden items-center gap-2 md:flex">
            <Link
              href="/login"
              className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-slate-300 transition hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
            >
              Entry
            </Link>
          </div>
        </div>

        <div className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-4 pb-4 sm:px-6 xl:hidden lg:px-8">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                className={cx(
                  "inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm transition",
                  active
                    ? "border-cyan-300/25 bg-cyan-300/12 text-cyan-100"
                    : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/20 hover:bg-white/[0.06] hover:text-white",
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </div>
      </header>

      <main className="relative mx-auto max-w-[88rem] px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <section className="rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-7 shadow-[0_28px_90px_rgba(0,0,0,0.3)] sm:p-9">
          <div className="flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between xl:gap-10">
            <div className="max-w-3xl">
              <div className="text-[10px] uppercase tracking-[0.34em] text-slate-500">{eyebrow}</div>
              {title ? (
                <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                  {title}
                </h1>
              ) : null}
              {subtitle ? (
                <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
                  {subtitle}
                </p>
              ) : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:w-[27rem]">
              <SurfacePulse
                label="Kernel authority"
                value="Truth stays in the Kernel"
                note="Reads come through route handlers. Mutation authority stays behind governed action surfaces."
              />
              <SurfacePulse
                label="Proof posture"
                value="Receipt-backed billing closure"
                note="The live operator wedge is frozen to Stripe billing movements and their governed receipts."
              />
            </div>
          </div>

          {actions ? <div className="mt-8">{actions}</div> : null}
        </section>

        <div className="mt-10 space-y-10 lg:space-y-12">{children}</div>
      </main>
    </div>
  );
}

function SurfacePulse({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="rounded-[1.6rem] border border-white/10 bg-[#09111a]/90 p-5">
      <div className="text-[10px] uppercase tracking-[0.26em] text-slate-500">{label}</div>
      <div className="mt-3 text-lg font-medium text-white">{value}</div>
      <div className="mt-3 text-sm leading-6 text-slate-400">{note}</div>
    </div>
  );
}

export function AkPanel({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={cx(
        "rounded-[1.6rem] border border-white/10 bg-[linear-gradient(180deg,rgba(13,24,37,0.92),rgba(8,16,26,0.85))] shadow-[0_20px_60px_rgba(0,0,0,0.2)]",
        className,
      )}
      style={style}
    >
      {children}
    </div>
  );
}

export function AkSectionHeader({
  label,
  count,
  right,
}: {
  label: string;
  count?: number;
  right?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
      <div className="flex items-center gap-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500">
          {label}
        </div>
        {count !== undefined ? (
          <div className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-slate-300">
            {count}
          </div>
        ) : null}
      </div>
      {right ? <div>{right}</div> : null}
    </div>
  );
}

export function AkBadge({
  children,
  tone,
  color,
}: {
  children: ReactNode;
  tone?: Tone;
  color?: string;
}) {
  const theme = tone ? TONES[tone] : null;

  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em]",
        theme?.text,
        theme?.border,
        theme?.bg,
      )}
      style={color ? { color, borderColor: `${color}33`, backgroundColor: `${color}14` } : undefined}
    >
      {children}
    </span>
  );
}

export function AkButton({
  children,
  onClick,
  variant = "ghost",
  tone,
  className,
  disabled,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost";
  tone?: Tone;
  className?: string;
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
}) {
  const toneStyles =
    tone === "danger"
      ? {
          ghost: "border-rose-300/20 bg-rose-300/10 text-rose-100 hover:border-rose-300/30 hover:bg-rose-300/14",
          primary: "bg-rose-200 text-rose-950 hover:bg-rose-100",
        }
      : tone === "gold"
        ? {
            ghost: "border-amber-300/20 bg-amber-300/10 text-amber-100 hover:border-amber-300/30 hover:bg-amber-300/14",
            primary: "bg-amber-200 text-amber-950 hover:bg-amber-100",
          }
        : {
            ghost: "border-white/10 bg-white/[0.04] text-slate-100 hover:border-white/20 hover:bg-white/[0.08]",
            primary: "bg-white text-slate-950 hover:bg-slate-100",
          };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cx(
        "inline-flex items-center justify-center rounded-2xl border px-4 py-2.5 text-sm font-medium transition",
        disabled && "cursor-not-allowed opacity-50",
        variant === "primary" ? "border-transparent" : "",
        variant === "primary" ? toneStyles.primary : toneStyles.ghost,
        className,
      )}
    >
      {children}
    </button>
  );
}

export function AkInput({
  value,
  onChange,
  placeholder,
  type = "text",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  className?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      className={cx(
        "w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/25 focus:bg-white/[0.06]",
        className,
      )}
    />
  );
}

export function AkSelect({
  value,
  onChange,
  children,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={cx(
        "w-full rounded-2xl border border-white/10 bg-[#0b1520] px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300/25",
        className,
      )}
    >
      {children}
    </select>
  );
}

export function AkTextarea({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <textarea
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      className={cx(
        "w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/25 focus:bg-white/[0.06]",
        className,
      )}
    />
  );
}

export function AkUtilityLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-slate-300 transition hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
    >
      {children}
    </Link>
  );
}

export function AkMetricStrip({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cx("grid gap-4 md:grid-cols-2 xl:grid-cols-4", className)}>{children}</div>;
}

export function AkMetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <AkPanel className="p-5">
      <div className="text-[10px] uppercase tracking-[0.24em] text-slate-500">{label}</div>
      <div className="mt-3 text-3xl font-semibold tracking-tight text-white">{value}</div>
      <div className="mt-2 text-sm text-slate-400">{detail}</div>
    </AkPanel>
  );
}
