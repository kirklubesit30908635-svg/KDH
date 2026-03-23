'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'

export default function HomePage() {
  const [scoreVal, setScoreVal] = useState(0)
  const [scoreVisible, setScoreVisible] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [playerVisible, setPlayerVisible] = useState(false)
  const [progress, setProgress] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [currentSection, setCurrentSection] = useState('INTRO')
  const synthRef = useRef<SpeechSynthesis | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const scoreRef = useRef<HTMLDivElement>(null)
  const TOTAL = 165

  const SCRIPT = [
    { section: 'INTRO', id: null, text: `Every business runs on obligations. Commitments made to customers, duties owed to the operation, revenue that was earned but not yet captured. And most businesses lose track of them. Not because they don't care. Because they have no system designed to enforce them.` },
    { section: 'THE PROBLEM', id: 'problem', text: `Think about your operation right now. How many service jobs closed last month without a final invoice? How many parts were pulled without a purchase order? How many promises were made to a customer that never made it into a billing record? You don't know the exact number. That's the problem. The revenue was earned. The work was done. But no system required proof that it closed correctly — and so it disappeared. Quietly. Without anyone noticing. A mid-size marine dealer loses an average of one hundred and twenty seven thousand dollars a year this way. Not to theft. Not to bad decisions. To the absence of enforcement.` },
    { section: 'THE CATEGORY', id: 'how-it-works', text: `AutoKirk is the first Revenue Enforcement Operating System. Not a CRM. Not an ERP. Not a project management tool. AutoKirk enforces the obligation chain. Every duty that enters the system must close with proof. The kernel opens an obligation the moment a revenue event occurs. That obligation stays open — compounding pressure, degrading your Integrity Score — until a receipt exists that proves it closed. There is no way to ignore it. There is no way to lose it. The system enforces itself.` },
    { section: 'THE CHAIN', id: 'how-it-works', text: `The enforcement chain has five steps. An event occurs. The kernel registers an obligation. The Weight Engine monitors that obligation in real time, building pressure as time passes. When the obligation closes, the kernel requires a receipt. Not a note. Not a status update. A receipt — a ledger entry that proves the obligation was resolved. Only then does the chain complete. And the Integrity Signal updates to reflect what actually happened in your operation.` },
    { section: 'THE SCORE', id: 'score', text: `The Integrity Score is not a vanity metric. It is a verdict. Five weighted signals: Closure Rate, Breach Rate, Event Coverage, Obligation Latency, and Proof Lag — combined into a single number that tells leadership exactly how well the operation is enforcing its obligations right now. A score of ninety or above means the system is clean. Below seventy, review is required. Below fifty, the system is at risk. The score updates in real time. It does not lie. It enforces accountability on the operation itself.` },
    { section: 'VERTICALS', id: 'verticals', text: `The kernel is vertical-agnostic. AutoKirk deploys a Face for each industry. The enforcement chain never changes. The vocabulary does. For marine dealers, we speak service jobs, parts orders, and washbay scheduling. For auto dealers, we speak ROs, warranty claims, and parts POs. For healthcare, we speak claims, authorization tracking, and denial management. Same immutable kernel underneath. Same enforcement guarantee.` },
    { section: 'THE CLOSE', id: null, text: `The businesses that close their obligation gaps keep revenue that everyone else loses. The ones that don't, keep losing it — quietly, every month, in ways that never get investigated because no one knew to look. AutoKirk is currently deploying to a limited set of operators. Access is by approval. If your business has obligations that need enforcement, apply now at autokirk dot com. The system is live. The enforcement chain is running. The only question is whether your operation is inside it or outside it.` },
  ]

  useEffect(() => {
    if (typeof window !== 'undefined') {
      synthRef.current = window.speechSynthesis
    }
  }, [])

  useEffect(() => {
    if (!scoreRef.current) return
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setScoreVisible(true); obs.disconnect() }
    }, { threshold: 0.3 })
    obs.observe(scoreRef.current)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    if (!scoreVisible) return
    let cur = 0
    const step = () => {
      cur += Math.ceil((84 - cur) / 8)
      if (cur >= 84) { setScoreVal(84); return }
      setScoreVal(cur)
      setTimeout(step, 40)
    }
    setTimeout(step, 300)
  }, [scoreVisible])

  const getGrade = (s: number) => s >= 90 ? 'A' : s >= 80 ? 'B' : s >= 70 ? 'C' : s >= 60 ? 'D' : 'F'
  const getVerdict = (s: number) => s >= 90 ? 'CLEAN' : s >= 80 ? 'GOOD' : s >= 70 ? 'WATCH — REVIEW REQUIRED' : s >= 60 ? 'DEGRADED' : 'CRITICAL — SYSTEM AT RISK'
  const getVerdictColor = (s: number) => s >= 80 ? '#00e5c8' : s >= 70 ? '#c9a84c' : '#ff4444'
  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`

  const startAudio = () => {
    const synth = synthRef.current
    if (!synth) return
    synth.cancel()
    setElapsed(0)
    setProgress(0)

    SCRIPT.forEach((seg, i) => {
      const utt = new SpeechSynthesisUtterance(seg.text)
      utt.rate = 0.88
      utt.pitch = 0.92
      utt.volume = 1
      const voices = synth.getVoices()
      const preferred = ['Google UK English Male', 'Microsoft David Desktop', 'Alex', 'Daniel']
      for (const name of preferred) {
        const v = voices.find(v => v.name.includes(name))
        if (v) { utt.voice = v; break }
      }
      utt.onstart = () => {
        setCurrentSection(seg.section)
        if (seg.id) {
          const el = document.getElementById(seg.id)
          el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
      }
      utt.onend = () => { if (i === SCRIPT.length - 1) finishAudio() }
      synth.speak(utt)
    })

    setIsPlaying(true)
    setIsPaused(false)
    setPlayerVisible(true)

    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      if (synthRef.current?.speaking && !synthRef.current?.paused) {
        setElapsed(e => {
          const next = Math.min(e + 1, TOTAL)
          setProgress((next / TOTAL) * 100)
          return next
        })
      }
    }, 1000)
  }

  const pauseAudio = () => {
    synthRef.current?.pause()
    setIsPlaying(false)
    setIsPaused(true)
    if (timerRef.current) clearInterval(timerRef.current)
  }

  const resumeAudio = () => {
    synthRef.current?.resume()
    setIsPlaying(true)
    setIsPaused(false)
    timerRef.current = setInterval(() => {
      if (synthRef.current?.speaking && !synthRef.current?.paused) {
        setElapsed(e => { const n = Math.min(e + 1, TOTAL); setProgress((n / TOTAL) * 100); return n })
      }
    }, 1000)
  }

  const stopAudio = () => {
    synthRef.current?.cancel()
    setIsPlaying(false)
    setIsPaused(false)
    setPlayerVisible(false)
    setElapsed(0)
    setProgress(0)
    if (timerRef.current) clearInterval(timerRef.current)
  }

  const finishAudio = () => {
    setIsPlaying(false)
    setCurrentSection('COMPLETE')
    if (timerRef.current) clearInterval(timerRef.current)
    setTimeout(() => setPlayerVisible(false), 4000)
  }

  const toggleAudio = () => {
    if (!isPlaying && !isPaused) startAudio()
    else if (isPlaying) pauseAudio()
    else if (isPaused) resumeAudio()
  }

  const bars = [
    { pct: 84, color: '#00e5c8' },
    { pct: 100, color: '#00e5c8' },
    { pct: 100, color: '#00e5c8' },
    { pct: 60, color: '#c9a84c' },
    { pct: 85, color: '#00e5c8' },
  ]

  const signals = [
    { label: 'CLOSURE', weight: '30%', desc: 'What % of obligations have been sealed' },
    { label: 'BREACH', weight: '25%', desc: 'What % of obligations are overdue' },
    { label: 'COVERAGE', weight: '20%', desc: 'What % of events have obligations' },
    { label: 'LATENCY', weight: '15%', desc: 'How fast obligations are closing' },
    { label: 'PROOF', weight: '10%', desc: 'Sealed obligations with receipt' },
  ]

  return (
    <main style={S.main}>
      <div style={S.grid} />
      <div style={S.glow} />

      {/* NAV */}
      <nav style={S.nav}>
        <div style={S.navLogo}>
          <span style={S.navMark}>AK</span>
          <span style={S.navName}>AutoKirk</span>
        </div>
        <div style={S.navLinks}>
          <a href="#how-it-works" style={S.navLink}>How it works</a>
          <a href="#verticals" style={S.navLink}>Industries</a>
          <a href="#score" style={S.navLink}>The score</a>
          <button
            onClick={toggleAudio}
            style={{ ...S.audioBtn, ...(isPlaying ? S.audioBtnActive : {}) }}
            title="Hear the pitch"
          >
            {isPlaying ? (
              <span style={S.wavesRow}>
                {[0,1,2,3,4].map(i => (
                  <span key={i} style={{ ...S.wave, animationDelay: `${i * 0.1}s`, height: [4,8,12,8,4][i] }} />
                ))}
              </span>
            ) : isPaused ? (
              <><span style={S.audioBtnIcon}>▶</span><span style={S.audioBtnLabel}>RESUME</span></>
            ) : (
              <><span style={S.audioBtnIcon}>▶</span><span style={S.audioBtnLabel}>HEAR THE PITCH</span></>
            )}
          </button>
          <Link href="/login" style={S.navCta}>Operator sign in →</Link>
        </div>
      </nav>

      {/* FLOATING PLAYER */}
      <div style={{ ...S.player, ...(playerVisible ? S.playerVisible : {}) }}>
        <button onClick={toggleAudio} style={S.playBtn}>
          <span style={{ fontSize: 14, color: '#07090f', fontWeight: 700 }}>
            {isPlaying ? '❚❚' : '▶'}
          </span>
        </button>
        <div style={S.playerCenter}>
          <div style={S.playerTitle}>AutoKirk — The Pitch</div>
          <div style={S.progressTrack}>
            <div style={{ ...S.progressFill, width: `${progress}%` }} />
          </div>
          <div style={S.playerMeta}>
            <span style={S.playerTime}>{fmtTime(elapsed)}</span>
            <span style={S.playerWaves}>
              {Array.from({ length: 20 }, (_, i) => (
                <span key={i} style={{
                  ...S.playerWave,
                  height: [4,8,14,18,12,20,16,10,18,14,20,8,16,12,18,6,14,10,8,4][i],
                  animation: isPlaying ? `playerWave 1s ease-in-out ${i * 0.05}s infinite` : 'none',
                }} />
              ))}
            </span>
            <span style={S.playerTime}>2:45</span>
          </div>
        </div>
        <div style={S.playerRight}>
          <span style={S.sectionBadge}>{currentSection}</span>
          <button onClick={stopAudio} style={S.closeBtn}>✕</button>
        </div>
      </div>

      {/* HERO */}
      <div style={S.hero}>
        <div style={S.categoryTag}><span style={S.catDot} />Revenue Enforcement Operating System</div>
        <h1 style={S.h1}>
          Your business has obligations.<br />
          <span style={{ color: '#00e5c8' }}>Most of them disappear.</span>
        </h1>
        <p style={S.heroSub}>
          AutoKirk is the first enforcement operating system built to make revenue obligations impossible to lose, impossible to ignore, and impossible to dispute. Every duty tracked. Every closure proven. Every leak documented.
        </p>
        <div style={S.heroCtas}>
          <Link href="/subscribe" style={S.btnPrimary}>Request operator access</Link>
          <a href="#how-it-works" style={S.btnSecondary}>See how enforcement works →</a>
        </div>
        <div style={S.chain}>
          {['EVENT', 'OBLIGATION', 'CLOSURE', 'RECEIPT', 'INTEGRITY SIGNAL'].map((step, i) => (
            <span key={step} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ ...S.chainNode, ...(i === 4 ? S.chainNodeActive : {}) }}>{step}</span>
              {i < 4 && <span style={{ color: '#1e2530', fontSize: 13 }}>→</span>}
            </span>
          ))}
        </div>
      </div>

      {/* PAIN */}
      <section id="problem" style={S.section}>
        <div style={S.secLabel}>The Problem</div>
        <h2 style={S.h2}>Revenue doesn't disappear in one place.<br />It bleeds from a thousand small gaps.</h2>
        <div style={S.threeGrid}>
          {[
            { stat: '$127K', label: 'Average annual revenue leakage for a mid-size marine dealer', sub: 'Service jobs closed without billing. Parts pulled without a PO. Promises made, never invoiced.' },
            { stat: '0', label: 'Enforcement systems built specifically for this problem before AutoKirk', sub: 'CRMs track contacts. ERPs track inventory. Nothing enforces the obligation chain.' },
            { stat: '68%', label: 'Of business obligations resolved without documented proof', sub: 'No receipt. No record. No way to dispute it. No way to prove it. Gone.' },
          ].map((p, i) => (
            <div key={i} style={S.painCard}>
              <div style={S.painStat}>{p.stat}</div>
              <div style={S.painLabel}>{p.label}</div>
              <div style={S.painSub}>{p.sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how-it-works" style={S.section}>
        <div style={S.secLabel}>The Enforcement Chain</div>
        <h2 style={S.h2}>Five layers. One immutable chain.<br />No obligation escapes.</h2>
        <div style={S.fiveGrid}>
          {[
            { n: '01', t: 'Object', d: 'Every revenue-bearing entity in your business is registered — a job, a deal, a contract, a service ticket. The kernel sees it.' },
            { n: '02', t: 'Obligation', d: 'When a duty is created, the kernel opens an obligation. It stays open until closure is proven. It does not go away.' },
            { n: '03', t: 'Enforcement', d: 'The Weight Engine monitors every open obligation in real time. Latency compounds. Breach pressure builds. The system enforces itself.' },
            { n: '04', t: 'Receipt', d: 'Closure is not finished until a receipt exists. The kernel requires proof. No receipt means the obligation penalizes your Integrity Score.' },
            { n: '05', t: 'Integrity Signal', d: 'Five weighted signals produce your score. The number tells leadership exactly where the business is leaking, in real time.' },
          ].map(s => (
            <div key={s.n} style={S.stepCard}>
              <div style={S.stepNum}>{s.n}</div>
              <div style={S.stepTitle}>{s.t}</div>
              <div style={S.stepDesc}>{s.d}</div>
            </div>
          ))}
        </div>
      </section>

      {/* SCORE */}
      <section id="score" style={S.section} ref={scoreRef}>
        <div style={S.secLabel}>The Integrity Signal</div>
        <h2 style={S.h2}>Not a dashboard. A verdict.</h2>
        <p style={S.secBody}>The Integrity Score tells you — with high confidence — exactly how well your operation is enforcing its obligations. Five signals. One number. No hiding.</p>
        <div style={S.scoreBox}>
          <div style={S.scoreLeft}>
            <div style={S.scoreBig}>{scoreVal}</div>
            <div style={{ fontSize: 44, fontWeight: 700, color: 'rgba(0,229,200,.35)', letterSpacing: '-.02em', marginTop: -4 }}>{getGrade(scoreVal)}</div>
            <div style={{ fontSize: 9, letterSpacing: '.2em', color: getVerdictColor(scoreVal), textTransform: 'uppercase' as const, marginTop: 14, marginBottom: 14 }}>{getVerdict(scoreVal)}</div>
            <div style={{ fontSize: 9, color: '#1e2530', lineHeight: 1.6 }}>score = 0.30×CR + 0.25×(100−BR)<br />+ 0.20×EC + 0.15×LS + 0.10×PS</div>
          </div>
          <div style={S.scoreRight}>
            {signals.map((s, i) => (
              <div key={s.label} style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 10, letterSpacing: '.2em', fontWeight: 600 }}>{s.label}</span>
                  <span style={{ fontSize: 10, color: '#5a6070' }}>{s.weight}</span>
                </div>
                <div style={{ height: 3, background: 'rgba(255,255,255,.07)', borderRadius: 2, marginBottom: 5, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: scoreVisible ? `${bars[i].pct}%` : '0%', background: bars[i].color, borderRadius: 2, transition: 'width 1.2s ease' }} />
                </div>
                <div style={{ fontSize: 10, color: '#5a6070' }}>{s.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* VERTICALS */}
      <section id="verticals" style={S.section}>
        <div style={S.secLabel}>Enforcement Faces</div>
        <h2 style={S.h2}>One kernel. Every vertical.</h2>
        <p style={S.secBody}>The enforcement chain is universal. AutoKirk deploys a vertical-specific Face for each industry — same immutable kernel, vocabulary and workflows tuned to your business.</p>
        <div style={S.threeGrid}>
          {[
            { name: 'Marine Dealership', status: 'LIVE', tag: '● Customer #0001 Live', desc: 'Service jobs, parts, boat sales, washbay, HR. Full obligation enforcement across every revenue touchpoint.' },
            { name: 'Automotive Retail', status: 'NEXT', tag: 'Coming Soon', desc: 'F&I compliance, service ROs, parts POs, warranty claims. Same leakage patterns as marine — different vocabulary.' },
            { name: 'Advertising Accountability', status: 'PLAN', tag: 'Face #004 Designed', desc: 'FRL readiness, campaign obligation tracking, proof of performance enforcement.' },
            { name: 'Food Service', status: 'PLAN', tag: 'Planned', desc: 'Vendor invoices, labor obligations, compliance duties. Revenue enforcement for hospitality operations.' },
            { name: 'Healthcare Revenue Cycle', status: 'PLAN', tag: 'Planned', desc: 'Claim obligations, auth tracking, denial enforcement. The most obligation-dense industry in existence.' },
            { name: 'Your Industry', status: 'OPEN', tag: 'Talk to us', desc: 'The kernel is vertical-agnostic. If your business creates obligations and needs proof of closure, AutoKirk can be deployed.' },
          ].map(v => (
            <div key={v.name} style={{
              ...S.vertCard,
              borderColor: v.status === 'LIVE' ? 'rgba(0,229,200,.4)' : v.status === 'NEXT' ? 'rgba(201,168,76,.3)' : 'rgba(255,255,255,.07)',
              background: v.status === 'LIVE' ? 'rgba(0,229,200,.04)' : 'transparent',
            }}>
              <div style={{ fontSize: 9, letterSpacing: '.25em', textTransform: 'uppercase' as const, marginBottom: 10, color: v.status === 'LIVE' ? '#00e5c8' : v.status === 'NEXT' ? '#c9a84c' : '#5a6070' }}>{v.tag}</div>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>{v.name}</div>
              <div style={{ fontSize: 11, color: '#5a6070', lineHeight: 1.65 }}>{v.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* WHY */}
      <section style={S.section}>
        <div style={S.secLabel}>Why This Exists</div>
        <div style={S.twoCol}>
          <div>
            <h2 style={S.h2}>Every business runs on obligations.<br />None of them have enforcement infrastructure.</h2>
            <p style={S.whyBody}>CRMs track who you talked to. ERPs track what you have. Project tools track what you&apos;re doing. Not one of them enforces the obligation chain — the moment a duty was created, who owns it, what closure looks like, and whether proof exists that it actually happened.</p>
            <p style={S.whyBody}>AutoKirk is the first system built around a single question: <em style={{ color: '#00e5c8', fontStyle: 'normal', fontWeight: 600 }}>did the obligation close, and can you prove it?</em></p>
          </div>
          <div>
            {[
              { tool: 'CRM', does: 'Tracks contacts & pipeline', miss: '✗ No obligation enforcement', hi: false },
              { tool: 'ERP', does: 'Tracks inventory & finance', miss: '✗ No receipt requirement', hi: false },
              { tool: 'Project Mgmt', does: 'Tracks tasks & status', miss: '✗ No closure proof layer', hi: false },
              { tool: 'AutoKirk', does: 'Enforces the obligation chain', miss: '✓ Complete enforcement chain', hi: true },
            ].map(r => (
              <div key={r.tool} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 1fr', gap: 12, alignItems: 'center', padding: '12px 14px', border: `1px solid ${r.hi ? 'rgba(0,229,200,.3)' : 'rgba(255,255,255,.07)'}`, background: r.hi ? 'rgba(0,229,200,.05)' : 'transparent', fontSize: 11, marginBottom: 2 }}>
                <span style={{ fontWeight: 700, color: r.hi ? '#00e5c8' : '#e8eaf0' }}>{r.tool}</span>
                <span style={{ color: '#5a6070' }}>{r.does}</span>
                <span style={{ color: r.hi ? '#00e5c8' : '#ff4444', fontSize: 10 }}>{r.miss}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={S.ctaSection}>
        <div style={S.secLabel}>Operator Access</div>
        <h2 style={{ ...S.h2, textAlign: 'center' as const, maxWidth: 700, margin: '0 auto 20px' }}>
          The businesses that close their obligation gaps<br />
          <span style={{ color: '#00e5c8' }}>keep revenue that everyone else loses.</span>
        </h2>
        <p style={{ ...S.secBody, textAlign: 'center' as const, margin: '0 auto 40px' }}>
          AutoKirk is currently deploying to a limited set of operators. Access is by approval. If your business has obligations that need enforcement, apply now.
        </p>
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' as const, marginBottom: 56 }}>
          <Link href="/subscribe" style={S.btnPrimary}>Apply for operator access</Link>
          <Link href="/login" style={{ ...S.btnSecondary, color: '#5a6070' }}>Existing operator sign in →</Link>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' as const }}>
          {['Kirk Digital Holdings LLC', 'AutoKirk IP Holdings LLC', 'AutoKirk Systems LLC'].map((e, i) => (
            <span key={e} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ fontSize: 9, color: '#1e2530', letterSpacing: '.05em' }}>{e}</span>
              {i < 2 && <span style={{ color: '#1e2530' }}>·</span>}
            </span>
          ))}
        </div>
      </section>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;700&family=IBM+Plex+Sans:wght@300;400;600&display=swap');
        @keyframes navWave { 0%,100%{transform:scaleY(1)} 50%{transform:scaleY(0.35)} }
        @keyframes playerWave { 0%,100%{transform:scaleY(1);opacity:.5} 50%{transform:scaleY(0.3);opacity:.2} }
        a { text-decoration: none; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
      `}</style>
    </main>
  )
}

