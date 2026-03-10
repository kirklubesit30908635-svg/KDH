"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/supabaseBrowser";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [phase, setPhase]       = useState<"idle" | "auth" | "ok">("idle");
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const supabase = createBrowserSupabaseClient();

  /* ── Matrix rain ──────────────────────────────────────────────────── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener("resize", resize);

    const chars = "アイウエオカキクケコサシスセソ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let drops = Array(Math.floor(canvas.width / 20)).fill(1);

    const draw = () => {
      ctx.fillStyle = "rgba(0,0,0,0.055)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      drops.forEach((y, i) => {
        ctx.fillStyle = Math.random() > 0.92 ? "#00f5ff" : "#00ff41";
        ctx.globalAlpha = Math.random() * 0.5 + 0.15;
        ctx.font = "13px monospace";
        ctx.fillText(chars[Math.floor(Math.random() * chars.length)], i * 20, y * 20);
        ctx.globalAlpha = 1;
        if (y * 20 > canvas.height && Math.random() > 0.975) drops[i] = 0;
        drops[i]++;
      });
    };
    const id = setInterval(draw, 55);
    return () => { clearInterval(id); window.removeEventListener("resize", resize); };
  }, []);

  /* ── Submit ───────────────────────────────────────────────────────── */
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    setPhase("auth");

    const { error: authErr } = await supabase.auth.signInWithPassword({ email, password });

    if (authErr) {
      setError(authErr.message);
      setLoading(false);
      setPhase("idle");
    } else {
      setPhase("ok");
      setTimeout(() => router.push("/command"), 900);
    }
  }

  return (
    <>
      <style>{`
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        :root{
          --black:#000;--neon:#00ff41;--neon2:#00e636;
          --neon-dim:rgba(0,255,65,0.12);--neon-glow:rgba(0,255,65,0.35);
          --cyan:#00f5ff;--ghost:rgba(0,255,65,0.18);--red:#ff3b30;
        }
        html,body{height:100%;background:#000;overflow:hidden}
        body{font-family:'Share Tech Mono',monospace;color:var(--neon)}
        body::before{
          content:'';position:fixed;inset:0;
          background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,.12) 2px,rgba(0,0,0,.12) 4px);
          pointer-events:none;z-index:1
        }
        body::after{
          content:'';position:fixed;inset:0;
          background:radial-gradient(ellipse at center,transparent 55%,rgba(0,0,0,.75) 100%);
          pointer-events:none;z-index:1
        }

        /* ── layout ── */
        .page{
          position:relative;z-index:2;height:100vh;
          display:flex;flex-direction:column;align-items:center;justify-content:center;
          padding:24px
        }

        /* ── logo bar ── */
        .logo-row{
          display:flex;align-items:center;gap:14px;margin-bottom:48px
        }
        .logo{
          font-family:'Orbitron',sans-serif;font-weight:900;font-size:22px;
          letter-spacing:.28em;color:var(--neon);
          text-shadow:0 0 24px var(--neon),0 0 48px var(--neon-glow)
        }
        .logo-sep{width:1px;height:22px;background:var(--ghost)}
        .logo-sub{font-size:9px;letter-spacing:.3em;color:rgba(0,255,65,.35);text-transform:uppercase}

        /* ── card ── */
        .card{
          width:100%;max-width:440px;
          background:rgba(0,6,1,.88);
          border:1px solid var(--ghost);
          box-shadow:0 0 0 1px rgba(0,255,65,.06),0 32px 80px rgba(0,0,0,.85),0 0 60px rgba(0,255,65,.04);
          backdrop-filter:blur(6px);
          position:relative;overflow:hidden
        }
        .card::before{content:'';position:absolute;top:0;left:0;width:20px;height:1px;background:var(--neon);box-shadow:0 0 8px var(--neon)}
        .card::after{content:'';position:absolute;top:0;left:0;width:1px;height:20px;background:var(--neon);box-shadow:0 0 8px var(--neon)}
        .card-corner-br{position:absolute;bottom:0;right:0;width:20px;height:1px;background:rgba(0,255,65,.3)}
        .card-corner-br::after{content:'';position:absolute;bottom:0;right:0;width:1px;height:20px;background:rgba(0,255,65,.3)}

        .card-scan{
          position:absolute;top:0;left:0;right:0;height:1px;
          background:linear-gradient(90deg,transparent,var(--neon),transparent);
          animation:scan 4s linear infinite;opacity:.35;z-index:1
        }
        @keyframes scan{0%{top:-1px}100%{top:100%}}

        /* ── card header ── */
        .card-head{
          padding:28px 32px 24px;
          border-bottom:1px solid rgba(0,255,65,.08);
          position:relative;z-index:2
        }
        .card-eyebrow{font-size:8px;letter-spacing:.35em;color:rgba(0,255,65,.35);margin-bottom:10px}
        .card-title{
          font-family:'Orbitron',sans-serif;font-weight:700;font-size:18px;
          letter-spacing:.08em;color:var(--neon);
          text-shadow:0 0 16px rgba(0,255,65,.25);
          position:relative
        }
        .card-title::before{
          content:attr(data-text);position:absolute;top:0;left:-1px;
          color:var(--cyan);opacity:.25;
          clip-path:polygon(0 20%,100% 20%,100% 45%,0 45%);
          animation:gt1 6s ease infinite
        }
        @keyframes gt1{0%,88%,100%{transform:translateX(0)}89%{transform:translateX(-3px)}90%{transform:translateX(3px)}91%{transform:translateX(0)}}
        .card-desc{margin-top:6px;font-size:10px;letter-spacing:.1em;color:rgba(0,255,65,.3);line-height:1.7}

        /* ── card body ── */
        .card-body{padding:28px 32px 32px;position:relative;z-index:2}

        /* ── field ── */
        .field{margin-bottom:20px}
        .field-label{
          display:block;font-size:8px;letter-spacing:.3em;
          color:rgba(0,255,65,.4);margin-bottom:8px;text-transform:uppercase
        }
        .field-wrap{position:relative}
        .field-prefix{
          position:absolute;left:14px;top:50%;transform:translateY(-50%);
          font-size:10px;color:rgba(0,255,65,.3);pointer-events:none;letter-spacing:.05em
        }
        .field-input{
          width:100%;background:rgba(0,10,2,.7);
          border:1px solid rgba(0,255,65,.2);
          color:var(--neon);font-family:'Share Tech Mono',monospace;
          font-size:13px;letter-spacing:.08em;
          padding:13px 14px 13px 44px;
          outline:none;transition:border-color .2s,box-shadow .2s;
          -webkit-text-fill-color:var(--neon)
        }
        .field-input::placeholder{color:rgba(0,255,65,.2);letter-spacing:.06em}
        .field-input:focus{
          border-color:rgba(0,255,65,.55);
          box-shadow:0 0 0 1px rgba(0,255,65,.12),inset 0 0 16px rgba(0,255,65,.03)
        }
        .field-input:-webkit-autofill,
        .field-input:-webkit-autofill:focus{
          -webkit-text-fill-color:var(--neon)!important;
          -webkit-box-shadow:0 0 0 1000px rgba(0,10,2,.95) inset!important;
          transition:background-color 5000s ease-in-out 0s
        }

        /* ── error ── */
        .err{
          margin-bottom:18px;padding:10px 14px;
          border:1px solid rgba(255,59,48,.3);background:rgba(255,59,48,.06);
          font-size:10px;letter-spacing:.08em;color:#ff3b30;line-height:1.6;
          display:flex;align-items:flex-start;gap:8px
        }
        .err-icon{flex-shrink:0;font-size:11px;margin-top:1px}

        /* ── submit ── */
        .submit{
          width:100%;position:relative;overflow:hidden;
          font-family:'Orbitron',sans-serif;font-weight:700;
          font-size:10px;letter-spacing:.22em;text-transform:uppercase;
          color:#000;background:var(--neon);
          padding:15px 24px;border:1px solid var(--neon);
          clip-path:polygon(8px 0,100% 0,calc(100% - 8px) 100%,0 100%);
          box-shadow:0 0 28px var(--neon-dim);
          transition:all .2s;cursor:pointer;
          display:flex;align-items:center;justify-content:center;gap:10px
        }
        .submit:hover:not(:disabled){
          background:transparent;color:var(--neon);
          box-shadow:0 0 48px var(--neon-glow)
        }
        .submit:disabled{opacity:.55;cursor:not-allowed}
        .submit-shimmer{
          position:absolute;inset:0;
          background:linear-gradient(105deg,transparent 35%,rgba(255,255,255,.15) 50%,transparent 65%);
          animation:shimmer 2.5s ease infinite
        }
        @keyframes shimmer{0%{transform:translateX(-100%)}100%{transform:translateX(200%)}}

        .dots span{display:inline-block;animation:dot-blink 1.2s step-end infinite}
        .dots span:nth-child(2){animation-delay:.2s}
        .dots span:nth-child(3){animation-delay:.4s}
        @keyframes dot-blink{0%,100%{opacity:1}50%{opacity:0}}

        .ok-flash{
          position:absolute;inset:0;background:rgba(0,255,65,.05);
          animation:ok-pulse .4s ease forwards;z-index:3
        }
        @keyframes ok-pulse{0%{opacity:0}50%{opacity:1}100%{opacity:0}}

        /* ── footer ── */
        .card-footer{
          padding:16px 32px;border-top:1px solid rgba(0,255,65,.06);
          display:flex;align-items:center;justify-content:space-between;
          position:relative;z-index:2
        }
        .footer-status{display:flex;align-items:center;gap:6px;font-size:8px;letter-spacing:.2em;color:rgba(0,255,65,.3)}
        .status-dot{width:5px;height:5px;border-radius:50%;background:var(--neon);box-shadow:0 0 6px var(--neon);animation:ping 1.8s ease infinite}
        @keyframes ping{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.5);opacity:.6}}
        .footer-link{
          font-size:8px;letter-spacing:.2em;color:rgba(0,255,65,.25);
          text-decoration:none;transition:color .2s
        }
        .footer-link:hover{color:var(--neon)}

        /* ── below card ── */
        .below{margin-top:28px;text-align:center;font-size:8px;letter-spacing:.25em;color:rgba(0,255,65,.18)}
      `}</style>

      <link href="https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Orbitron:wght@700;900&display=swap" rel="stylesheet" />

      {/* Matrix canvas */}
      <canvas ref={canvasRef} style={{ position:"fixed", inset:0, width:"100%", height:"100%", zIndex:0, opacity:.09, pointerEvents:"none" }} />

      <div className="page">

        <div className="logo-row">
          <span className="logo">AUTOKIRK</span>
          <span className="logo-sep" />
          <span className="logo-sub">Enforcement OS</span>
        </div>

        <div className="card">
          <div className="card-scan" />
          {phase === "ok" && <div className="ok-flash" />}
          <div className="card-corner-br" />

          <div className="card-head">
            <div className="card-eyebrow">// OPERATOR ACCESS //</div>
            <div className="card-title" data-text="AUTHENTICATE">AUTHENTICATE</div>
            <div className="card-desc">
              Kernel access is restricted to authorised operators.<br />
              All sessions are logged to the append-only ledger.
            </div>
          </div>

          <div className="card-body">
            <form onSubmit={handleLogin}>

              {error && (
                <div className="err">
                  <span className="err-icon">✕</span>
                  <span>{error}</span>
                </div>
              )}

              <div className="field">
                <label className="field-label">Operator ID (email)</label>
                <div className="field-wrap">
                  <span className="field-prefix">OP://</span>
                  <input
                    className="field-input"
                    type="email"
                    placeholder="operator@domain.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    autoFocus
                  />
                </div>
              </div>

              <div className="field">
                <label className="field-label">Access Key</label>
                <div className="field-wrap">
                  <span className="field-prefix">KEY://</span>
                  <input
                    className="field-input"
                    type="password"
                    placeholder="••••••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                  />
                </div>
              </div>

              <button className="submit" type="submit" disabled={loading}>
                <div className="submit-shimmer" />
                {phase === "ok" ? (
                  <span>✓ ACCESS GRANTED</span>
                ) : phase === "auth" ? (
                  <span>AUTHENTICATING<span className="dots"><span>.</span><span>.</span><span>.</span></span></span>
                ) : (
                  <span>→ ENTER KERNEL</span>
                )}
              </button>
            </form>
          </div>

          <div className="card-footer">
            <div className="footer-status">
              <div className="status-dot" />
              KERNEL LIVE
            </div>
            <a href="/" className="footer-link">← BACK TO SYSTEM</a>
          </div>
        </div>

        <div className="below">APPEND-ONLY · ZERO DIRECT MUTATIONS · IMMUTABLE LEDGER</div>
      </div>
    </>
  );
}
