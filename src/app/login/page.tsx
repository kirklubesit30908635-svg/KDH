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
      options: { emailRedirectTo: "https://autokirk.com/auth/callback" },
    });
    setLoading(false);
    if (otpErr) { setError(otpErr.message); } else { setSent(true); }
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Orbitron:wght@700;900&family=Share+Tech+Mono&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --black:   #000000;
          --bg:      #030805;
          --green:   #39ff14;
          --green2:  #22c55e;
          --green-dim: rgba(57,255,20,0.08);
          --green-glow: rgba(57,255,20,0.35);
          --green-ghost: rgba(57,255,20,0.18);
          --panel:   rgba(6,14,8,0.95);
          --border:  rgba(57,255,20,0.14);
          --border-hi: rgba(57,255,20,0.35);
          --grey:    #1c1c1c;
          --grey2:   #2a2a2a;
          --grey3:   #3a3a3a;
          --muted:   rgba(57,255,20,0.35);
          --text:    rgba(57,255,20,0.85);
        }

        html, body {
          height: 100%;
          background: var(--bg);
          color: var(--text);
          font-family: 'Inter', system-ui, sans-serif;
          overflow: hidden;
        }

        /* Noise texture */
        body::before {
          content: '';
          position: fixed;
          inset: 0;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.035'/%3E%3C/svg%3E");
          background-size: 256px;
          pointer-events: none;
          z-index: 0;
          opacity: 0.6;
        }

        /* Subtle radial vignette */
        body::after {
          content: '';
          position: fixed;
          inset: 0;
          background: radial-gradient(ellipse 80% 80% at 50% 50%, transparent 40%, rgba(0,0,0,0.7) 100%);
          pointer-events: none;
          z-index: 0;
        }

        /* ── LAYOUT ── */
        .page {
          position: relative;
          z-index: 1;
          height: 100vh;
          display: grid;
          grid-template-rows: 48px 1fr;
        }

        /* ── TOP BAR ── (matches integrity page exactly) */
        .topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 28px;
          border-bottom: 1px solid var(--border);
          background: rgba(0,0,0,0.6);
          backdrop-filter: blur(12px);
        }
        .topbar-left {
          font-family: 'Share Tech Mono', monospace;
          font-size: 11px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--green);
        }
        .topbar-right {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 10px;
          letter-spacing: 0.12em;
          color: var(--muted);
          font-family: 'Share Tech Mono', monospace;
        }
        .live-dot {
          width: 6px; height: 6px;
          background: var(--green);
          border-radius: 50%;
          box-shadow: 0 0 6px var(--green);
          animation: pulse 2s ease infinite;
        }
        @keyframes pulse {
          0%,100% { opacity:1; transform:scale(1); }
          50%      { opacity:.6; transform:scale(1.3); }
        }

        /* ── MAIN SPLIT ── */
        .main {
          display: grid;
          grid-template-columns: 1fr 420px;
          height: 100%;
          overflow: hidden;
        }

        /* ── LEFT PANEL ── */
        .left {
          padding: 52px 56px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          border-right: 1px solid var(--border);
          position: relative;
          overflow: hidden;
          animation: fadeUp 0.6s ease forwards;
        }

        /* Animated grid lines on left */
        .left::before {
          content: '';
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(57,255,20,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(57,255,20,0.03) 1px, transparent 1px);
          background-size: 48px 48px;
          pointer-events: none;
          animation: gridMove 25s linear infinite;
        }
        @keyframes gridMove {
          from { background-position: 0 0; }
          to   { background-position: 48px 48px; }
        }

        .brand-eyebrow {
          font-family: 'Share Tech Mono', monospace;
          font-size: 10px;
          letter-spacing: 0.3em;
          color: var(--muted);
          text-transform: uppercase;
          margin-bottom: 18px;
          animation: fadeUp 0.5s 0.1s ease both;
        }
        .brand-name {
          font-family: 'Orbitron', sans-serif;
          font-weight: 900;
          font-size: clamp(42px, 5.5vw, 72px);
          line-height: 0.9;
          color: var(--green);
          letter-spacing: 0.04em;
          text-shadow: 0 0 40px rgba(57,255,20,0.3), 0 0 80px rgba(57,255,20,0.1);
          margin-bottom: 6px;
          animation: fadeUp 0.5s 0.15s ease both;
        }
        .brand-sub {
          font-family: 'Share Tech Mono', monospace;
          font-size: 13px;
          letter-spacing: 0.25em;
          color: var(--muted);
          text-transform: uppercase;
          margin-bottom: 48px;
          animation: fadeUp 0.5s 0.2s ease both;
        }
        .brand-desc {
          font-size: 13px;
          line-height: 1.75;
          color: rgba(57,255,20,0.45);
          max-width: 440px;
          letter-spacing: 0.01em;
          margin-bottom: 52px;
          animation: fadeUp 0.5s 0.25s ease both;
        }
        .brand-desc strong { color: var(--text); font-weight: 500; }

        /* ── BENTO STATS GRID ── */
        .bento {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          max-width: 480px;
          animation: fadeUp 0.5s 0.3s ease both;
        }
        .stat-card {
          background: var(--panel);
          border: 1px solid var(--border);
          padding: 18px 20px;
          position: relative;
          overflow: hidden;
          transition: border-color 0.2s, background 0.2s;
        }
        .stat-card::before {
          content: '';
          position: absolute;
          top: 0; left: 0;
          width: 100%; height: 1px;
          background: linear-gradient(90deg, transparent, var(--green-ghost), transparent);
        }
        .stat-card:hover {
          border-color: var(--border-hi);
          background: rgba(57,255,20,0.04);
        }
        .stat-card.wide { grid-column: span 2; }
        .stat-label {
          font-family: 'Share Tech Mono', monospace;
          font-size: 9px;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: rgba(57,255,20,0.35);
          margin-bottom: 8px;
        }
        .stat-value {
          font-family: 'Orbitron', sans-serif;
          font-weight: 700;
          font-size: 28px;
          color: var(--green);
          line-height: 1;
          text-shadow: 0 0 20px rgba(57,255,20,0.3);
        }
        .stat-value.grey { color: var(--grey3); text-shadow: none; }
        .stat-sub {
          margin-top: 5px;
          font-size: 10px;
          color: rgba(57,255,20,0.3);
          letter-spacing: 0.06em;
          font-family: 'Share Tech Mono', monospace;
        }
        .stat-bar {
          margin-top: 10px;
          height: 2px;
          background: var(--grey);
          border-radius: 1px;
          overflow: hidden;
        }
        .stat-bar-fill {
          height: 100%;
          background: var(--green);
          box-shadow: 0 0 8px var(--green);
          animation: barFill 1.2s 0.8s ease both;
        }
        @keyframes barFill {
          from { width: 0 !important; }
        }

        /* ── RIGHT PANEL (FORM) ── */
        .right {
          padding: 52px 48px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          background: rgba(0,0,0,0.4);
          backdrop-filter: blur(8px);
          animation: fadeUp 0.6s 0.2s ease both;
        }

        .form-eyebrow {
          font-family: 'Share Tech Mono', monospace;
          font-size: 9px;
          letter-spacing: 0.3em;
          text-transform: uppercase;
          color: var(--muted);
          margin-bottom: 16px;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .form-eyebrow::before { content: '//'; color: rgba(57,255,20,0.2); }

        .form-headline {
          font-family: 'Orbitron', sans-serif;
          font-weight: 900;
          font-size: clamp(28px, 3vw, 38px);
          line-height: 0.95;
          letter-spacing: 0.03em;
          color: var(--green);
          text-shadow: 0 0 30px rgba(57,255,20,0.2);
          margin-bottom: 10px;
        }
        .form-sub {
          font-size: 12px;
          color: rgba(57,255,20,0.35);
          letter-spacing: 0.04em;
          line-height: 1.6;
          margin-bottom: 40px;
          font-family: 'Share Tech Mono', monospace;
        }

        .field-label {
          font-family: 'Share Tech Mono', monospace;
          font-size: 9px;
          letter-spacing: 0.25em;
          text-transform: uppercase;
          color: rgba(57,255,20,0.4);
          margin-bottom: 10px;
          display: block;
        }
        .field-input {
          width: 100%;
          background: transparent;
          border: none;
          border-bottom: 1px solid rgba(57,255,20,0.2);
          padding: 10px 0;
          font-family: 'Share Tech Mono', monospace;
          font-size: 14px;
          color: var(--green);
          letter-spacing: 0.06em;
          outline: none;
          transition: border-color 0.25s;
          margin-bottom: 36px;
          caret-color: var(--green);
        }
        .field-input::placeholder { color: rgba(57,255,20,0.2); }
        .field-input:focus { border-bottom-color: var(--green); }

        .err-box {
          border-left: 2px solid var(--green);
          padding: 10px 14px;
          background: rgba(57,255,20,0.05);
          font-family: 'Share Tech Mono', monospace;
          font-size: 11px;
          color: var(--green);
          letter-spacing: 0.05em;
          margin-bottom: 20px;
        }

        .submit-btn {
          position: relative;
          width: 100%;
          padding: 15px 28px;
          font-family: 'Orbitron', sans-serif;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          border: 1px solid var(--green);
          background: var(--green);
          color: #000;
          cursor: pointer;
          clip-path: polygon(12px 0, 100% 0, calc(100% - 12px) 100%, 0 100%);
          transition: background 0.2s, box-shadow 0.2s, color 0.2s;
          overflow: hidden;
        }
        .submit-btn::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, rgba(255,255,255,0.08) 0%, transparent 60%);
          pointer-events: none;
        }
        .submit-btn:hover:not(:disabled) {
          background: transparent;
          color: var(--green);
          box-shadow: 0 0 32px var(--green-glow), inset 0 0 20px rgba(57,255,20,0.05);
        }
        .submit-btn:disabled {
          background: transparent;
          color: rgba(57,255,20,0.3);
          cursor: not-allowed;
        }

        .form-trust {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-top: 24px;
        }
        .trust-item {
          display: flex;
          align-items: center;
          gap: 5px;
          font-family: 'Share Tech Mono', monospace;
          font-size: 9px;
          letter-spacing: 0.12em;
          color: rgba(57,255,20,0.25);
          text-transform: uppercase;
        }
        .trust-dot {
          width: 4px; height: 4px;
          background: var(--grey3);
          border-radius: 50%;
        }
        .trust-dot.green { background: var(--green); box-shadow: 0 0 4px var(--green); }

        /* ── SENT STATE ── */
        .sent-wrap {
          animation: fadeUp 0.4s ease both;
        }
        .sent-icon-row {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 20px;
          font-family: 'Share Tech Mono', monospace;
          font-size: 10px;
          letter-spacing: 0.2em;
          color: var(--green);
        }
        .sent-icon-row::before {
          content: '';
          display: block;
          width: 28px; height: 1px;
          background: var(--green);
          box-shadow: 0 0 6px var(--green);
        }
        .sent-headline {
          font-family: 'Orbitron', sans-serif;
          font-weight: 900;
          font-size: 34px;
          line-height: 0.95;
          color: var(--green);
          text-shadow: 0 0 30px rgba(57,255,20,0.25);
          margin-bottom: 20px;
        }
        .sent-body {
          font-size: 12px;
          font-family: 'Share Tech Mono', monospace;
          color: rgba(57,255,20,0.4);
          line-height: 1.9;
          letter-spacing: 0.05em;
          margin-bottom: 32px;
        }
        .sent-body strong { color: var(--text); font-weight: 400; }
        .back-link {
          background: none; border: none;
          font-family: 'Share Tech Mono', monospace;
          font-size: 9px;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: rgba(57,255,20,0.3);
          cursor: pointer;
          padding: 0;
          transition: color 0.2s;
        }
        .back-link:hover { color: var(--green); }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* ── RESPONSIVE ── */
        @media (max-width: 900px) {
          html, body { overflow: auto; }
          .main { grid-template-columns: 1fr; grid-template-rows: auto auto; }
          .left { padding: 40px 28px; border-right: none; border-bottom: 1px solid var(--border); }
          .right { padding: 40px 28px; }
          .bento { max-width: 100%; }
        }
      `}</style>

      <div className="page">

        {/* ── TOP BAR — matches integrity page ── */}
        <header className="topbar">
          <span className="topbar-left">AUTO KIRK &bull; OPERATOR CONSOLE</span>
          <div className="topbar-right">
            <div className="live-dot" />
            KERNEL LIVE
          </div>
        </header>

        <div className="main">

          {/* ── LEFT — brand + bento stats ── */}
          <div className="left">
            <p className="brand-eyebrow">Enforcement Operating System</p>
            <h1 className="brand-name">AUTO<br />KIRK</h1>
            <p className="brand-sub">// KERNEL v1.0</p>
            <p className="brand-desc">
              Every business action flows through the{" "}
              <strong>proposal → approval → execution → receipt</strong>{" "}
              chain. Append-only ledger. SHA-256 fingerprinted.{" "}
              <strong>No shortcuts. No hiding.</strong>
            </p>

            {/* Bento stats grid */}
            <div className="bento">
              <div className="stat-card">
                <div className="stat-label">Integrity Score</div>
                <div className="stat-value">100</div>
                <div className="stat-sub">GOVERNANCE CLEAN</div>
                <div className="stat-bar"><div className="stat-bar-fill" style={{width:"100%"}} /></div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Breach Rate</div>
                <div className="stat-value">0%</div>
                <div className="stat-sub">0 OVERDUE</div>
                <div className="stat-bar"><div className="stat-bar-fill" style={{width:"100%"}} /></div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Sealed Receipts</div>
                <div className="stat-value">43+</div>
                <div className="stat-sub">SHA-256 FINGERPRINTED</div>
                <div className="stat-bar"><div className="stat-bar-fill" style={{width:"100%"}} /></div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Direct Mutations</div>
                <div className="stat-value grey">0</div>
                <div className="stat-sub">CLIENT NEVER WRITES CORE</div>
                <div className="stat-bar"><div className="stat-bar-fill" style={{width:"0%"}} /></div>
              </div>
            </div>
          </div>

          {/* ── RIGHT — login form ── */}
          <div className="right">
            {sent ? (
              <div className="sent-wrap">
                <div className="sent-icon-row">LINK DISPATCHED</div>
                <div className="sent-headline">CHECK YOUR<br />EMAIL.</div>
                <p className="sent-body">
                  Sign-in link sent to <strong>{email}</strong>.<br />
                  Click it to enter the operator console.<br />
                  Link expires in 1 hour.
                </p>
                <button className="back-link" onClick={() => { setSent(false); setEmail(""); }}>
                  ← USE A DIFFERENT EMAIL
                </button>
              </div>
            ) : (
              <>
                <div className="form-eyebrow">OPERATOR SIGN-IN</div>
                <div className="form-headline">ACCESS THE<br />CONSOLE.</div>
                <p className="form-sub">
                  Enter your email — a sign-in link<br />will be dispatched instantly.
                </p>

                <form onSubmit={handleSubmit}>
                  {error && <div className="err-box">{error}</div>}

                  <label className="field-label">Email Address</label>
                  <input
                    className="field-input"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="operator@autokirk.com"
                    required
                    autoFocus
                  />

                  <button type="submit" disabled={loading} className="submit-btn">
                    {loading ? "DISPATCHING…" : "→ SEND SIGN-IN LINK"}
                  </button>
                </form>

                <div className="form-trust">
                  <div className="trust-item"><div className="trust-dot green" />SECURE</div>
                  <div className="trust-item"><div className="trust-dot green" />NO PASSWORD</div>
                  <div className="trust-item"><div className="trust-dot" />OPERATOR ONLY</div>
                </div>
              </>
            )}
          </div>

        </div>
      </div>
    </>
  );
}
