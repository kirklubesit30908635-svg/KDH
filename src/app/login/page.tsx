"use client";

import { useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/supabaseBrowser";

export default function LoginPage() {
  const [email, setEmail]     = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent]       = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const supabase = createBrowserSupabaseClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error: otpErr } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: "https://www.autokirk.com/command" },
    });

    setLoading(false);

    if (otpErr) {
      setError(otpErr.message);
    } else {
      setSent(true);
    }
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "#000000",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "'Courier New', Courier, monospace",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Subtle scanline overlay */}
      <div style={{
        position: "absolute",
        inset: 0,
        backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,0,0.015) 2px, rgba(0,255,0,0.015) 4px)",
        pointerEvents: "none",
        zIndex: 0,
      }} />

      {/* Header bar — matches the app */}
      <div style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        padding: "14px 24px",
        borderBottom: "1px solid #0f2a0f",
        zIndex: 1,
      }}>
        <span style={{
          color: "#39ff14",
          fontSize: "12px",
          fontWeight: 700,
          letterSpacing: "0.2em",
          textTransform: "uppercase",
        }}>
          AUTO KIRK &bull; OPERATOR CONSOLE
        </span>
      </div>

      {/* Main card */}
      <div style={{
        position: "relative",
        zIndex: 1,
        width: "100%",
        maxWidth: "420px",
        padding: "0 20px",
      }}>
        {sent ? (
          <div>
            {/* Sent confirmation */}
            <p style={{
              color: "#39ff14",
              fontSize: "11px",
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              marginBottom: "12px",
            }}>
              LINK DISPATCHED
            </p>
            <h1 style={{
              color: "#39ff14",
              fontSize: "36px",
              fontWeight: 700,
              lineHeight: 1.1,
              marginBottom: "16px",
              letterSpacing: "-0.01em",
            }}>
              Check your<br />email.
            </h1>
            <p style={{
              color: "#666",
              fontSize: "13px",
              lineHeight: "1.7",
              marginBottom: "32px",
            }}>
              A sign-in link was sent to{" "}
              <span style={{ color: "#aaa" }}>{email}</span>.
              <br />
              Click it to access the console.
            </p>
            <button
              onClick={() => { setSent(false); setEmail(""); }}
              style={{
                background: "none",
                border: "none",
                color: "#39ff14",
                fontSize: "12px",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                cursor: "pointer",
                padding: 0,
                opacity: 0.6,
              }}
            >
              &larr; Use a different email
            </button>
          </div>
        ) : (
          <div>
            {/* Label */}
            <p style={{
              color: "#39ff14",
              fontSize: "11px",
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              marginBottom: "12px",
            }}>
              OPERATOR SIGN-IN
            </p>

            {/* Headline */}
            <h1 style={{
              color: "#ffffff",
              fontSize: "36px",
              fontWeight: 700,
              lineHeight: 1.1,
              marginBottom: "8px",
              letterSpacing: "-0.01em",
            }}>
              Access the<br />console.
            </h1>
            <p style={{
              color: "#555",
              fontSize: "13px",
              marginBottom: "36px",
              letterSpacing: "0.02em",
            }}>
              Enter your email — we&apos;ll send a sign-in link.
            </p>

            <form onSubmit={handleSubmit}>
              {error && (
                <div style={{
                  border: "1px solid #39ff14",
                  borderLeft: "3px solid #39ff14",
                  padding: "10px 14px",
                  color: "#39ff14",
                  fontSize: "12px",
                  marginBottom: "20px",
                  letterSpacing: "0.04em",
                  background: "rgba(57,255,20,0.04)",
                }}>
                  {error}
                </div>
              )}

              <label style={{
                display: "block",
                color: "#39ff14",
                fontSize: "10px",
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                marginBottom: "8px",
              }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="operator@autokirk.com"
                required
                autoFocus
                style={{
                  width: "100%",
                  background: "#000",
                  border: "1px solid #1a3a1a",
                  borderBottom: "2px solid #39ff14",
                  padding: "12px 0",
                  color: "#fff",
                  fontSize: "15px",
                  marginBottom: "32px",
                  boxSizing: "border-box",
                  outline: "none",
                  fontFamily: "'Courier New', Courier, monospace",
                  letterSpacing: "0.04em",
                  borderRadius: 0,
                }}
              />

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: "100%",
                  background: loading ? "transparent" : "#39ff14",
                  color: loading ? "#39ff14" : "#000",
                  border: "1px solid #39ff14",
                  padding: "14px",
                  fontSize: "12px",
                  fontWeight: 700,
                  letterSpacing: "0.2em",
                  textTransform: "uppercase",
                  cursor: loading ? "not-allowed" : "pointer",
                  fontFamily: "'Courier New', Courier, monospace",
                  borderRadius: 0,
                  transition: "all 0.15s",
                }}
              >
                {loading ? "DISPATCHING…" : "SEND SIGN-IN LINK"}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
