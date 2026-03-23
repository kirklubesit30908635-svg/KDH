'use client';

import { useEffect } from 'react';
import './landing.css';

const PITCH_SCRIPT = [
  {
    section: 'INTRO',
    sectionId: null as string | null,
    text: `Every business runs on obligations. Commitments made to customers, duties owed to the operation, revenue that was earned but not yet captured. And most businesses lose track of them. Not because they don't care. Because they have no system designed to enforce them.`
  },
  {
    section: 'THE PROBLEM',
    sectionId: 'problem',
    text: `Think about your operation right now. How many service jobs closed last month without a final invoice? How many parts were pulled without a purchase order attached? How many promises were made to a customer that never made it into a billing record? You don't know the exact number. That's the problem. The revenue was earned. The work was done. But no system required proof that it closed correctly — and so it disappeared. Quietly. Without anyone noticing. A mid-size marine dealer loses an average of a hundred and twenty seven thousand dollars a year this way. Not to theft. Not to bad decisions. To the absence of enforcement.`
  },
  {
    section: 'THE CATEGORY',
    sectionId: 'how-it-works',
    text: `AutoKirk is the first Revenue Enforcement Operating System. Not a CRM — CRMs track who you talked to. Not an ERP — ERPs track what you have. Not a project management tool. AutoKirk enforces the obligation chain. Every duty that enters the system must close with proof. The kernel opens an obligation the moment a revenue event occurs. That obligation stays open — compounding pressure, degrading your Integrity Score — until a receipt exists that proves it closed. There is no way to ignore it. There is no way to lose it. The system enforces itself.`
  },
  {
    section: 'THE CHAIN',
    sectionId: 'how-it-works',
    text: `The enforcement chain has five steps. An event occurs — a job opens, a sale is made, a commitment is given. The kernel registers an obligation. The Weight Engine monitors that obligation in real time, building pressure as time passes. When the obligation closes, the kernel requires a receipt. Not a note. Not a status update. A receipt — a ledger entry that proves the obligation was resolved and who resolved it. Only then does the chain complete. And the Integrity Signal updates to reflect what actually happened in your operation.`
  },
  {
    section: 'THE SCORE',
    sectionId: 'score',
    text: `The Integrity Score is not a vanity metric. It is a verdict. Five weighted signals: Closure Rate, Breach Rate, Event Coverage, Obligation Latency, and Proof Lag — combined into a single number that tells leadership exactly how well the operation is enforcing its obligations right now. A score of ninety or above means the system is clean. Below seventy, review is required. Below fifty, the system is at risk. The score updates in real time. It does not lie. It does not average out bad behavior. It enforces accountability on the operation itself.`
  },
  {
    section: 'VERTICAL REACH',
    sectionId: 'verticals',
    text: `The kernel is vertical-agnostic. AutoKirk deploys a Face — a vertical-specific interface — for each industry. The enforcement chain never changes. The vocabulary does. For marine dealers, we speak service jobs, parts orders, washbay scheduling, and F and I compliance. For auto dealers, we speak ROs, warranty claims, and parts POs. For healthcare, we speak claims, authorization tracking, and denial management. The same immutable kernel underneath. The same enforcement guarantee. Just the language adapted to your operation.`
  },
  {
    section: 'WHY NOW',
    sectionId: null,
    text: `This category did not exist before AutoKirk. No one had built enforcement infrastructure for business obligations because the problem was invisible. Revenue leakage doesn't announce itself. It bleeds slowly, across thousands of small gaps, until the year ends and the numbers don't add up. AutoKirk makes it visible. It makes it enforceable. And it makes the proof permanent — so leadership can see exactly where revenue was captured, and exactly where it wasn't.`
  },
  {
    section: 'THE CLOSE',
    sectionId: null,
    text: `The businesses that close their obligation gaps keep revenue that everyone else loses. The ones that don't, keep losing it — quietly, every month, in ways that never get investigated because no one knew to look. AutoKirk is currently deploying to a limited set of operators. Access is by approval. If your business has obligations that need enforcement, apply now at autokirk dot com. The system is live. The enforcement chain is running. The only question is whether your operation is inside it or outside it.`
  }
];

