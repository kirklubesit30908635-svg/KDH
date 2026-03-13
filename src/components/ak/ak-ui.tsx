"use client";

import React from "react";

// ─── AkShell ──────────────────────────────────────────────────────────────────

type AkShellProps = {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
};

export function AkShell({ title, subtitle, children }: AkShellProps) {
  return (
    <div style={{
      minHeight: "100vh",
      backgroundColor: "#0a0a0a",
      color: "#fff",
      fontFamily: "system-ui, -apple-system, sans-serif",
    }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 24px" }}>
        {(title || subtitle) && (
          <div style={{ marginBottom: 32 }}>
            {title && (
              <h1 style={{
                fontSize: 22,
                fontWeight: 800,
                letterSpacing: "0.04em",
                color: "#fff",
                margin: 0,
                textTransform: "uppercase",
              }}>
                {title}
              </h1>
            )}
            {subtitle && (
              <p style={{
                fontSize: 13,
                color: "rgba(255,255,255,0.35)",
                margin: "6px 0 0",
                fontWeight: 500,
              }}>
                {subtitle}
              </p>
            )}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

// ─── AkPanel ──────────────────────────────────────────────────────────────────

type AkPanelProps = {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
};

export function AkPanel({ children, className, style }: AkPanelProps) {
  return (
    <div
      className={className}
      style={{
        backgroundColor: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 16,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ─── AkSectionHeader ──────────────────────────────────────────────────────────

type AkSectionHeaderProps = {
  label: string;
};

export function AkSectionHeader({ label }: AkSectionHeaderProps) {
  return (
    <div style={{
      fontSize: 10,
      fontWeight: 800,
      letterSpacing: "0.28em",
      color: "rgba(255,255,255,0.25)",
      textTransform: "uppercase",
      paddingBottom: 8,
      borderBottom: "1px solid rgba(255,255,255,0.06)",
    }}>
      {label}
    </div>
  );
}

// ─── AkInput ──────────────────────────────────────────────────────────────────

type AkInputProps = {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  type?: string;
};

export function AkInput({ value, onChange, placeholder, type = "text" }: AkInputProps) {
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: "100%",
        backgroundColor: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 10,
        padding: "10px 14px",
        color: "#fff",
        fontSize: 14,
        fontFamily: "system-ui, -apple-system, sans-serif",
        outline: "none",
        boxSizing: "border-box",
      }}
    />
  );
}