"use client";
import React from "react";

const TONES = { gold: "#f59e0b", danger: "#ef4444", muted: "rgba(255,255,255,0.4)" } as const;
type Tone = keyof typeof TONES;

export function AkShell({ title, subtitle, children }: { title?: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#0a0a0a", color: "#fff", fontFamily: "system-ui,-apple-system,sans-serif" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 24px" }}>
        {(title || subtitle) && <div style={{ marginBottom: 32 }}>
          {title && <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "0.04em", color: "#fff", margin: 0, textTransform: "uppercase" }}>{title}</h1>}
          {subtitle && <p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", margin: "6px 0 0" }}>{subtitle}</p>}
        </div>}
        {children}
      </div>
    </div>
  );
}

export function AkPanel({ children, className, style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return <div className={className} style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, ...style }}>{children}</div>;
}

export function AkSectionHeader({ label, count }: { label: string; count?: number }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.28em", color: "rgba(255,255,255,0.25)", textTransform: "uppercase", paddingBottom: 8, borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "space-between" }}>
      <span>{label}</span>
      {count !== undefined && <span>{count}</span>}
    </div>
  );
}

export function AkBadge({ children, tone, color }: { children: React.ReactNode; tone?: Tone; color?: string }) {
  const c = tone ? TONES[tone] : (color ?? "rgba(255,255,255,0.4)");
  return <span style={{ display: "inline-flex", alignItems: "center", borderRadius: 999, padding: "2px 10px", fontSize: 11, fontWeight: 700, backgroundColor: `${c}18`, border: `1px solid ${c}30`, color: c }}>{children}</span>;
}

export function AkButton({ children, onClick, variant = "ghost", tone, disabled, type = "button" }: { children: React.ReactNode; onClick?: () => void; variant?: "primary" | "ghost"; tone?: Tone; disabled?: boolean; type?: "button" | "submit" | "reset" }) {
  const isPrimary = variant === "primary";
  const c = tone ? TONES[tone] : undefined;
  return (
    <button type={type} onClick={onClick} disabled={disabled} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "8px 18px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1, border: isPrimary ? "none" : `1px solid ${c ?? "rgba(255,255,255,0.12)"}`, backgroundColor: isPrimary ? "#fff" : "rgba(255,255,255,0.06)", color: isPrimary ? "#0a0a0a" : (c ?? "#fff"), transition: "opacity 0.15s" }}>
      {children}
    </button>
  );
}

export function AkInput({ value, onChange, placeholder, type = "text" }: { value: string; onChange: (val: string) => void; placeholder?: string; type?: string }) {
  return <input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} style={{ width: "100%", backgroundColor: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: "10px 14px", color: "#fff", fontSize: 14, outline: "none", boxSizing: "border-box" }} />;
}
