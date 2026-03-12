'use client'

import { useEffect, useRef } from 'react'

export default function HomePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const curRef = useRef<HTMLDivElement>(null)
  const ringRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // MATRIX RAIN
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    const chars = 'アイウエオカキクケコサシスセソタチツテトナニヌネノ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    let cols = Math.floor(canvas.width / 18)
    let drops = Array(cols).fill(1)

    const draw = () => {
      ctx.fillStyle = 'rgba(0,0,0,0.05)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      drops.forEach((y, i) => {
        const c = chars[Math.floor(Math.random() * chars.length)]
        ctx.fillStyle = Math.random() > 0.9 ? '#00f5ff' : '#00ff41'
        ctx.globalAlpha = Math.random() * 0.7 + 0.3
        ctx.font = '14px monospace'
        ctx.fillText(c, i * 18, y * 18)
        ctx.globalAlpha = 1
        if (y * 18 > canvas.height && Math.random() > 0.975) drops[i] = 0
        drops[i]++
      })
    }
    const interval = setInterval(draw, 50)

    // CURSOR
    let mx = 0, my = 0, rx = 0, ry = 0
    const cur = curRef.current
    const ring = ringRef.current
    const onMove = (e: MouseEvent) => {
      mx = e.clientX; my = e.clientY
      if (cur) { cur.style.left = mx + 'px'; cur.style.top = my + 'px' }
    }
    document.addEventListener('mousemove', onMove)
    let raf: number
    const animRing = () => {
      rx += (mx - rx) * 0.12
      ry += (my - ry) * 0.12
      if (ring) { ring.style.left = rx + 'px'; ring.style.top = ry + 'px' }
      raf = requestAnimationFrame(animRing)
    }
    animRing()

    // SCROLL REVEAL
    const obs = new IntersectionObserver(entries => {
      entries.forEach(x => { if (x.isIntersecting) { x.target.classList.add('in'); obs.unobserve(x.target) } })
    }, { threshold: 0.08 })
    document.querySelectorAll('.rev').forEach(el => obs.observe(el))

    // TERMINAL REVEAL
    document.querySelectorAll<HTMLElement>('.tl').forEach((l, i) => {
      l.style.opacity = '0'
      setTimeout(() => { l.style.opacity = '1'; l.style.transition = 'opacity .1s' }, 1000 + i * 120)
    })

    // GLITCH
    const glitchInterval = setInterval(() => {
      const t = document.querySelector<HTMLElement>('.t1')
      if (!t) return
      t.style.transform = 'translateX(-3px) skewX(-1deg)'
      setTimeout(() => { t.style.transform = 'translateX(2px)'; setTimeout(() => { t.style.transform = '' }, 80) }, 60)
    }, 6000)

    // HOVER EFFECTS
    const addHover = () => {
      document.querySelectorAll('a, button').forEach(el => {
        el.addEventListener('mouseenter', () => {
          if (ring) { ring.style.width = '44px'; ring.style.height = '44px'; (ring.style as any).borderColor = 'rgba(0,255,65,.8)' }
        })
        el.addEventListener('mouseleave', () => {
          if (ring) { ring.style.width = '32px'; ring.style.height = '32px'; (ring.style as any).borderColor = 'rgba(0,255,65,.3)' }
        })
      })
    }
    addHover()

    return () => {
      clearInterval(interval)
      clearInterval(glitchInterval)
      cancelAnimationFrame(raf)
      document.removeEventListener('mousemove', onMove)
      window.removeEventListener('resize', resize)
      obs.disconnect()
    }
  }, [])

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
        html{scroll-behavior:smooth}
        body{background:var(--black);color:var(--neon);font-family:'Share Tech Mono',monospace;overflow-x:hidden;cursor:none}
        *,a{cursor:none}
        #ak-cur{position:fixed;width:3px;height:20px;background:var(--neon);pointer-events:none;z-index:9999;transform:translate(-50%,-50%);box-shadow:0 0 8px var(--neon),0 0 16px var(--neon-glow);animation:cur-blink .8s step-end infinite}
        #ak-ring{position:fixed;width:32px;height:32px;border:1px solid var(--ghost);pointer-events:none;z-index:9998;transform:translate(-50%,-50%) rotate(45deg);transition:width .2s,height .2s}
        @keyframes cur-blink{0%,100%{opacity:1}50%{opacity:0}}
        body::before{content:'';position:fixed;inset:0;background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,.15) 2px,rgba(0,0,0,.15) 4px);pointer-events:none;z-index:998}
        body::after{content:'';position:fixed;inset:0;background:radial-gradient(ellipse at center,transparent 60%,rgba(0,0,0,.6) 100%);pointer-events:none;z-index:997;animation:flicker 8s ease infinite}
        @keyframes flicker{0%,100%{opacity:1}92%{opacity:1}93%{opacity:.95}94%{opacity:1}97%{opacity:.97}98%{opacity:1}}
        nav{position:fixed;top:0;left:0;right:0;z-index:500;display:flex;align-items:center;justify-content:space-between;padding:0 48px;height:60px;background:rgba(0,0,0,.92);border-bottom:1px solid var(--ghost);backdrop-filter:blur(4px)}
        .nav-logo{font-family:'Orbitron',sans-serif;font-weight:900;font-size:16px;letter-spacing:.25em;color:var(--neon);text-decoration:none;text-shadow:0 0 20px var(--neon),0 0 40px var(--neon-glow)}
        .nav-center{display:flex;align-items:center;gap:32px;font-size:9px;letter-spacing:.2em;color:var(--ghost)}
        .nav-center span{color:var(--neon2)}
        .nav-status{display:flex;align-items:center;gap:8px;font-size:10px;letter-spacing:.15em;color:var(--neon)}
        .status-dot{width:8px;height:8px;background:var(--neon);border-radius:50%;animation:ping 1.5s ease infinite;box-shadow:0 0 6px var(--neon)}
        @keyframes ping{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.4);opacity:.7}}
        .nav-btn{font-family:'Orbitron',sans-serif;font-size:9px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:var(--black);background:var(--neon);padding:8px 20px;text-decoration:none;border:1px solid var(--neon);transition:all .2s;clip-path:polygon(6px 0,100% 0,calc(100% - 6px) 100%,0 100%);box-shadow:0 0 20px var(--neon-dim)}
        .nav-btn:hover{background:transparent;color:var(--neon);box-shadow:0 0 32px var(--neon-glow)}
        .hero{min-height:100vh;display:grid;grid-template-rows:1fr auto;padding-top:60px;position:relative;z-index:2}
        .hgrid{position:absolute;inset:0;background-image:linear-gradient(var(--neon-trace) 1px,transparent 1px),linear-gradient(90deg,var(--neon-trace) 1px,transparent 1px);background-size:60px 60px;pointer-events:none;animation:grid-move 20s linear infinite}
        @keyframes grid-move{from{background-position:0 0}to{background-position:60px 60px}}
        .hero-main{display:grid;grid-template-columns:1fr 420px;align-items:center;padding:80px 48px;position:relative;z-index:2;gap:60px}
        .boot-seq{font-size:9px;letter-spacing:.2em;color:var(--ghost);margin-bottom:40px;opacity:0;animation:fadeIn .5s .2s ease forwards}
        .boot-seq span{color:var(--neon);animation:cur-blink .5s step-end infinite}
        h1{font-family:'Orbitron',sans-serif;font-weight:900;font-size:clamp(36px,6vw,86px);line-height:.88;letter-spacing:.05em;margin-bottom:48px;opacity:0;animation:glitch-in .6s .3s ease forwards}
        .t1{display:block;color:var(--neon);text-shadow:0 0 30px var(--neon),0 0 60px rgba(0,255,65,.3);position:relative;transition:transform .08s}
        .t1::before{content:'AUTOKIRK';position:absolute;top:0;left:-2px;color:var(--cyan);opacity:.4;clip-path:polygon(0 30%,100% 30%,100% 50%,0 50%);animation:glitch1 4s ease infinite}
        .t1::after{content:'AUTOKIRK';position:absolute;top:0;left:2px;color:var(--red);opacity:.3;clip-path:polygon(0 60%,100% 60%,100% 80%,0 80%);animation:glitch2 4s ease infinite}
        @keyframes glitch1{0%,90%,100%{transform:translateX(0)}91%{transform:translateX(-4px)}92%{transform:translateX(4px)}93%{transform:translateX(0)}}
        @keyframes glitch2{0%,85%,100%{transform:translateX(0)}86%{transform:translateX(4px)}87%{transform:translateX(-4px)}88%{transform:translateX(0)}}
        .t2{display:block;color:transparent;-webkit-text-stroke:1px rgba(0,255,65,.2);font-size:.85em;letter-spacing:.1em}
        .t3{display:block;color:var(--cyan);font-size:.5em;letter-spacing:.4em;text-shadow:0 0 20px var(--cyan);margin-top:8px}
        .tagline{font-size:13px;letter-spacing:.1em;color:rgba(0,255,65,.6);margin-bottom:48px;line-height:1.8;max-width:520px;opacity:0;animation:fadeIn .5s .5s ease forwards}
        .tagline .hi{color:var(--neon);text-shadow:0 0 8px var(--neon)}
        .actions{display:flex;align-items:center;gap:20px;opacity:0;animation:fadeIn .5s .6s ease forwards}
        .btn-primary{font-family:'Orbitron',sans-serif;font-size:10px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:var(--black);background:var(--neon);padding:14px 32px;text-decoration:none;border:1px solid var(--neon);transition:all .2s;display:inline-flex;align-items:center;gap:10px;clip-path:polygon(10px 0,100% 0,calc(100% - 10px) 100%,0 100%);box-shadow:0 0 24px var(--neon-dim)}
        .btn-primary:hover{background:transparent;color:var(--neon);box-shadow:0 0 40px var(--neon-glow);transform:translateY(-1px)}
        .btn-secondary{font-family:'Share Tech Mono',monospace;font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:var(--neon);text-decoration:none;border:1px solid var(--ghost);padding:13px 24px;transition:all .2s}
        .btn-secondary:hover{border-color:var(--neon);box-shadow:inset 0 0 12px var(--neon-dim)}
        .hud{background:rgba(0,10,3,.85);border:1px solid var(--ghost);position:relative;overflow:hidden;opacity:0;animation:fadeIn .5s .7s ease forwards}
        .hud::before{content:'';position:absolute;inset:0;background:linear-gradient(135deg,var(--neon-dim) 0%,transparent 50%);pointer-events:none}
        .hud::after{content:'';position:absolute;top:0;right:0;width:0;height:0;border-style:solid;border-width:0 20px 20px 0;border-color:transparent var(--black) transparent transparent}
        .hud-bar{padding:10px 16px;border-bottom:1px solid var(--ghost);display:flex;align-items:center;justify-content:space-between;background:rgba(0,255,65,.04)}
        .hud-title{font-size:9px;letter-spacing:.25em;color:var(--ghost)}
        .hud-blink{font-size:9px;letter-spacing:.15em;color:var(--neon);animation:cur-blink 1.5s step-end infinite}
        .hud-row{display:flex;justify-content:space-between;align-items:flex-start;padding:11px 16px;border-bottom:1px solid rgba(0,255,65,.05);gap:12px}
        .hud-row:last-child{border-bottom:none}
        .hk{font-size:9px;letter-spacing:.18em;color:rgba(0,255,65,.4);text-transform:uppercase;padding-top:1px;flex-shrink:0}
        .hv{font-size:11px;color:var(--neon);text-align:right;line-height:1.5;text-shadow:0 0 8px var(--neon-dim)}
        .hv small{display:block;font-size:8px;color:rgba(0,255,65,.35);letter-spacing:.12em}
        .hv.lg{font-size:24px;letter-spacing:-.02em;font-weight:500;text-shadow:0 0 16px var(--neon-glow)}
        .hv.cy{color:var(--cyan);text-shadow:0 0 12px rgba(0,245,255,.4)}
        .hbar{border-top:1px solid var(--ghost);display:flex;position:relative;z-index:2}
        .hbi{flex:1;padding:18px 28px;border-right:1px solid var(--ghost);display:flex;align-items:center;gap:16px;transition:background .2s;position:relative;overflow:hidden}
        .hbi:last-child{border-right:none}
        .hbi::before{content:'';position:absolute;bottom:0;left:0;right:0;height:1px;background:var(--neon);transform:scaleX(0);transition:transform .3s ease;box-shadow:0 0 8px var(--neon)}
        .hbi:hover::before{transform:scaleX(1)}
        .hbi:hover{background:var(--neon-trace)}
        .hbn{font-family:'Orbitron',sans-serif;font-weight:700;font-size:24px;color:var(--neon);line-height:1;letter-spacing:-.01em;text-shadow:0 0 12px var(--neon-dim)}
        .hbn.cy{color:var(--cyan);text-shadow:0 0 12px rgba(0,245,255,.3)}
        .hbl{font-size:8px;letter-spacing:.2em;text-transform:uppercase;color:rgba(0,255,65,.4);display:block;margin-bottom:2px}
        .hbs{font-size:11px;color:rgba(0,255,65,.55)}
        .sec{padding:100px 48px;position:relative;z-index:2}
        .sec-bg{background:rgba(0,8,2,.7);border-top:1px solid var(--ghost);border-bottom:1px solid var(--ghost)}
        .inner{max-width:1360px;margin:0 auto}
        .ey{font-size:9px;letter-spacing:.35em;text-transform:uppercase;color:rgba(0,255,65,.5);margin-bottom:16px;display:flex;align-items:center;gap:12px}
        .ey::before{content:'//';color:rgba(0,255,65,.25)}
        h2{font-family:'Orbitron',sans-serif;font-weight:700;font-size:clamp(24px,3.5vw,46px);letter-spacing:.05em;line-height:1;color:var(--neon);margin-bottom:20px;text-shadow:0 0 30px rgba(0,255,65,.2)}
        h2 em{color:var(--cyan);font-style:normal;text-shadow:0 0 20px rgba(0,245,255,.3)}
        .bdesc{font-size:13px;line-height:1.8;color:rgba(0,255,65,.5);max-width:480px;letter-spacing:.04em}
        .cgrid{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid var(--ghost);margin-top:60px;position:relative}
        .cgrid::before{content:'';position:absolute;top:50%;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,var(--ghost),var(--neon-dim),var(--ghost),transparent);pointer-events:none}
        .cs{padding:40px 32px;border-right:1px solid var(--ghost);position:relative;transition:background .2s}
        .cs:last-child{border-right:none}
        .cs:hover{background:var(--neon-trace)}
        .cs::after{content:'→';position:absolute;right:-13px;top:40px;font-size:14px;color:rgba(0,255,65,.3);background:var(--black);z-index:2;padding:2px 0}
        .cs:last-child::after{display:none}
        .cn{font-size:8px;letter-spacing:.25em;color:rgba(0,255,65,.3);margin-bottom:20px}
        .ct{font-family:'Orbitron',sans-serif;font-weight:700;font-size:15px;color:var(--neon);margin-bottom:14px;letter-spacing:.1em;text-shadow:0 0 12px rgba(0,255,65,.2)}
        .cb{font-size:12px;line-height:1.7;color:rgba(0,255,65,.4);letter-spacing:.03em}
        .crpc{margin-top:20px;font-size:9px;color:var(--cyan);letter-spacing:.06em;padding:7px 10px;background:var(--cyan-dim);border-left:2px solid var(--cyan);display:inline-block;text-shadow:0 0 8px rgba(0,245,255,.3)}
        .rg{display:grid;grid-template-columns:340px 1fr;gap:80px;align-items:start}
        .rl{display:flex;flex-direction:column;margin-top:50px}
        .rule{display:flex;gap:20px;padding:22px 0;border-bottom:1px solid rgba(0,255,65,.07);position:relative;transition:all .3s}
        .rule:first-child{border-top:1px solid rgba(0,255,65,.07)}
        .rule::before{content:'';position:absolute;left:-48px;top:0;bottom:0;width:2px;background:linear-gradient(to bottom,transparent,var(--neon),transparent);transform:scaleY(0);transition:transform .4s;box-shadow:0 0 8px var(--neon)}
        .rule:hover::before{transform:scaleY(1)}
        .rule:hover{background:var(--neon-trace);padding-left:8px}
        .rn{font-size:9px;color:rgba(0,255,65,.25);letter-spacing:.15em;padding-top:2px;flex-shrink:0}
        .rtit{font-family:'Orbitron',sans-serif;font-size:12px;font-weight:700;color:var(--neon);margin-bottom:7px;letter-spacing:.08em}
        .rbod{font-size:12px;line-height:1.65;color:rgba(0,255,65,.4)}
        .mg{display:grid;grid-template-columns:repeat(3,1fr);border:1px solid var(--ghost);margin-top:56px}
        .mod{padding:32px 28px;border-right:1px solid var(--ghost);border-bottom:1px solid var(--ghost);position:relative;transition:background .2s;overflow:hidden}
        .mod:nth-child(3n){border-right:none}
        .mod:nth-child(n+4){border-bottom:none}
        .mod:hover{background:var(--neon-trace)}
        .mod::before,.mod::after{content:'';position:absolute;background:var(--neon);box-shadow:0 0 8px var(--neon);transition:opacity .3s;opacity:0}
        .mod::before{top:0;left:0;width:16px;height:1px}
        .mod::after{top:0;left:0;width:1px;height:16px}
        .mod:hover::before,.mod:hover::after{opacity:1}
        .mid{font-size:8px;letter-spacing:.2em;color:rgba(0,255,65,.3);margin-bottom:16px;display:flex;justify-content:space-between}
        .mlv{color:var(--neon);display:flex;align-items:center;gap:5px}
        .mlv::before{content:'';width:4px;height:4px;background:var(--neon);border-radius:50%;box-shadow:0 0 6px var(--neon);animation:ping 2s ease infinite}
        .mn{font-family:'Orbitron',sans-serif;font-weight:700;font-size:13px;color:var(--neon);margin-bottom:10px;letter-spacing:.08em;text-shadow:0 0 10px rgba(0,255,65,.2)}
        .md{font-size:12px;line-height:1.65;color:rgba(0,255,65,.4)}
        .pg{display:grid;grid-template-columns:1fr 1.1fr;gap:72px;align-items:center}
        .schema{font-size:11px;color:rgba(0,255,65,.45);line-height:1.9;margin-top:24px;border-left:1px solid var(--ghost);padding-left:20px;letter-spacing:.04em}
        .schema .k{color:var(--cyan)}
        .schema .v{color:var(--neon)}
        .term{background:#000;border:1px solid var(--ghost);box-shadow:0 0 60px rgba(0,255,65,.07),0 40px 80px rgba(0,0,0,.8);position:relative;overflow:hidden}
        .term::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,var(--neon),transparent);animation:tscan 5s linear infinite;opacity:.4;z-index:2}
        @keyframes tscan{0%{top:-2px}100%{top:100%}}
        .th{padding:12px 18px;border-bottom:1px solid var(--ghost);display:flex;align-items:center;justify-content:space-between;background:rgba(0,255,65,.03)}
        .tds{display:flex;gap:6px}
        .td{width:8px;height:8px;border-radius:50%;background:#1a1a1a}
        .td.on{background:rgba(0,255,65,.5);box-shadow:0 0 6px var(--neon)}
        .ttit{font-size:8px;letter-spacing:.2em;color:rgba(0,255,65,.3)}
        .tver{font-size:8px;color:rgba(0,255,65,.2);letter-spacing:.1em}
        .tb{padding:20px 18px;font-size:11px;line-height:2.1}
        .tl{display:block;transition:opacity .1s}
        .tp{color:rgba(0,255,65,.3)}.tc{color:rgba(0,255,65,.65)}.tk{color:var(--cyan)}.tv{color:rgba(0,255,65,.85)}.ts{color:rgba(255,200,0,.7)}.tok{color:var(--neon);text-shadow:0 0 8px var(--neon)}.tdm{color:rgba(0,255,65,.1)}.tseal{color:var(--neon);font-weight:500;text-shadow:0 0 12px var(--neon)}
        .tcur{display:inline-block;width:7px;height:12px;background:var(--neon);animation:cur-blink .9s step-end infinite;vertical-align:middle;box-shadow:0 0 6px var(--neon)}
        .cls{position:relative;padding:100px 48px;background:var(--deep)}
        .cls-grid{max-width:1360px;margin:0 auto;display:grid;grid-template-columns:1fr auto;gap:80px;align-items:end}
        .cls-title{font-family:'Orbitron',sans-serif;font-weight:900;font-size:clamp(32px,5vw,72px);line-height:.9;letter-spacing:.03em;color:var(--neon);text-shadow:0 0 40px rgba(0,255,65,.2)}
        .cls-title em{color:var(--cyan);font-style:normal;text-shadow:0 0 30px rgba(0,245,255,.3)}
        .cls-sub{margin-top:24px;font-size:13px;line-height:1.8;color:rgba(0,255,65,.45);max-width:520px;letter-spacing:.04em}
        .cls-r{display:flex;flex-direction:column;gap:12px;align-items:flex-start;padding-bottom:6px}
        .blg{font-family:'Orbitron',sans-serif;font-size:10px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:var(--black);background:var(--neon);padding:16px 36px;text-decoration:none;display:inline-flex;align-items:center;gap:10px;transition:all .2s;border:1px solid var(--neon);clip-path:polygon(10px 0,100% 0,calc(100% - 10px) 100%,0 100%);box-shadow:0 0 24px var(--neon-dim);white-space:nowrap}
        .blg:hover{background:transparent;color:var(--neon);box-shadow:0 0 48px var(--neon-glow);transform:translateY(-2px)}
        .bsub{font-size:9px;letter-spacing:.2em;text-transform:uppercase;color:rgba(0,255,65,.3);text-decoration:none;transition:color .2s;padding:6px 0}
        .bsub:hover{color:var(--neon)}
        .dv{display:flex;align-items:center;justify-content:center;padding:32px;gap:16px;position:relative;z-index:2}
        .dv::before,.dv::after{content:'';flex:1;height:1px;background:linear-gradient(90deg,transparent,var(--ghost))}
        .dv-inner{font-size:10px;letter-spacing:.4em;color:rgba(0,255,65,.2)}
        footer{border-top:1px solid var(--ghost);padding:28px 48px;display:flex;align-items:center;justify-content:space-between;position:relative;z-index:2;background:rgba(0,0,0,.95)}
        .fl{display:flex;align-items:center;gap:32px}
        .flog{font-family:'Orbitron',sans-serif;font-weight:900;font-size:13px;letter-spacing:.15em;color:var(--neon);text-decoration:none;text-shadow:0 0 12px var(--neon-dim)}
        .ftg{font-size:8px;letter-spacing:.2em;color:rgba(0,255,65,.25);text-transform:uppercase}
        .fr{font-size:8px;letter-spacing:.15em;color:rgba(0,255,65,.2);text-align:right;line-height:2}
        @keyframes fadeIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        @keyframes glitch-in{0%{opacity:0;transform:translateY(12px) skewX(-2deg)}60%{transform:skewX(1deg)}100%{opacity:1;transform:none}}
        .rev{opacity:0;transform:translateY(16px);transition:opacity .6s ease,transform .6s ease}
        .rev.in{opacity:1;transform:translateY(0)}
        .d1{transition-delay:.1s}.d2{transition-delay:.2s}.d3{transition-delay:.3s}.d4{transition-delay:.4s}
        @media(max-width:1024px){
          nav,footer{padding:0 24px}
          .hero-main{grid-template-columns:1fr;padding:60px 24px}
          .hud{display:none}
          .hbar{overflow-x:auto}
          .hbi{min-width:140px;padding:16px 18px}
          .sec{padding:72px 24px}
          .cgrid{grid-template-columns:repeat(2,1fr)}
          .cs::after{display:none}
          .rg{grid-template-columns:1fr;gap:48px}
          .mg{grid-template-columns:repeat(2,1fr)}
          .mod:nth-child(3n){border-right:1px solid var(--ghost)}
          .mod:nth-child(2n){border-right:none}
          .pg{grid-template-columns:1fr}
          .cls-grid{grid-template-columns:1fr}
          .cls-r{flex-direction:row;align-items:center}
          footer{flex-direction:column;gap:16px;text-align:center;padding:24px}
          .fl{flex-direction:column;gap:8px}
          .fr{text-align:center}
        }
      `}</style>

      {/* Google Fonts */}
      <link href="https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Orbitron:wght@400;700;900&display=swap" rel="stylesheet" />

      {/* Matrix canvas */}
      <canvas ref={canvasRef} id="matrix-canvas" style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 0, opacity: .13, pointerEvents: 'none' }} />

      {/* Cursor */}
      <div ref={curRef} id="ak-cur" />
      <div ref={ringRef} id="ak-ring" />

      {/* NAV */}
      <nav>
        <a href="/" className="nav-logo">AUTOKIRK</a>
        <div className="nav-center">
          <span>SYS:</span> ENFORCEMENT OS &nbsp;|&nbsp;
          <span>FACE:</span> #003 &nbsp;|&nbsp;
          <span>STATUS:</span> OPERATIONAL
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div className="nav-status"><div className="status-dot" />LIVE</div>
          <a href="/login" className="nav-btn">ACCESS</a>
        </div>
      </nav>

      {/* HERO */}
      <section className="hero">
        <div className="hgrid" />
        <div className="hero-main">
          <div>
            <div className="boot-seq">
              &gt; SYSTEM BOOT [OK]&nbsp;&nbsp;KERNEL LOADED [OK]&nbsp;&nbsp;RPC LAYER [OK]&nbsp;&nbsp;LEDGER [OK]&nbsp;&nbsp;_<span>█</span>
            </div>
            <h1>
              <span className="t1">AUTOKIRK</span>
              <span className="t2">ENFORCEMENT</span>
              <span className="t3">// OPERATING SYSTEM</span>
            </h1>
            <p className="tagline">
              Every business action flows through the <span className="hi">proposal → approval →<br />execution → receipt</span> chain. No shortcuts. No assumptions.<br />Immutable proof on an append-only ledger. <span className="hi">Always.</span>
            </p>
            <div className="actions">
              <a href="/login" className="btn-primary">
                &#x2192; ENTER CONSOLE
              </a>
              <a href="#chain" className="btn-secondary">[READ DOCTRINE]</a>
            </div>
          </div>

          <div className="hud">
            <div className="hud-bar">
              <span className="hud-title">// KERNEL STATUS //</span>
              <span className="hud-blink">● LIVE</span>
            </div>
            <div className="hud-row"><span className="hk">FACE</span><div className="hv cy">FACE-003<small>DEALERSHIP ENFORCEMENT</small></div></div>
            <div className="hud-row"><span className="hk">SEALED</span><div className="hv lg">34+<small>RECEIPTS ON LEDGER</small></div></div>
            <div className="hud-row"><span className="hk">MUTATIONS</span><div className="hv lg">0<small>DIRECT TABLE WRITES</small></div></div>
            <div className="hud-row"><span className="hk">KERNEL</span><div className="hv" style={{ fontSize: '10px' }}>3 RPCs ACTIVE<small>SUBMIT / APPROVE / EXECUTE</small></div></div>
            <div className="hud-row"><span className="hk">CLIENT</span><div className="hv" style={{ fontSize: '10px' }}>OLD SALT MARINE<small>3 LOCATIONS — ACTIVE</small></div></div>
            <div className="hud-row"><span className="hk">AI</span><div className="hv" style={{ fontSize: '10px' }}>OBSERVE + PROPOSE<small>NEVER MUTATES</small></div></div>
          </div>
        </div>

        <div className="hbar">
          <div className="hbi"><span className="hbn cy">3</span><div><span className="hbl">Governing RPCs</span><span className="hbs">All state flows here</span></div></div>
          <div className="hbi"><span className="hbn">0</span><div><span className="hbl">Direct mutations</span><span className="hbs">Client never touches core</span></div></div>
          <div className="hbi"><span className="hbn">34+</span><div><span className="hbl">Sealed receipts</span><span className="hbs">Hash-fingerprinted</span></div></div>
          <div className="hbi"><span className="hbn cy">∞</span><div><span className="hbl">Ledger retention</span><span className="hbs">Append-only, forever</span></div></div>
          <div className="hbi"><span className="hbn">6</span><div><span className="hbl">Active modules</span><span className="hbs">Sales, service, billing…</span></div></div>
        </div>
      </section>

      <div className="dv"><span className="dv-inner">// EXECUTION CHAIN //</span></div>

      <section className="sec sec-bg" id="chain">
        <div className="inner">
          <div className="rev">
            <div className="ey">PROTOCOL · 001</div>
            <h2>THE LOOP THAT<br /><em>CANNOT BE SKIPPED.</em></h2>
            <p className="bdesc">Every action traverses all four steps in sequence. No bypass. No shortcut. Enforced structurally at the database level.</p>
          </div>
          <div className="cgrid">
            <div className="cs rev d1"><div className="cn">STEP_01</div><div className="ct">[PROPOSAL]</div><p className="cb">Every action begins as a proposal. Intent is recorded before anything moves. No governed entry point — no movement.</p><div className="crpc">ak_core_submit_proposal</div></div>
            <div className="cs rev d2"><div className="cn">STEP_02</div><div className="ct">[APPROVAL]</div><p className="cb">Authorization required. Without sign-off, execution is impossible at the schema level — not by convention, by code.</p><div className="crpc">ak_core_issue_approval</div></div>
            <div className="cs rev d3"><div className="cn">STEP_03</div><div className="ct">[EXECUTION]</div><p className="cb">Approved action executes via governed RPCs only. The client layer has zero direct write access to core tables.</p><div className="crpc">ak_core_execute_proposal</div></div>
            <div className="cs rev d4"><div className="cn">STEP_04</div><div className="ct">[RECEIPT]</div><p className="cb">Execution is incomplete without a sealed receipt. SHA-256 fingerprinted. Idempotency-guarded. Permanent proof.</p><div className="crpc">ledger.receipts ← SEALED</div></div>
          </div>
        </div>
      </section>

      <div className="dv"><span className="dv-inner">// CORE DOCTRINE //</span></div>

      <section className="sec">
        <div className="inner">
          <div className="rg">
            <div className="rev">
              <div className="ey">PROTOCOL · 002</div>
              <h2>FIVE RULES AT<br /><em>THE SCHEMA.</em></h2>
              <p className="bdesc" style={{ marginTop: '16px' }}>Not guidelines. Not best practices. Rules enforced structurally. Violation is architecturally impossible.</p>
            </div>
            <div className="rl">
              <div className="rule rev d1"><span className="rn">01</span><div><div className="rtit">NO DIRECT MUTATIONS FROM CLIENT</div><p className="rbod">Every surface communicates through RPCs. Core tables are not writable from outside the kernel. Structure, not discipline.</p></div></div>
              <div className="rule rev d2"><span className="rn">02</span><div><div className="rtit">EVERY RECORD IS APPEND-ONLY</div><p className="rbod">Nothing is ever updated or deleted. History cannot be revised. Every state change is a new, permanent record.</p></div></div>
              <div className="rule rev d3"><span className="rn">03</span><div><div className="rtit">PROPOSAL PRECEDES EXECUTION</div><p className="rbod">The execution RPC rejects unapproved proposals at function level. The sequence is enforced by code, not documentation.</p></div></div>
              <div className="rule rev d4"><span className="rn">04</span><div><div className="rtit">AI OBSERVES — NEVER MUTATES</div><p className="rbod">Intelligence reads surfaces, writes only to proposals queue. Cannot touch the ledger. Human signs off. Every time.</p></div></div>
              <div className="rule rev"><span className="rn">05</span><div><div className="rtit">EVERY OBLIGATION YIELDS A RECEIPT</div><p className="rbod">No execution path completes without a receipt. SHA-256. Idempotency key. Operator identity. Sealed permanently.</p></div></div>
            </div>
          </div>
        </div>
      </section>

      <div className="dv"><span className="dv-inner">// DEPLOYED MODULES //</span></div>

      <section className="sec sec-bg">
        <div className="inner">
          <div className="rev">
            <div className="ey">PROTOCOL · 003</div>
            <h2>SIX DOMAINS.<br /><em>ALL ENFORCED.</em></h2>
          </div>
          <div className="mg">
            <div className="mod rev d1"><div className="mid"><span>F003/MOD-01</span><span className="mlv">LIVE</span></div><div className="mn">SALES PIPELINE</div><p className="md">Lead intake, touch logging, quote issuance, deal closure — each step governed, each step receipted.</p></div>
            <div className="mod rev d2"><div className="mid"><span>F003/MOD-02</span><span className="mlv">LIVE</span></div><div className="mn">SERVICE JOBS</div><p className="md">Job creation, assignment, and closure with full obligation-to-receipt traceability across all locations.</p></div>
            <div className="mod rev d3"><div className="mid"><span>F003/MOD-03</span><span className="mlv">LIVE</span></div><div className="mn">BILLING ENFORCEMENT</div><p className="md">Stripe integration with idempotency guards. Every payment event sealed against its originating obligation.</p></div>
            <div className="mod rev d1"><div className="mid"><span>F003/MOD-04</span><span className="mlv">LIVE</span></div><div className="mn">WASHBAY SCHEDULING</div><p className="md">Slot-based scheduling with conflict prevention and governed status transitions across all locations.</p></div>
            <div className="mod rev d2"><div className="mid"><span>F003/MOD-05</span><span className="mlv">LIVE</span></div><div className="mn">INTEGRITY SURFACE</div><p className="md">Closure rates, breach counts, revenue leakage. The single number that cannot lie.</p></div>
            <div className="mod rev d3"><div className="mid"><span>CORE/MOD-06</span><span className="mlv">LIVE</span></div><div className="mn">AK INTELLIGENCE</div><p className="md">Observes. Surfaces findings. Proposes. Cannot touch the ledger. Doctrine holds at schema level.</p></div>
          </div>
        </div>
      </section>

      <div className="dv"><span className="dv-inner">// PROOF LAYER //</span></div>

      <section className="sec">
        <div className="inner">
          <div className="pg">
            <div className="rev">
              <div className="ey">PROTOCOL · 004</div>
              <h2>EVERY EXECUTION<br />LEAVES A<br /><em>SEALED RECEIPT.</em></h2>
              <p className="bdesc" style={{ marginTop: '16px' }}>Append-only. SHA-256 fingerprinted. Idempotency-guarded. No execution path exists that does not produce permanent, verifiable proof.</p>
              <div className="schema">
                <span className="k">ledger.receipts</span><br />
                ├── <span className="v">receipt_id</span> · uuid<br />
                ├── <span className="v">obligation_id</span> · uuid · unique<br />
                ├── <span className="k">fingerprint</span> · sha256<br />
                ├── <span className="v">sealed_by</span> · operator_id<br />
                ├── <span className="v">sealed_at</span> · timestamptz<br />
                └── <span className="k">status: ● SEALED</span>
              </div>
            </div>
            <div className="term rev d2">
              <div className="th">
                <div className="tds"><div className="td" /><div className="td" /><div className="td on" /></div>
                <span className="ttit">AK_KERNEL // LEDGER_QUERY</span>
                <span className="tver">udwzexjwhkvsyeihcwfw</span>
              </div>
              <div className="tb">
                <span className="tl"><span className="tp">root@ak:~$ </span><span className="tc">psql -c &quot;SELECT * FROM ledger.receipts</span></span>
                <span className="tl"><span className="tp">         </span><span className="tc">ORDER BY sealed_at DESC LIMIT 1;&quot;</span></span>
                <span className="tl"><span className="tdm">─────────────────────────────────────────</span></span>
                <span className="tl"><span className="tk"> receipt_id    </span><span className="tv">rec_9f2a4c8b...</span></span>
                <span className="tl"><span className="tk"> obligation_id </span><span className="tv">obl_4c8b1e3a...</span></span>
                <span className="tl"><span className="tk"> tenant_id     </span><span className="tv">osm_face003</span></span>
                <span className="tl"><span className="tk"> domain        </span><span className="tv">dealership.sales</span></span>
                <span className="tl"><span className="tk"> action        </span><span className="ts">&quot;quote_sent&quot;</span></span>
                <span className="tl"><span className="tk"> sealed_by     </span><span className="tv">op_kirk</span></span>
                <span className="tl"><span className="tk"> fingerprint   </span><span className="tv">sha256:a3f9e1b2...</span></span>
                <span className="tl"><span className="tk"> sealed_at     </span><span className="tv">2026-03-10T11:52:04Z</span></span>
                <span className="tl"><span className="tk"> status        </span><span className="tseal">● SEALED</span></span>
                <span className="tl"><span className="tdm">─────────────────────────────────────────</span></span>
                <span className="tl"><span className="tok">✓ 1 row — append-only — immutable</span></span>
                <span className="tl">&nbsp;</span>
                <span className="tl"><span className="tp">root@ak:~$ </span><span className="tcur" /></span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="dv"><span className="dv-inner">// ACCESS //</span></div>

      <section className="cls">
        <div className="cls-grid">
          <div className="rev">
            <div className="cls-title">BUILT FOR<br />BUSINESSES THAT<br />RUN ON <em>PROOF,</em><br />NOT TRUST.</div>
            <p className="cls-sub">AutoKirk ships as an enforcement-grade operating system. Not a CRM. Not a dashboard. A kernel — with receipts at every step and a ledger that only grows.</p>
          </div>
          <div className="cls-r rev d2">
            <a href="/login" className="blg">&#x2192; ENTER OPERATOR CONSOLE</a>
            <a href="mailto:kirk@autokirk.com" className="bsub">REQUEST DEPLOYMENT ACCESS →</a>
          </div>
        </div>
      </section>

      <footer>
        <div className="fl">
          <a href="/" className="flog">AUTOKIRK</a>
          <span className="ftg">KIRK DIGITAL HOLDINGS LLC</span>
          <span className="ftg">FACE #003 — ACTIVE</span>
        </div>
        <div className="fr">KERNEL v1.0 — APPEND-ONLY — ZERO DIRECT MUTATIONS<br />AI OBSERVES + PROPOSES — NEVER MUTATES — autokirk.com</div>
      </footer>
    </>
  )
}
