"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/supabaseBrowser";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword]   = useState("");
  const [confirm, setConfirm]     = useState("");
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [done, setDone]           = useState(false);

  const supabase = createBrowserSupabaseClient();

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const { error: updateErr } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateErr) {
      setError(updateErr.message);
    } else {
      setDone(true);
      setTimeout(() => router.push("/command"), 2000);
    }
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0a0a0a",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "system-ui, sans-serif",
    }}>
      <div style={{
        background: "#141414",
        border: "1px solid #2a2a2a",
        borderRadius: "16px",
        padding: "40px",
        width: "100%",
        maxWidth: "420px",
        boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
      }}>
        {done ? (
          <>
            <div style={{ fontSize: "40px", marginBottom: "16px" }}>✓</div>
            <h1 style={{ color: "#fff", fontSize: "20px", fontWeight: 700, marginBottom: "8px" }}>
              Password updated
            </h1>
            <p style={{ color: "#666", fontSize: "14px" }}>Redirecting to console…</p>
          </>
        ) : (
          <>
            <h1 style={{ color: "#fff", fontSize: "22px", fontWeight: 700, marginBottom: "6px" }}>
              Set New Password
            </h1>
            <p style={{ color: "#666", fontSize: "14px", marginBottom: "28px" }}>
              Choose a password for your operator account.
            </p>

            <form onSubmit={handleReset}>
              {error && (
                <div style={{
                  background: "#1a0a0a",
                  border: "1px solid #4a1a1a",
                  borderRadius: "8px",
                  padding: "12px",
                  color: "#f87171",
                  fontSize: "13px",
                  marginBottom: "16px",
                }}>
                  {error}
                </div>
              )}

              <label style={{ display: "block", color: "#888", fontSize: "12px", marginBottom: "6px" }}>
                New Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 8 characters"
                required
                autoFocus
                style={{
                  width: "100%",
                  background: "#0d0d0d",
                  border: "1px solid #2a2a2a",
                  borderRadius: "8px",
                  padding: "12px 14px",
                  color: "#fff",
                  fontSize: "14px",
                  marginBottom: "16px",
                  boxSizing: "border-box",
                  outline: "none",
                }}
              />

              <label style={{ display: "block", color: "#888", fontSize: "12px", marginBottom: "6px" }}>
                Confirm Password
              </label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Repeat password"
                required
                style={{
                  width: "100%",
                  background: "#0d0d0d",
                  border: "1px solid #2a2a2a",
                  borderRadius: "8px",
                  padding: "12px 14px",
                  color: "#fff",
                  fontSize: "14px",
                  marginBottom: "24px",
                  boxSizing: "border-box",
                  outline: "none",
                }}
              />

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: "100%",
                  background: loading ? "#1a3a5c" : "#1d4ed8",
                  color: "#fff",
                  border: "none",
                  borderRadius: "8px",
                  padding: "13px",
                  fontSize: "15px",
                  fontWeight: 600,
                  cursor: loading ? "not-allowed" : "pointer",
                }}
              >
                {loading ? "Saving…" : "Set Password"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
