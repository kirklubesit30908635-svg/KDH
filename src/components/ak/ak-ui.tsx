"use client";

import React from "react";
import Link from "next/link";

type AkShellProps = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
};

const GOLD = "#c8960c";
const BLACK = "#000";
const DIM = "#888";
const BORDER = "#1a1a1a";

export function AkShell(props: AkShellProps) {
  return (
    <div style={{ minHeight: "100vh", background: BLACK, color: "#fff", fontFamily: "monospace", paddingBottom: 60 }}>
      <div style={{ padding: "10px 16px", borderBottom: "1px solid #1a1a1a", fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: GOLD, fontFamily: "monospace" }}>
        AUTO KIRK • OPERATOR CONSOLE
      </div>
      <div style={{ padding: "20px 16px 0 16px" }}>
        <h1 style={{ fontSize: 48, fontWeight: 800, color: GOLD, fontFamily: "monospace", margin: "0 0 4px 0", lineHeight: 1.1 }}>{props.title}</h1>
        {props.subtitle && <p style={{ margin: "0 0 20px 0", fontSize: 14, color: DIM, fontFamily: "monospace" }}>{props.subtitle}</p>}
        <div style={{ marginTop: 20 }}>{props.children}</div>
      </div>
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, borderTop: "1px solid #1a1a1a", background: BLACK, padding: "8px 16px", display: "flex", gap: 16, fontFamily: "monospace", fontSize: 11, zIndex: 50 }}>
        <Link href="/billing-ops" style={{ color: BLACK, textDecoration: "none", background: GOLD, padding: "4px 10px", borderRadius: 3, fontWeight: 700 }}>Billing Enforcement →</Link>
        <Link href="/receipts" style={{ color: DIM, textDecoration: "none", lineHeight: "24px" }}>All Receipts →</Link>
        <Link href="/command" style={{ color: DIM, textDecoration: "none", lineHeight: "24px" }}>Command →</Link>
      </div>
    </div>
  );
}
export function AkPanel(props: { className?: string; children: React.ReactNode }) {
  return <div style={{ border: "1px solid #1a1a1a", background: "#080808", borderRadius: 3, padding: 16, marginBottom: 16 }}>{props.children}</div>;
}
export function AkBadge(props: { tone?: "gold" | "primary" | "muted" | "danger"; children: React.ReactNode }) {
  const tone = props.tone ?? "muted";
  const s = tone === "gold" || tone === "primary" ? { background: GOLD, color: BLACK } : tone === "danger" ? { background: "#3a0000", color: "#f87171", border: "1px solid #7f1d1d" } : { background: "#111", color: DIM, border: "1px solid #333" };
  return <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 8px", fontSize: 11, fontWeight: 700, fontFamily: "monospace", letterSpacing: "0.08em", borderRadius: 3, ...s }}>{props.children}</span>;
}
export function AkSectionHeader(props: { label: string; count?: number; right?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, borderBottom: "1px solid #1a1a1a", paddingBottom: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", color: DIM, fontFamily: "monospace" }}>{props.label}</span>
        {typeof props.count === "number" && <span style={{ fontSize: 10, color: "#444", fontFamily: "monospace" }}>{props.count}</span>}
      </div>
      {props.right && <div>{props.right}</div>}
    </div>
  );
}
export function AkInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className, style, ...rest } = props;
  return <input {...rest} style={{ width: "100%", background: "#0a0a0a", border: "1px solid #333", color: "#fff", fontFamily: "monospace", fontSize: 13, padding: "8px 12px", outline: "none", borderRadius: 3, boxSizing: "border-box", ...style }} />;
}
export function AkButton(props: { tone?: "gold" | "ghost" | "danger"; children: React.ReactNode; onClick?: () => void; disabled?: boolean; type?: "button" | "submit" | "reset" }) {
  const tone = props.tone ?? "gold";
  const s = tone === "gold" ? { background: GOLD, color: BLACK, border: "none" } : tone === "danger" ? { background: "#3a0000", color: "#f87171", border: "1px solid #7f1d1d" } : { background: "transparent", color: DIM, border: "1px solid #333" };
  return <button type={props.type ?? "button"} onClick={props.onClick} disabled={props.disabled} style={{ padding: "8px 20px", fontSize: 12, fontWeight: 700, fontFamily: "monospace", letterSpacing: "0.08em", cursor: props.disabled ? "not-allowed" : "pointer", opacity: props.disabled ? 0.5 : 1, borderRadius: 3, ...s }}>{props.children}</button>;
}
'@ | Set-Content "C:\Users\chase kirk\autokirk-kernel\src\components\ak\ak-ui.tsx" -Encoding UTF8