// Audio engine state (module-level, no re-renders needed)
let _synth: SpeechSynthesis | null = null;
let _utterances: SpeechSynthesisUtterance[] = [];
let _isPlaying = false;
let _elapsed = 0;
let _timer: ReturnType<typeof setInterval> | null = null;
const TOTAL_SECONDS = 165;

function getSynth(): SpeechSynthesis | null {
  if (!_synth && typeof window !== 'undefined') _synth = window.speechSynthesis;
  return _synth;
}

function getBestVoice(): SpeechSynthesisVoice | null {
  const synth = getSynth();
  if (!synth) return null;
  const voices = synth.getVoices();
  const preferred = ['Google UK English Male', 'Microsoft David Desktop', 'Microsoft Mark Desktop', 'Alex', 'Daniel'];
  for (const name of preferred) {
    const v = voices.find(v => v.name === name || v.name.includes(name));
    if (v) return v;
  }
  const male = voices.find(v => v.lang.startsWith('en') && (v.name.toLowerCase().includes('male') || ['David', 'Mark', 'Daniel'].some(n => v.name.includes(n))));
  return male || voices.find(v => v.lang.startsWith('en')) || voices[0] || null;
}

function buildUtterances() {
  const synth = getSynth();
  if (!synth) return;
  _utterances = [];
  PITCH_SCRIPT.forEach((seg, i) => {
    const utt = new SpeechSynthesisUtterance(seg.text);
    utt.rate = 0.88;
    utt.pitch = 0.92;
    utt.volume = 1;
    const v = getBestVoice();
    if (v) utt.voice = v;
    utt.onstart = () => {
      const apSection = document.getElementById('apSectionLabel');
      if (apSection) apSection.textContent = seg.section;
      if (seg.sectionId) {
        const el = document.getElementById(seg.sectionId);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          document.querySelectorAll('.section-reading').forEach(e => e.classList.remove('section-reading'));
          el.classList.add('section-reading');
        }
      }
    };
    utt.onend = () => { if (i === PITCH_SCRIPT.length - 1) finishAudio(); };
    utt.onerror = () => { if (i < PITCH_SCRIPT.length - 1) synth.speak(_utterances[i + 1]); };
    _utterances.push(utt);
  });
}

function showPlayer() {
  const p = document.getElementById('audioPlayer');
  if (p) { p.classList.add('visible'); p.classList.add('active'); }
}

function hidePlayer() {
  const p = document.getElementById('audioPlayer');
  if (p) { p.classList.remove('visible'); setTimeout(() => p.classList.remove('active'), 400); }
}

function setPlayingUI(playing: boolean) {
  const navBtn = document.getElementById('navAudioBtn');
  const apPlayIcon = document.getElementById('apPlayIcon');
  const player = document.getElementById('audioPlayer');
  if (navBtn) navBtn.classList.toggle('playing', playing);
  if (playing) {
    if (apPlayIcon) apPlayIcon.innerHTML = '<rect x="3" y="2" width="4" height="12" fill="#07090f" rx="1"/><rect x="9" y="2" width="4" height="12" fill="#07090f" rx="1"/>';
    if (player) player.classList.add('active');
  } else {
    if (apPlayIcon) apPlayIcon.innerHTML = '<polygon points="3,1 15,8 3,15" fill="#07090f"/>';
    if (player) player.classList.remove('active');
  }
}

function startTimer() {
  if (_timer) clearInterval(_timer);
  const synth = getSynth();
  _timer = setInterval(() => {
    if (synth && !synth.paused && synth.speaking) {
      _elapsed = Math.min(_elapsed + 1, TOTAL_SECONDS);
      const pct = (_elapsed / TOTAL_SECONDS) * 100;
      const fill = document.getElementById('apProgressFill');
      const cur = document.getElementById('apCurrentTime');
      if (fill) fill.style.width = pct + '%';
      if (cur) {
        const m = Math.floor(_elapsed / 60);
        const s = _elapsed % 60;
        cur.textContent = `${m}:${s.toString().padStart(2, '0')}`;
      }
    }
  }, 1000);
}

function startAudio() {
  const synth = getSynth();
  if (!synth) return;
  if (synth.paused) {
    synth.resume();
  } else {
    synth.cancel();
    buildUtterances();
    _elapsed = 0;
    _utterances.forEach(u => synth.speak(u));
  }
  _isPlaying = true;
  showPlayer();
  setPlayingUI(true);
  startTimer();
}

