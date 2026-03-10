"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError("Invalid login credentials");
    } else {
      window.location.href = "/command";
    }
    setLoading(false);
  };

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter', sans-serif" }}>
      <div style={{ backgroundColor: "#111", border: "1px solid #222", borderRadius: "8px", padding: "40px", width: "100%", maxWidth: "380px" }}>
        <div style={{ marginBottom: "28px" }}>
          <p style={{ color: "#666", fontSize: "11px", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "6px" }}>AutoKirk Systems</p>
          <h1 style={{ color: "#fff", fontSize: "22px", fontWeight: "600", margin: 0 }}>Operator Sign-in</h1>
          <p style={{ color: "#555", fontSize: "13px", marginTop: "6px" }}>Kernel access requires authentication.</p>
        </div>
        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", color: "#888", fontSize: "11px", letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: "6px" }}>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" style={{ width: "100%", backgroundColor: "#0d0d0d", border: "1px solid #2a2a2a", borderRadius: "4px", padding: "10px 12px", color: "#fff", fontSize: "14px", outline: "none", boxSizing: "border-box" }} />
          </div>
          <div style={{ marginBottom: "20px" }}>
            <label style={{ display: "block", color: "#888", fontSize: "11px", letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: "6px" }}>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" style={{ width: "100%", backgroundColor: "#0d0d0d", border: "1px solid #2a2a2a", borderRadius: "4px", padding: "10px 12px", color: "#fff", fontSize: "14px", outline: "none", boxSizing: "border-box" }} />
          </div>
          {error && <p style={{ color: "#e05252", fontSize: "12px", marginBottom: "16px" }}>{error}</p>}
          <button type="submit" disabled={loading} style={{ width: "100%", backgroundColor: "#1a56db", color: "#fff", border: "none", borderRadius: "4px", padding: "11px", fontSize: "14px", fontWeight: "500", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1 }}>
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