const S: Record<string, React.CSSProperties> = {
  main: { background: '#07090f', color: '#e8eaf0', fontFamily: "'IBM Plex Mono', monospace", minHeight: '100vh', position: 'relative', overflowX: 'hidden' },
  grid: { position: 'fixed', inset: 0, backgroundImage: 'linear-gradient(rgba(0,229,200,0.022) 1px,transparent 1px),linear-gradient(90deg,rgba(0,229,200,0.022) 1px,transparent 1px)', backgroundSize: '48px 48px', pointerEvents: 'none', zIndex: 0 },
  glow: { position: 'fixed', top: '-20vh', left: '50%', transform: 'translateX(-50%)', width: '80vw', height: '60vh', background: 'radial-gradient(ellipse at center,rgba(0,229,200,0.05) 0%,transparent 70%)', pointerEvents: 'none', zIndex: 0 },
  nav: { position: 'sticky', top: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 48px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(7,9,15,0.94)', backdropFilter: 'blur(12px)' },
  navLogo: { display: 'flex', alignItems: 'center', gap: 10 },
  navMark: { fontSize: 12, fontWeight: 700, color: '#00e5c8', letterSpacing: '.1em', padding: '4px 9px', border: '1px solid rgba(0,229,200,.3)', borderRadius: 3 },
  navName: { fontSize: 15, fontWeight: 600, letterSpacing: '-.01em' },
  navLinks: { display: 'flex', alignItems: 'center', gap: 24 },
  navLink: { fontSize: 11, color: '#5a6070', letterSpacing: '.05em', textDecoration: 'none' },
  navCta: { fontSize: 11, color: '#00e5c8', letterSpacing: '.05em', textDecoration: 'none', padding: '8px 16px', border: '1px solid rgba(0,229,200,.3)', borderRadius: 3 },
  audioBtn: { display: 'flex', alignItems: 'center', gap: 7, background: 'transparent', border: '1px solid rgba(0,229,200,.25)', borderRadius: 3, padding: '7px 14px', cursor: 'pointer', fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, letterSpacing: '.15em', color: '#00e5c8', minWidth: 140, justifyContent: 'center' },
  audioBtnActive: { background: 'rgba(0,229,200,.08)', borderColor: '#00e5c8' },
  audioBtnIcon: { fontSize: 11 },
  audioBtnLabel: {},
  wavesRow: { display: 'flex', alignItems: 'center', gap: 2, height: 14 },
  wave: { width: 2, background: '#00e5c8', borderRadius: 2, animation: 'navWave 0.8s ease-in-out infinite', display: 'inline-block' },
  player: { position: 'fixed', bottom: -120, left: '50%', transform: 'translateX(-50%)', zIndex: 999, width: 'min(680px, calc(100vw - 32px))', background: 'rgba(10,14,20,0.97)', border: '1px solid rgba(0,229,200,.3)', borderRadius: 6, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16, boxShadow: '0 8px 60px rgba(0,0,0,.8),0 0 40px rgba(0,229,200,.06)', backdropFilter: 'blur(20px)', transition: 'bottom .4s cubic-bezier(.34,1.56,.64,1)' },
  playerVisible: { bottom: 24 },
  playBtn: { width: 40, height: 40, borderRadius: '50%', background: '#00e5c8', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  playerCenter: { flex: 1, minWidth: 0 },
  playerTitle: { fontSize: 11, fontWeight: 600, letterSpacing: '.05em', marginBottom: 8 },
  progressTrack: { height: 3, background: 'rgba(255,255,255,.08)', borderRadius: 2, marginBottom: 8, cursor: 'pointer', overflow: 'hidden' },
  progressFill: { height: '100%', background: '#00e5c8', borderRadius: 2, transition: 'width .5s linear' },
  playerMeta: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  playerTime: { fontSize: 9, color: '#5a6070', letterSpacing: '.05em', flexShrink: 0 },
  playerWaves: { display: 'flex', alignItems: 'center', gap: 2, height: 20, flex: 1, justifyContent: 'center' },
  playerWave: { width: 2, background: 'rgba(0,229,200,.4)', borderRadius: 2 },
  playerRight: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 },
  sectionBadge: { fontSize: 8, letterSpacing: '.25em', textTransform: 'uppercase', color: '#00e5c8', padding: '3px 8px', border: '1px solid rgba(0,229,200,.2)', borderRadius: 2, whiteSpace: 'nowrap' },
  closeBtn: { background: 'none', border: 'none', color: '#5a6070', cursor: 'pointer', fontSize: 12, padding: 2 },
  hero: { position: 'relative', zIndex: 1, maxWidth: 1000, margin: '0 auto', padding: '110px 48px 80px' },
  categoryTag: { display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 10, letterSpacing: '.3em', textTransform: 'uppercase', color: '#00e5c8', padding: '6px 14px', border: '1px solid rgba(0,229,200,.22)', borderRadius: 2, marginBottom: 32 },
  catDot: { width: 6, height: 6, borderRadius: '50%', background: '#00e5c8', display: 'inline-block', flexShrink: 0 },
  h1: { fontSize: 'clamp(34px,5.5vw,64px)', fontWeight: 700, lineHeight: 1.1, letterSpacing: '-.03em', marginBottom: 24 },
  heroSub: { fontFamily: "'IBM Plex Sans',sans-serif", fontSize: 15, fontWeight: 300, lineHeight: 1.75, color: '#8090a8', maxWidth: 600, marginBottom: 40 },
  heroCtas: { display: 'flex', gap: 16, alignItems: 'center', marginBottom: 64, flexWrap: 'wrap' },
  btnPrimary: { display: 'inline-block', padding: '14px 28px', background: '#00e5c8', color: '#07090f', fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', textDecoration: 'none', borderRadius: 3 },
  btnSecondary: { display: 'inline-block', fontSize: 12, color: '#5a6070', textDecoration: 'none', letterSpacing: '.05em' },
  chain: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '22px 28px', background: 'rgba(255,255,255,.02)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 4 },
  chainNode: { padding: '8px 14px', border: '1px solid rgba(0,229,200,.22)', borderRadius: 3, fontSize: 9, letterSpacing: '.2em', color: '#5a6070' },
  chainNodeActive: { borderColor: '#00e5c8', color: '#00e5c8', background: 'rgba(0,229,200,.07)' },
  section: { position: 'relative', zIndex: 1, maxWidth: 1000, margin: '0 auto', padding: '80px 48px', borderTop: '1px solid rgba(255,255,255,.05)' },
  secLabel: { fontSize: 9, letterSpacing: '.4em', textTransform: 'uppercase', color: '#00e5c8', marginBottom: 16 },
  h2: { fontSize: 'clamp(24px,3.5vw,40px)', fontWeight: 700, letterSpacing: '-.025em', lineHeight: 1.15, marginBottom: 20 },
  secBody: { fontFamily: "'IBM Plex Sans',sans-serif", fontSize: 14, fontWeight: 300, lineHeight: 1.75, color: '#8090a8', maxWidth: 600, marginBottom: 48 },
  threeGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 2 },
  painCard: { padding: 32, background: '#0d1117', border: '1px solid rgba(255,255,255,.07)' },
  painStat: { fontSize: 52, fontWeight: 700, color: '#00e5c8', letterSpacing: '-.04em', lineHeight: 1, marginBottom: 14 },
  painLabel: { fontSize: 12, color: '#e8eaf0', marginBottom: 10, lineHeight: 1.5, fontWeight: 500 },
  painSub: { fontSize: 11, color: '#5a6070', lineHeight: 1.65 },
  fiveGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(175px,1fr))', gap: 2 },
  stepCard: { padding: '28px 22px', background: '#0d1117', border: '1px solid rgba(255,255,255,.07)' },
  stepNum: { fontSize: 10, color: '#1e2530', fontWeight: 700, marginBottom: 12, letterSpacing: '.1em' },
  stepTitle: { fontSize: 14, fontWeight: 600, color: '#00e5c8', marginBottom: 12 },
  stepDesc: { fontSize: 11, color: '#5a6070', lineHeight: 1.65 },
  scoreBox: { display: 'grid', gridTemplateColumns: '260px 1fr', gap: 2, background: '#0d1117', border: '1px solid rgba(255,255,255,.07)', marginTop: 48 },
  scoreLeft: { padding: '48px 36px', borderRight: '1px solid rgba(255,255,255,.07)', display: 'flex', flexDirection: 'column', justifyContent: 'center' },
  scoreBig: { fontSize: 96, fontWeight: 700, color: '#00e5c8', lineHeight: 1, letterSpacing: '-.04em' },
  scoreRight: { padding: 36 },
  vertCard: { padding: '28px 22px', border: '1px solid' },
  twoCol: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 60, alignItems: 'start' },
  whyBody: { fontFamily: "'IBM Plex Sans',sans-serif", fontSize: 13, fontWeight: 300, lineHeight: 1.8, color: '#8090a8', marginBottom: 16 },
  ctaSection: { position: 'relative', zIndex: 1, textAlign: 'center', padding: '110px 48px 80px', borderTop: '1px solid rgba(255,255,255,.05)', background: 'linear-gradient(180deg,transparent 0%,rgba(0,229,200,.03) 100%)' },
               }