function pauseAudio() {
  const synth = getSynth();
  if (synth) synth.pause();
  _isPlaying = false;
  setPlayingUI(false);
  if (_timer) clearInterval(_timer);
}

function stopAudio() {
  const synth = getSynth();
  if (synth) synth.cancel();
  _isPlaying = false;
  _elapsed = 0;
  setPlayingUI(false);
  if (_timer) clearInterval(_timer);
  hidePlayer();
  document.querySelectorAll('.section-reading').forEach(e => e.classList.remove('section-reading'));
  const fill = document.getElementById('apProgressFill');
  const cur = document.getElementById('apCurrentTime');
  const sec = document.getElementById('apSectionLabel');
  if (fill) fill.style.width = '0%';
  if (cur) cur.textContent = '0:00';
  if (sec) sec.textContent = 'INTRO';
}

function finishAudio() {
  _isPlaying = false;
  setPlayingUI(false);
  if (_timer) clearInterval(_timer);
  const fill = document.getElementById('apProgressFill');
  const sec = document.getElementById('apSectionLabel');
  const navBtn = document.getElementById('navAudioBtn');
  if (fill) fill.style.width = '100%';
  if (sec) sec.textContent = 'COMPLETE';
  document.querySelectorAll('.section-reading').forEach(e => e.classList.remove('section-reading'));
  if (navBtn) navBtn.classList.remove('playing');
  setTimeout(() => { if (!_isPlaying) hidePlayer(); }, 4000);
}

function toggleAudio() {
  if (!_isPlaying) startAudio(); else pauseAudio();
}

