'use client'

import { useRouter } from 'next/navigation'

const C = {
  bg: '#050505', surface: '#0f0f0f', border: '#1a1a1a',
  accent: '#2a2a2a', text: '#e8e8e8', textMuted: '#555',
  textDim: '#333', liveText: '#4a9a4a', appendOnly: '#3a3a3a',
}

function Btn({ children, onClick, full }: { children: React.ReactNode; onClick: () => void; full?: boolean }) {
  return (
    <button onClick={onClick} style={{ backgroundColor: C.accent, color: C.text, border: `1px solid ${C.border}`, padding: '9px 14px', fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase' as const, cursor: 'pointer', fontWeight: '600', width: full ? '100%' : 'auto', textAlign: 'left' as const, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: 'monospace' }}>
      {children} <span style={{ opacity: 0.4 }}>→</span>
    </button>
  )
}

function Card({ tag, title, desc, btnLabel, href, status, statusColor }: { tag: string; title: string; desc: string; btnLabel: string; href: string; status: string; statusColor: string }) {
  const router = useRouter()
  return (
    <div style={{ border: `1px solid ${C.border}`, padding: '18px', backgroundColor: C.surface, display: 'flex', flexDirection: 'column' as const, gap: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '9px', color: C.textMuted, letterSpacing: '0.18em', textTransform: 'uppercase' as const }}>{tag}</span>
        <span style={{ fontSize: '9px', color: statusColor }}>● {status}</span>
      </div>
      <div>
        <div style={{ fontSize: '14px', fontWeight: '700', color: C.text, marginBottom: '4px', fontFamily: 'sans-serif' }}>{title}</div>
        <div style={{ fontSize: '11px', color: C.textMuted, lineHeight: '1.5' }}>{desc}</div>
      </div>
      <Btn onClick={() => router.push(href)} full>{btnLabel}</Btn>
    </div>
  )
}

export default function Home() {
  const router = useRouter()
  return (
    <div style={{ backgroundColor: C.bg, color: C.text, minHeight: '100vh', fontFamily: 'monospace' }}>
      <div style={{ borderBottom: `1px solid ${C.border}`, padding: '10px 20px', fontSize: '9px', letterSpacing: '0.2em', color: C.textMuted, textTransform: 'uppercase' as const, display: 'flex', justifyContent: 'space-between' }}>
        <span>AutoKirk Operator Console</span>
        <span style={{ color: C.liveText }}>● System Live</span>
      </div>
      <div style={{ padding: '40px 20px 28px', borderBottom: `1px solid ${C.border}` }}>
        <h1 style={{ fontSize: 'clamp(1.8rem, 4vw, 3rem)', fontWeight: '900', color: C.text, lineHeight: '1.1', margin: '0 0 12px', fontFamily: 'sans-serif', letterSpacing: '-0.02em' }}>
          Surface Simplicity.<br />Core Ruthlessness.
        </h1>
        <p style={{ fontSize: '12px', color: C.textMuted, maxWidth: '520px', lineHeight: '1.7', margin: 0 }}>
          This UI does not govern. It routes you into governed execution.{' '}
          <span style={{ color: '#888' }}>If it isn't written here, it didn't happen.</span>
        </p>
      </div>
      <div style={{ padding: '20px' }}>
        <div style={{ fontSize: '9px', letterSpacing: '0.2em', color: C.textDim, textTransform: 'uppercase' as const, marginBottom: '10px' }}>System Intelligence</div>
        <div style={{ border: `1px solid ${C.border}`, padding: '18px', backgroundColor: C.surface, marginBottom: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
            <div>
              <div style={{ fontSize: '16px', fontWeight: '700', color: C.text, marginBottom: '3px', fontFamily: 'sans-serif' }}>Integrity</div>
              <div style={{ fontSize: '11px', color: C.textMuted, lineHeight: '1.5' }}>Integrity Score · Closure Rate · Breach Rate · Revenue Leakage — the single number that cannot lie.</div>
            </div>
            <span style={{ fontSize: '9px', color: C.liveText, whiteSpace: 'nowrap' as const, marginLeft: '16px' }}>● Live</span>
          </div>
          <Btn onClick={() => router.push('/integrity')} full>View Integrity Score</Btn>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
          <Card tag="Face 003" title="Dealership Enforcement" desc="Next Actions · Reassurance Search · Daily Check-In" btnLabel="Enter Face" href="/command" status="Operational" statusColor={C.liveText} />
          <Card tag="Face 001" title="Billing Enforcement" desc="Stripe intake → obligations → closure → receipts" btnLabel="Enter Face" href="/billing-ops" status="Operational" statusColor={C.liveText} />
          <Card tag="Face 004" title="Advertising Enforcement" desc="Spend → Lead → Follow-Up → Sale → Margin → Renewal Gate" btnLabel="Enter Face" href="/advertising" status="Operational" statusColor={C.liveText} />
          <Card tag="Proof Layer" title="Receipts" desc="Institutional proof — every sealed obligation leaves a receipt." btnLabel="View Receipts" href="/receipts" status="Append-Only" statusColor={C.appendOnly} />
        </div>
        <div style={{ border: `1px solid ${C.border}`, padding: '18px', backgroundColor: C.surface }}>
          <div style={{ fontSize: '9px', letterSpacing: '0.2em', color: C.textDim, textTransform: 'uppercase' as const, marginBottom: '12px' }}>Operator Access</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
            <div>
              <div style={{ fontSize: '13px', color: C.text, marginBottom: '3px' }}>Supabase magic-link — access controlled</div>
              <div style={{ fontSize: '10px', color: C.textMuted }}>Authority lives in the Core. UI is routing only.</div>
            </div>
            <button onClick={() => router.push('/login')} style={{ backgroundColor: C.text, color: C.bg, border: 'none', padding: '10px 18px', fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase' as const, cursor: 'pointer', fontWeight: '800', whiteSpace: 'nowrap' as const, fontFamily: 'monospace' }}>
              Authenticate →
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}