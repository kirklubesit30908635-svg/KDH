'use client'

import { useRouter } from 'next/navigation'

export default function Home() {
  const router = useRouter()

  return (
    <div style={{
      backgroundColor: '#000',
      color: '#fff',
      minHeight: '100vh',
      fontFamily: 'monospace',
      padding: '0',
    }}>
      {/* Header */}
      <div style={{
        borderBottom: '1px solid #222',
        padding: '12px 24px',
        fontSize: '11px',
        letterSpacing: '0.15em',
        color: '#888',
        textTransform: 'uppercase',
      }}>
        AutoKirk Operator Console
      </div>

      {/* Hero */}
      <div style={{ padding: '48px 24px 32px' }}>
        <h1 style={{
          fontSize: 'clamp(2rem, 5vw, 3.5rem)',
          fontWeight: '900',
          color: '#d4a017',
          lineHeight: '1.1',
          margin: '0 0 16px',
          fontFamily: 'sans-serif',
        }}>
          Surface Simplicity.<br />Core Ruthlessness.
        </h1>
        <p style={{
          fontSize: '14px',
          color: '#aaa',
          maxWidth: '600px',
          lineHeight: '1.6',
          margin: 0,
        }}>
          This UI does not govern. It routes you into governed execution.{' '}
          <strong style={{ color: '#fff' }}>If it isn't written here, it didn't happen.</strong>
        </p>
      </div>

      {/* System Intelligence */}
      <div style={{ padding: '0 24px 8px' }}>
        <div style={{
          fontSize: '10px',
          letterSpacing: '0.2em',
          color: '#555',
          textTransform: 'uppercase',
          marginBottom: '4px',
        }}>
          System Intelligence
        </div>
        <div style={{
          fontSize: '11px',
          letterSpacing: '0.15em',
          color: '#888',
          textTransform: 'uppercase',
          marginBottom: '12px',
          borderBottom: '1px solid #222',
          paddingBottom: '8px',
        }}>
          System Intelligence
        </div>

        {/* Integrity Card */}
        <div style={{
          border: '1px solid #333',
          padding: '16px',
          marginBottom: '12px',
          backgroundColor: '#0a0a0a',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '18px', fontWeight: '700', color: '#fff', marginBottom: '4px', fontFamily: 'sans-serif' }}>
                Integrity
              </div>
              <div style={{ fontSize: '12px', color: '#666' }}>
                Integrity Score · Closure Rate · Breach Rate · Revenue Leakage — the single number that cannot lie.
              </div>
            </div>
            <div style={{
              width: '8px', height: '8px', borderRadius: '50%',
              backgroundColor: '#00ff88', marginTop: '4px', flexShrink: 0,
            }} />
          </div>
          <button
            onClick={() => router.push('/integrity')}
            style={{
              marginTop: '12px',
              backgroundColor: '#d4a017',
              color: '#000',
              border: 'none',
              padding: '10px 16px',
              fontSize: '11px',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              fontWeight: '700',
              width: '100%',
              textAlign: 'left',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            View Integrity Score <span>—</span>
          </button>
        </div>

        {/* Face Cards Row 1 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
          {/* Face 003 */}
          <div style={{ border: '1px solid #333', padding: '16px', backgroundColor: '#0a0a0a' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '10px', color: '#555', letterSpacing: '0.15em', textTransform: 'uppercase' }}>Face 003</span>
              <span style={{ fontSize: '10px', color: '#00ff88' }}>● Operational</span>
            </div>
            <div style={{ fontSize: '15px', fontWeight: '700', color: '#fff', marginBottom: '4px', fontFamily: 'sans-serif' }}>
              Dealership Enforcement
            </div>
            <div style={{ fontSize: '11px', color: '#666', marginBottom: '12px' }}>
              Next Actions · Reassurance Search · Daily Check-In
            </div>
            <button
              onClick={() => router.push('/command')}
              style={{
                backgroundColor: '#d4a017',
                color: '#000',
                border: 'none',
                padding: '8px 12px',
                fontSize: '10px',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                fontWeight: '700',
                width: '100%',
                textAlign: 'left',
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              Enter Face <span>—</span>
            </button>
          </div>

          {/* Face 001 */}
          <div style={{ border: '1px solid #333', padding: '16px', backgroundColor: '#0a0a0a' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '10px', color: '#555', letterSpacing: '0.15em', textTransform: 'uppercase' }}>Face 001</span>
              <span style={{ fontSize: '10px', color: '#00ff88' }}>● Operational</span>
            </div>
            <div style={{ fontSize: '15px', fontWeight: '700', color: '#fff', marginBottom: '4px', fontFamily: 'sans-serif' }}>
              Billing Enforcement
            </div>
            <div style={{ fontSize: '11px', color: '#666', marginBottom: '12px' }}>
              Stripe intake → obligations → closure → receipts
            </div>
            <button
              onClick={() => router.push('/billing-ops')}
              style={{
                backgroundColor: '#d4a017',
                color: '#000',
                border: 'none',
                padding: '8px 12px',
                fontSize: '10px',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                fontWeight: '700',
                width: '100%',
                textAlign: 'left',
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              Enter Face <span>—</span>
            </button>
          </div>
        </div>

        {/* Face Cards Row 2 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
          {/* Face 004 */}
          <div style={{ border: '1px solid #333', padding: '16px', backgroundColor: '#0a0a0a' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '10px', color: '#555', letterSpacing: '0.15em', textTransform: 'uppercase' }}>Face 004</span>
              <span style={{ fontSize: '10px', color: '#00ff88' }}>● Operational</span>
            </div>
            <div style={{ fontSize: '15px', fontWeight: '700', color: '#fff', marginBottom: '4px', fontFamily: 'sans-serif' }}>
              Advertising Enforcement
            </div>
            <div style={{ fontSize: '11px', color: '#666', marginBottom: '12px' }}>
              Spend → Lead → Follow-Up → Sale → Margin → Renewal Gate
            </div>
            <button
              onClick={() => router.push('/advertising')}
              style={{
                backgroundColor: '#d4a017',
                color: '#000',
                border: 'none',
                padding: '8px 12px',
                fontSize: '10px',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                fontWeight: '700',
                width: '100%',
                textAlign: 'left',
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              Enter Face <span>—</span>
            </button>
          </div>

          {/* Proof Layer */}
          <div style={{ border: '1px solid #333', padding: '16px', backgroundColor: '#0a0a0a' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '10px', color: '#555', letterSpacing: '0.15em', textTransform: 'uppercase' }}>Proof Layer</span>
              <span style={{ fontSize: '10px', color: '#888' }}>● Append-Only</span>
            </div>
            <div style={{ fontSize: '15px', fontWeight: '700', color: '#fff', marginBottom: '4px', fontFamily: 'sans-serif' }}>
              Receipts
            </div>
            <div style={{ fontSize: '11px', color: '#666', marginBottom: '12px' }}>
              Institutional proof — every sealed obligation leaves a receipt.
            </div>
            <button
              onClick={() => router.push('/receipts')}
              style={{
                backgroundColor: '#d4a017',
                color: '#000',
                border: 'none',
                padding: '8px 12px',
                fontSize: '10px',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                fontWeight: '700',
                width: '100%',
                textAlign: 'left',
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              View Receipts <span>—</span>
            </button>
          </div>
        </div>

        {/* Operator Access */}
        <div style={{
          border: '1px solid #333',
          padding: '16px',
          backgroundColor: '#0a0a0a',
          marginBottom: '32px',
        }}>
          <div style={{
            fontSize: '10px',
            letterSpacing: '0.2em',
            color: '#555',
            textTransform: 'uppercase',
            marginBottom: '8px',
          }}>
            Operator Access
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '14px', color: '#fff', marginBottom: '4px' }}>
                Supabase magic-link — access controlled
              </div>
              <div style={{ fontSize: '11px', color: '#555' }}>
                Authority lives in the Core. UI is routing only.
              </div>
            </div>
            <button
              onClick={() => router.push('/login')}
              style={{
                backgroundColor: '#d4a017',
                color: '#000',
                border: 'none',
                padding: '10px 20px',
                fontSize: '11px',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                fontWeight: '700',
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              Authenticate —
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}