export default function Home() {
  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = () => {};
      } else {
        const btn = document.getElementById('navAudioBtn');
        if (btn) (btn as HTMLElement).style.display = 'none';
      }
    }

    // Score animation on scroll into view
    function animateScore(target: number, duration: number) {
      const el = document.getElementById('scoreNum');
      const grade = document.getElementById('scoreGrade');
      const verdict = document.getElementById('scoreVerdict');
      if (!el || !grade || !verdict) return;
      let startTime: number | null = null;
      function step(ts: number) {
        if (!startTime) startTime = ts;
        const prog = Math.min((ts - startTime) / duration, 1);
        const ease = 1 - Math.pow(1 - prog, 3);
        const current = Math.round(ease * target);
        el.textContent = String(current);
        if (current >= 90) { grade.textContent = 'A'; verdict.textContent = 'CLEAN'; verdict.style.color = '#00e5c8'; }
        else if (current >= 80) { grade.textContent = 'B'; verdict.textContent = 'GOOD'; verdict.style.color = '#00e5c8'; }
        else if (current >= 70) { grade.textContent = 'C'; verdict.textContent = 'WATCH — REVIEW REQUIRED'; verdict.style.color = '#c9a84c'; }
        else if (current >= 60) { grade.textContent = 'D'; verdict.textContent = 'DEGRADED'; verdict.style.color = '#ff8844'; }
        else { grade.textContent = 'F'; verdict.textContent = 'CRITICAL — SYSTEM AT RISK'; verdict.style.color = '#ff4444'; }
        if (prog < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    }

    const bars = [
      { id: 'b1', w: 84 }, { id: 'b2', w: 100 },
      { id: 'b3', w: 100 }, { id: 'b4', w: 60 }, { id: 'b5', w: 85 }
    ];

    const scoreEl = document.getElementById('score');
    let obs: IntersectionObserver | null = null;
    if (scoreEl) {
      obs = new IntersectionObserver((entries) => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            animateScore(84, 1600);
            bars.forEach(b => setTimeout(() => {
              const el = document.getElementById(b.id);
              if (el) el.style.width = b.w + '%';
            }, 200));
            obs!.disconnect();
          }
        });
      }, { threshold: 0.3 });
      obs.observe(scoreEl);
    }

    return () => { if (obs) obs.disconnect(); };
  }, []);

  return (
    <>
      <div className="glow"></div>

      {/* NAV */}
      <nav>
        <div className="nav-logo">
          <span className="nav-mark">AK</span>
          <span className="nav-name">AutoKirk</span>
        </div>
        <div className="nav-links">
          <a className="nav-link" href="#how-it-works">How it works</a>
          <a className="nav-link" href="#verticals">Industries</a>
          <a className="nav-link" href="#score">The score</a>
          <button className="nav-audio-btn" id="navAudioBtn" onClick={toggleAudio} title="Hear the pitch">
            <span className="audio-icon" id="audioIcon">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <polygon points="2,1 13,7 2,13" fill="#00e5c8"/>
              </svg>
            </span>
            <span className="audio-btn-label" id="audioBtnLabel">HEAR THE PITCH</span>
            <span className="audio-waves" id="audioWaves">
              <span className="aw"></span><span className="aw"></span><span className="aw"></span><span className="aw"></span><span className="aw"></span>
            </span>
          </button>
          <a className="nav-cta" href="/login">Operator sign in →</a>
        </div>
      </nav>

      {/* FLOATING AUDIO PLAYER */}
      <div className="audio-player" id="audioPlayer">
        <div className="ap-left">
          <button className="ap-playbtn" id="apPlayBtn" onClick={toggleAudio}>
            <svg id="apPlayIcon" width="16" height="16" viewBox="0 0 16 16" fill="none">
              <polygon points="3,1 15,8 3,15" fill="#07090f"/>
            </svg>
          </button>
        </div>
        <div className="ap-center">
          <div className="ap-title">AutoKirk — The Pitch</div>
          <div className="ap-progress-track">
            <div className="ap-progress-fill" id="apProgressFill"></div>
          </div>
          <div className="ap-meta">
            <span id="apCurrentTime">0:00</span>
            <span className="ap-waveform" id="apWaveform">
              {Array.from({ length: 20 }).map((_, i) => <span key={i} className="apw"></span>)}
            </span>
            <span id="apTotalTime">2:45</span>
          </div>
        </div>
        <div className="ap-right">
          <div className="ap-section-label" id="apSectionLabel">INTRO</div>
          <button className="ap-close" onClick={stopAudio}>✕</button>
        </div>
      </div>

      {/* HERO */}
      <div className="hero">
        <div className="category-tag"><span className="cat-dot"></span>Revenue Enforcement Operating System</div>
        <h1>Your business has obligations.<br /><span className="accent">Most of them disappear.</span></h1>
        <p className="hero-sub">AutoKirk is the first enforcement operating system built to make revenue obligations impossible to lose, impossible to ignore, and impossible to dispute. Every duty tracked. Every closure proven. Every leak documented.</p>
        <div className="hero-ctas">
          <a href="/subscribe" className="btn-primary">Request operator access</a>
          <a href="#how-it-works" className="btn-secondary">See how enforcement works →</a>
        </div>
        <div className="chain">
          <div className="chain-node">EVENT</div><div className="chain-arrow">→</div>
          <div className="chain-node">OBLIGATION</div><div className="chain-arrow">→</div>
          <div className="chain-node">CLOSURE</div><div className="chain-arrow">→</div>
          <div className="chain-node">RECEIPT</div><div className="chain-arrow">→</div>
          <div className="chain-node active">INTEGRITY SIGNAL</div>
        </div>
      </div>

      {/* PAIN */}
      <section id="problem">
        <div className="sec-label">The Problem</div>
        <h2>Revenue doesn&apos;t disappear in one place.<br />It bleeds from a thousand small gaps.</h2>
        <div className="pain-grid">
          <div className="pain-card">
            <div className="pain-stat">$127K</div>
            <div className="pain-label">Average annual revenue leakage for a mid-size marine dealer</div>
            <div className="pain-sub-text">Service jobs closed without billing. Parts pulled without a PO. Promises made, never invoiced.</div>
          </div>
          <div className="pain-card">
            <div className="pain-stat">0</div>
            <div className="pain-label">Enforcement systems built specifically for this problem before AutoKirk</div>
            <div className="pain-sub-text">CRMs track contacts. ERPs track inventory. Nothing enforces the obligation chain.</div>
          </div>
          <div className="pain-card">
            <div className="pain-stat">68%</div>
            <div className="pain-label">Of business obligations resolved without documented proof</div>
            <div className="pain-sub-text">No receipt. No record. No way to dispute it. No way to prove it. Gone.</div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how-it-works">
        <div className="sec-label">The Enforcement Chain</div>
        <h2>Five layers. One immutable chain.<br />No obligation escapes.</h2>
        <div className="steps-grid">
          <div className="step"><div className="step-num">01</div><div className="step-title">Object</div><div className="step-desc">Every revenue-bearing entity in your business is registered — a job, a deal, a contract, a service ticket. The kernel sees it.</div></div>
          <div className="step"><div className="step-num">02</div><div className="step-title">Obligation</div><div className="step-desc">When a duty is created, the kernel opens an obligation. It stays open until closure is proven. It does not go away.</div></div>
          <div className="step"><div className="step-num">03</div><div className="step-title">Enforcement</div><div className="step-desc">The Weight Engine monitors every open obligation in real time. Latency compounds. Breach pressure builds. The system enforces itself.</div></div>
          <div className="step"><div className="step-num">04</div><div className="step-title">Receipt</div><div className="step-desc">Closure is not finished until a receipt exists. The kernel requires proof. No receipt means the obligation penalizes your Integrity Score.</div></div>
          <div className="step"><div className="step-num">05</div><div className="step-title">Integrity Signal</div><div className="step-desc">Five weighted signals produce your score. The number tells leadership exactly where the business is leaking, in real time.</div></div>
        </div>
      </section>

      {/* SCORE */}
      <section id="score">
        <div className="sec-label">The Integrity Signal</div>
        <h2>Not a dashboard. A verdict.</h2>
        <p className="sec-body">The Integrity Score tells you — with high confidence — exactly how well your operation is enforcing its obligations. Five signals. One number. No hiding.</p>
        <div className="score-showcase">
          <div className="score-left">
            <div className="score-num" id="scoreNum">0</div>
            <div className="score-grade" id="scoreGrade">—</div>
            <div className="score-verdict" id="scoreVerdict">LOADING</div>
            <div className="score-formula">score = 0.30×CR + 0.25×(100−BR)<br />+ 0.20×EC + 0.15×LS + 0.10×PS</div>
          </div>
          <div className="score-right">
            <div className="signal-row">
              <div className="signal-meta"><span className="signal-lbl">CLOSURE</span><span className="signal-wt">30%</span></div>
              <div className="signal-track"><div className="signal-fill" id="b1" style={{ width: 0, background: 'var(--teal)' }}></div></div>
              <div className="signal-sub">What % of obligations have been sealed</div>
            </div>
            <div className="signal-row">
              <div className="signal-meta"><span className="signal-lbl">BREACH</span><span className="signal-wt">25%</span></div>
              <div className="signal-track"><div className="signal-fill" id="b2" style={{ width: 0, background: 'var(--teal)' }}></div></div>
              <div className="signal-sub">What % of obligations are overdue</div>
            </div>
            <div className="signal-row">
              <div className="signal-meta"><span className="signal-lbl">COVERAGE</span><span className="signal-wt">20%</span></div>
              <div className="signal-track"><div className="signal-fill" id="b3" style={{ width: 0, background: 'var(--teal)' }}></div></div>
              <div className="signal-sub">What % of events have obligations</div>
            </div>
            <div className="signal-row">
              <div className="signal-meta"><span className="signal-lbl">LATENCY</span><span className="signal-wt">15%</span></div>
              <div className="signal-track"><div className="signal-fill" id="b4" style={{ width: 0, background: '#c9a84c' }}></div></div>
              <div className="signal-sub">How fast obligations are closing</div>
            </div>
            <div className="signal-row">
              <div className="signal-meta"><span className="signal-lbl">PROOF</span><span className="signal-wt">10%</span></div>
              <div className="signal-track"><div className="signal-fill" id="b5" style={{ width: 0, background: 'var(--teal)' }}></div></div>
              <div className="signal-sub">Sealed obligations with receipt</div>
            </div>
          </div>
        </div>
      </section>

      {/* VERTICALS */}
      <section id="verticals">
        <div className="sec-label">Enforcement Faces</div>
        <h2>One kernel. Every vertical.</h2>
        <p className="sec-body">The enforcement chain is universal. AutoKirk deploys a vertical-specific Face for each industry — same immutable kernel, vocabulary and workflows tuned to your business.</p>
        <div className="vert-grid">
          <div className="vert-card live">
            <div className="vert-status s-live">● Customer #0001 Live</div>
            <div className="vert-name">Marine Dealership</div>
            <div className="vert-desc">Service jobs, parts, boat sales, washbay, HR. Full obligation enforcement across every revenue touchpoint in a marine operation.</div>
          </div>
          <div className="vert-card next">
            <div className="vert-status s-next">Coming Soon</div>
            <div className="vert-name">Automotive Retail</div>
            <div className="vert-desc">F&amp;I compliance, service ROs, parts POs, warranty claims. Same leakage patterns as marine — different vocabulary.</div>
          </div>
          <div className="vert-card">
            <div className="vert-status s-plan">Face #004 Designed</div>
            <div className="vert-name">Advertising Accountability</div>
            <div className="vert-desc">FRL readiness, campaign obligation tracking, proof of performance. Enforcement for the ad accountability layer.</div>
          </div>
          <div className="vert-card">
            <div className="vert-status s-plan">Planned</div>
            <div className="vert-name">Food Service</div>
            <div className="vert-desc">Vendor invoices, labor obligations, compliance duties. Revenue enforcement for hospitality operations.</div>
          </div>
          <div className="vert-card">
            <div className="vert-status s-plan">Planned</div>
            <div className="vert-name">Healthcare Revenue Cycle</div>
            <div className="vert-desc">Claim obligations, auth tracking, denial enforcement. The most obligation-dense industry in existence.</div>
          </div>
          <div className="vert-card">
            <div className="vert-status s-plan">Talk to us</div>
            <div className="vert-name">Your Industry</div>
            <div className="vert-desc">The kernel is vertical-agnostic. If your business creates obligations and needs proof of closure, AutoKirk can be deployed.</div>
          </div>
        </div>
      </section>

      {/* WHY */}
      <section>
        <div className="sec-label">Why This Exists</div>
        <div className="why-grid">
          <div>
            <h2>Every business runs on obligations.<br />None of them have enforcement infrastructure.</h2>
            <p className="why-body">CRMs track who you talked to. ERPs track what you have. Project tools track what you&apos;re doing. Not one of them enforces the obligation chain — the moment a duty was created, who owns it, what closure looks like, and whether proof exists that it actually happened.</p>
            <p className="why-body">AutoKirk is the first system built around a single question: <em>did the obligation close, and can you prove it?</em></p>
          </div>
          <div className="comp-table">
            <div className="comp-row"><span className="comp-tool">CRM</span><span className="comp-does">Tracks contacts &amp; pipeline</span><span className="comp-miss">✗ No obligation enforcement</span></div>
            <div className="comp-row"><span className="comp-tool">ERP</span><span className="comp-does">Tracks inventory &amp; finance</span><span className="comp-miss">✗ No receipt requirement</span></div>
            <div className="comp-row"><span className="comp-tool">Project Mgmt</span><span className="comp-does">Tracks tasks &amp; status</span><span className="comp-miss">✗ No closure proof layer</span></div>
            <div className="comp-row highlight"><span className="comp-tool ak">AutoKirk</span><span className="comp-does">Enforces the obligation chain</span><span className="comp-win">✓ Complete enforcement chain</span></div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <div className="cta-section">
        <div className="cta-label">Operator Access</div>
        <h2 className="cta-title">The businesses that close their obligation gaps<br /><span className="accent">keep revenue that everyone else loses.</span></h2>
        <p className="cta-body">AutoKirk is currently deploying to a limited set of operators. Access is by approval. If your business has obligations that need enforcement, apply now.</p>
        <div className="cta-actions">
          <a href="/subscribe" className="btn-primary">Apply for operator access</a>
          <a href="/login" className="btn-secondary" style={{ color: 'var(--muted)' }}>Existing operator sign in →</a>
        </div>
        <div className="cta-foot">
          <span>Kirk Digital Holdings LLC</span><span className="dot">·</span>
          <span>AutoKirk IP Holdings LLC</span><span className="dot">·</span>
          <span>AutoKirk Systems LLC</span>
        </div>
      </div>
    </>
  );
}
