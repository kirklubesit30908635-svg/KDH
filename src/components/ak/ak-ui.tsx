"use client";

import React from "react";
import Link from "next/link";

// â”€â”€â”€ Shell â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function AkShell(props: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: "100vh",
      background: "#000",
      color: "#fff",
      fontFamily: "monospace",
    }}>
      {/* Top-left identity line */}
      <div style={{
        padding: "8px 12px",
        fontSize: 11,
        letterSpacing: "0.18em",
        color: "#fff",
        fontWeight: 700,
        textTransform: "uppercase",
        borderBottom: "1px solid #111",
      }}>
        AUTO KIRK &bull; OPERATOR CONSOLE
      </div>

      <div style={{ padding: "16px 12px" }}>
        {/* Gold page title */}
        <h1 style={{
          fontSize: 48,
          fontWeight: 800,
          color: "#c8960c",
          margin: "0 0 4px 0",
          lineHeight: 1.1,
          fontFamily: "monospace",
        }}>
          {props.title}
        </h1>

        {props.subtitle && (
          <p style={{
            fontSize: 13,
            color: "#888",
            margin: "0 0 20px 0",
            fontFamily: "monospace",
          }}>
            {props.subtitle}
          </p>
        )}

        <div style={{ marginTop: 8 }}>{props.children}</div>
      </div>
    </div>
  );
}

// â”€â”€â”€ Panel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function AkPanel(props: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={props.className ?? ""}
      style={{
        border: "1px solid #222",
        borderRadius: 4,
        background: "#080808",
        padding: "12px 14px",
        marginBottom: 8,
      }}
    >
      {props.children}
    </div>
  );
}

// â”€â”€â”€ Badge â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function AkBadge(props: {
  tone?: "gold" | "primary" | "muted" | "danger";
  children: React.ReactNode;
}) {
  const tone = props.tone ?? "muted";

  const style: React.CSSProperties =
    tone === "gold" || tone === "primary"
      ? { background: "#c8960c", color: "#000", border: "1px solid #c8960c" }
      : tone === "danger"
        ? { background: "#1a0000", color: "#ff4444", border: "1px solid #550000" }
        : { background: "#111", color: "#666", border: "1px solid #2a2a2a" };

  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      padding: "2px 8px",
      borderRadius: 3,
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: "0.12em",
      textTransform: "uppercase",
      fontFamily: "monospace",
      ...style,
    }}>
      {props.children}
    </span>
  );
}

// â”€â”€â”€ Section Header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function AkSectionHeader(props: {
  label: string;
  count?: number;
  right?: React.ReactNode;
}) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
      marginBottom: 6,
      marginTop: 16,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.22em",
          color: "#555",
          textTransform: "uppercase",
          fontFamily: "monospace",
        }}>
          {props.label}
        </div>
        {typeof props.count === "number" ? (
          <div style={{ fontSize: 10, color: "#444", fontFamily: "monospace" }}>{props.count}</div>
        ) : null}
      </div>
      {props.right ? <div>{props.right}</div> : null}
    </div>
  );
}

// â”€â”€â”€ Input â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function AkInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { style, ...rest } = props;
  return (
    <input
      {...rest}
      style={{
        width: "100%",
        boxSizing: "border-box",
        borderRadius: 3,
        border: "1px solid #2a2a2a",
        background: "#050505",
        padding: "10px 12px",
        fontSize: 13,
        color: "#fff",
        outline: "none",
        fontFamily: "monospace",
        ...style,
      }}
    />
  );
}

// â”€â”€â”€ Button â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function AkButton(
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    tone?: "gold" | "primary" | "muted" | "danger";
  }
) {
  const { tone = "gold", style, ...rest } = props;

  const toneStyle: React.CSSProperties =
    tone === "gold"
      ? { background: "#c8960c", color: "#000", border: "1px solid #c8960c" }
      : tone === "primary"
        ? { background: "#fff", color: "#000", border: "1px solid #fff" }
        : tone === "danger"
          ? { background: "#1a0000", color: "#ff4444", border: "1px solid #550000" }
          : { background: "#111", color: "#888", border: "1px solid #2a2a2a" };

  return (
    <button
      {...rest}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "6px 14px",
        borderRadius: 3,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.08em",
        cursor: "pointer",
        fontFamily: "monospace",
        textTransform: "uppercase",
        ...toneStyle,
        ...style,
      }}
    />
  );
}

