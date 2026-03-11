"use client";

import { useState, useEffect, useRef } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/supabaseBrowser";

export default function LoginPage() {
  const [email, setEmail]     = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent]       = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const curRef    = useRef<HTMLDivElement>(null);
  const ringRef   = useRef<HTMLDivElement>(null);

  const supabase = createBrowserSupabaseClient();

  // Matrix rain + cursor — identical to homepage
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener("resize", resize);

    const chars = "アイウエオカキクケコサシスセソタチツテトナニヌネノ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let cols = Math.floor(canvas.width / 18);
    let drops = Array(cols).fill(1);

    const draw = () => {
      ctx.fillStyle = "rgba(0,0,0,0.05)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      drops.forEach((y, i) => {
        const c = chars[Math.floor(Math.random() * chars.length)];
        ctx.fillStyle = Math.random() > 0.9 ? "#00f5ff" : "#00ff41";
        ctx.globalAlpha = Math.random() * 0.7 + 0.3;
        ctx.font = "14px monospace";
        ctx.fillText(c, i * 18, y * 18);
        ctx.globalAlpha = 1;
        if (y * 18 > canvas.height && Math.random() > 0.975) drops[i] = 0;
        drops[i]++;
      });
    };
    const interval = setInterval(draw, 50);

    // Cursor
    let mx = 0, my = 0, rx = 0, ry = 0;
    const cur  = curRef.current;
    const ring = ringRef.current;
    const onMove = (e: MouseEvent) => {
      mx = e.clientX; my = e.clientY;
      if (cur) { cur.style.left = mx + "px"; cur.style.top = my + "px"; }
    };
    document.addEventListener("mousemove", onMove);
    let raf: number;
    const animRing = () => {
      rx += (mx - rx) * 0.12;
      ry += (my - ry) * 0.12;
      if (ring) { ring.style.left = rx + "px"; ring.style.top = ry + "px"; }
      raf = requestAnimationFrame(animRing);
    };
    animRing();

    return () => {
      clearInterval(interval);
      cancelAnimationFrame(raf);
      document.removeEventListener("mousemove", onMove);
      window.removeEventListener("resize", resize);
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error: otpErr } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: "https://www.autokirk.com/auth/callback" },
    });

    setLoading(false);
    if (otpErr) { setError(otpErr.message); } else { setSent(true); }
  }

  return (
    <>
      <style>{`
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        :root{
          --black:#000;--deep:#020d05;
          --neon:#00ff41;--neon2:#00e636;
          --neon-dim:rgba(0,255,65,0.15);--neon-glow:rgba(0,255,65,0.4);
          --neon-trace:rgba(0,255,65,0.06);
          --cyan:#00f5ff;--cyan-dim:rgba(0,245,255,0.12);
          --red:#ff003c;--ghost:rgba(0,255,65,0.25);
        }
        html,body{background:var(--black);color:var(--neon);font-family:'Share Tech Mono',monospace;overflow-x:hidden;cursor:none;min-height:100vh}
        *,a{cursor:none}
        #ak-cur{position:fixed;width:3px;height:20px;background:var(--neon);pointer-events:none;z-index:9999;transform:translate(-50%,-50%);box-shadow:0 0 8px var(--neon),0 0 16px var(--neon-glow);animation:cur-blink .8s step-end infinite}
        #ak-ring{position:fixed;width:32px;height:32px;border:1px solid var(--ghost);pointer-events:none;z-index:9998;transform:translate(-50%,-50%) rotate(45deg);transition:width .2s,height .2s}
        @keyframes cur-blink{0%,100%{opacity:1}50%{opacity:0}}
        body::before{content:'';position:fixed;inset:0;background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,.15) 2px,rgba(0,0,0,.15) 4px);pointer-events:none;z-index:998}
        body::after{content:'';position:fixed;inset:0;background:radial-gradient(ellipse at center,transparent 60%,rgba(0,0,0,.6) 100%);pointer-events:none;z-index:997}
        nav{position:fixed;top:0;left:0;right:0;z-index:500;display:flex;align-items:center;justify-content:space-between;padding:0 48px;height:60px;background:rgba(0,0,0,.92);border-bottom:1px solid var(--ghost);backdrop-filter:blur(4px)}
        .nav-logo{font-family:'Orbitron',sans-serif;font-weight:900;font-size:16px;letter-spacing:.25em;color:var(--neon);text-decoration:none;text-shadow:0 0 20px var(--neon),0 0 40px var(--neon-glow)}
        .nav-center{display:flex;align-items:center;gap:32px;font-size:9px;letter-spacing:.2em;color:var(--ghost)}
        .nav-center span{color:var(--neon2)}
        .nav-status{display:flex;align-items:center;gap:8px;font-size:10px;letter-spacing:.15em;color:var(--neon)}
        .status-dot{width:8px;height:8px;background:var(--neon);border-radius:50%;animation:ping 1.5s ease infinite;box-shadow:0 0 6px var(--neon)}
        @keyframes ping{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.4);opacity:.7}}
        .hgrid{position:fixed;inset:0;background-image:linear-gradient(var(--neon-trace) 1px,transparent 1px),linear-gradient(90deg,var(--neon-trace) 1px,transparent 1px);background-size:60px 60px;pointer-events:none;z-index:1;animation:grid-move 20s linear infinite}
        @keyframes grid-move{from{background-position:0 0}to{background-position:60px 60px}}
        .wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;padding-top:60px;position:relative;z-index:2}
        .card{background:rgba(0,10,3,.9);border:1px solid var(--ghost);position:relative;overflow:hidden;width:100%;max-width:480px;margin:0 24px}
        .card::before{content:'';position:absolute;inset:0;background:linear-gradient(135deg,var(--neon-dim) 0%,transparent 50%);pointer-events:none}
        .card::after{content:'';position:absolute;top:0;right:0;width:0;height:0;border-style:solid;border-width:0 20px 20px 0;border-color:transparent var(--black) transparent transparent}
        .card-bar{padding:10px 16px;border-bottom:1px solid var(--ghost);display:flex;align-items:center;justify-content:space-between;background:rgba(0,255,65,.04)}
        .card-title{font-size:9px;letter-spacing:.25em;color:var(--ghost)}
        .card-live{font-size:9px;letter-spacing:.15em;color:var(--neon);animation:cur-blink 1.5s step-end infinite}
        .card-body{padding:40px}
        .eyebrow{font-size:9px;letter-spacing:.35em;color:rgba(0,255,65,.5);margin-bottom:16px;display:flex;align-items:center;gap:10px}
        .eyebrow::before{content:'//';color:rgba(0,255,65,.25)}
        .headline{font-family:'Orbitron',sans-serif;font-weight:900;font-size:clamp(28px,4vw,38px);color:var(--neon);line-height:.95;letter-spacing:.04em;margin-bottom:8px;text-shadow:0 0 30px var(--neon),0 0 60px rgba(0,255,65,.2)}
        .sub{font-size:12px;letter-spacing:.08em;color:rgba(0,255,65,.4);margin-bottom:36px;line-height:1.6}
        .err{border:1px solid var(--neon);border-left:3px solid var(--neon);padding:10px 14px;color:var(--neon);font-size:11px;letter-spacing:.06em;margin-bottom:20px;background:rgba(0,255,65,.05)}
        label{display:block;font-size:9px;letter-spacing:.25em;color:rgba(0,255,65,.5);margin-bottom:8px;text-transform:uppercase}
        input[type=email]{width:100%;background:transparent;border:none;border-bottom:1px solid rgba(0,255,65,.3);padding:10px 0;color:var(--neon);font-size:14px;font-family:'Share Tech Mono',monospace;letter-spacing:.08em;margin-bottom:32px;outline:none;transition:border-color .2s}
        input[type=email]:focus{border-bottom-color:var(--neon);box-shadow:0 2px 0 rgba(0,255,65,.2)}
        input[type=email]::placeholder{color:rgba(0,255,65,.2)}
        .btn{font-family:'Orbitron',sans-serif;font-size:10px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;width:100%;padding:14px 32px;border:1px solid var(--neon);cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;clip-path:polygon(10px 0,100% 0,calc(100% - 10px) 100%,0 100%);transition:all .2s}
        .btn:not(:disabled){background:var(--neon);color:var(--black);box-shadow:0 0 24px var(--neon-dim)}
        .btn:not(:disabled):hover{background:transparent;color:var(--neon);box-shadow:0 0 40px var(--neon-glow)}
        .btn:disabled{background:transparent;color:rgba(0,255,65,.4);cursor:not-allowed}
        .back-btn{margin-top:20px;background:none;border:none;color:rgba(0,255,65,.35);font-size:10px;letter-spacing:.18em;text-transform:uppercase;font-family:'Share Tech Mono',monospace;cursor:none;padding:0;transition:color .2s}
        .back-btn:hover{color:var(--neon)}
        .sent-icon{font-size:10px;letter-spacing:.2em;color:var(--cyan);margin-bottom:20px;display:flex;align-items:center;gap:10px}
        .sent-icon::before{content:'';width:24px;height:1px;background:var(--cyan)}
        .sent-headline{font-family:'Orbitron',sans-serif;font-weight:900;font-size:28px;color:var(--neon);line-height:.95;margin-bottom:16px;text-shadow:0 0 20px var(--neon)}
        .sent-body{font-size:12px;color:rgba(0,255,65,.45);letter-spacing:.06em;line-height:1.8}
        .sent-body strong{color:var(--neon)}
        @keyframes fadeIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        .fadein{animation:fadeIn .5s ease forwards}
        @media(max-width:600px){
          nav{padding:0 20px}
          .nav-center{display:none}
          .card-body{padding:28px 24px}
        }
      `}</style>

      {/* Google Fonts */}
      <link href="https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Orbitron:wght@400;700;900&display=swap" rel="stylesheet" />

      {/* Matrix canvas */}
      <canvas ref={canvasRef} style={{position:"fixed",top:0,left:0,width:"100%",height:"100%",zIndex:0,opacity:.13,pointerEvents:"none"}} />

      {/* Cursor */}
      <div ref={curRef} id="ak-cur" />
      <div ref={ringRef} id="ak-ring" />

      {/* Moving grid */}
      <div className="hgrid" />

      {/* Nav */}
      <nav>
        <a href="/" className="nav-logo">AUTOKIRK</a>
        <div className="nav-center">
          <span>SYS:</span> ENFORCEMENT OS &nbsp;|&nbsp;
          <span>FACE:</span> #003 &nbsp;|&nbsp;
          <span>STATUS:</span> OPERATIONAL
        </div>
        <div className="nav-status">
          <div className="status-dot" />LIVE
        </div>
      </nav>

      {/* Main */}
      <div className="wrap">
        <div className="card fadein">
          <div className="card-bar">
            <span className="card-title">// OPERATOR AUTH //</span>
            <span className="card-live">● SECURE</span>
          </div>

          <div className="card-body">
            {sent ? (
              <>
                <div className="sent-icon">LINK DISPATCHED</div>
                <div className="sent-headline">CHECK YOUR<br />EMAIL.</div>
                <p className="sent-body" style={{marginTop:"16px"}}>
                  Sign-in link sent to <strong>{email}</strong>.<br />
                  Click it to access the operator console.<br />
                  Link expires in 1 hour.
                </p>
                <button
                  className="back-btn"
                  onClick={() => { setSent(false); setEmail(""); }}
                >
                  ← USE A DIFFERENT EMAIL
                </button>
              </>
            ) : (
              <>
                <div className="eyebrow">OPERATOR SIGN-IN</div>
                <div className="headline">ACCESS THE<br />CONSOLE.</div>
                <p className="sub">Enter your email — we&apos;ll dispatch a sign-in link.</p>

                <form onSubmit={handleSubmit}>
                  {error && <div className="err">{error}</div>}

                  <label>Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="operator@autokirk.com"
                    required
                    autoFocus
                  />

                  <button type="submit" disabled={loading} className="btn">
                    {loading ? "DISPATCHING…" : "→ SEND SIGN-IN LINK"}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
