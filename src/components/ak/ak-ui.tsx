"use client";

export function AkShell({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: 20 }}>{children}</div>;
}

export function AkPanel({ children }: { children: React.ReactNode }) {
  return <div style={{ marginBottom: 20 }}>{children}</div>;
}

export function AkButton({ children }: { children: React.ReactNode }) {
  return <button>{children}</button>;
}
