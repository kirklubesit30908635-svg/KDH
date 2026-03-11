"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/supabaseBrowser";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const supabase = createBrowserSupabaseClient();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error: authErr } = await supabase.auth.signInWithPassword({ email, password });

    setLoading(false);

    if (authErr) {
      setError(authErr.message);
    } else {
      router.push("/command");
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
        <h1 style={{ color: "#fff", fontSize: "22px", fontWeight: 700, marginBottom: "6px" }}>
          Operator Sign-in
        </h1>
        <p style={{ color: "#666", fontSize: "14px", marginBottom: "28px" }}>
          Kernel access requires authentication.
        </p>

        <form onSubmit={handleLogin}>
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
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="operator@example.com"
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
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
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
              transition: "background 0.2s",
            }}
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
