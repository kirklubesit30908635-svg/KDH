'use client'

import { useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const redirectTo = `${window.location.origin}/auth/callback`
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    })
    setLoading(false)
    if (error) { setError(error.message) } else { setSent(true) }
  }

  return (
    <div style={{ minHeight:'100vh', background:'#0a0908', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'monospace' }}>
      <div style={{ width:'100%', maxWidth:'400px', padding:'48px 40px', background:'#0d0b09', border:'1px solid rgba(237,232,224,0.1)' }}>
        <p style={{ fontSize:'10px', letterSpacing:'0.25em', color:'rgba(237,232,224,0.35)', marginBottom:'8px', textTransform:'uppercase' }}>OLD SALT MARINE</p>
        <h1 style={{ fontSize:'28px', fontFamily:'serif', fontWeight:900, color:'#ede8e0' }}>Sales Access</h1>
        <p style={{ fontSize:'12px', color:'rgba(237,232,224,0.4)', marginTop:'10px', marginBottom:'32px' }}>Enter your email to receive a sign in link.</p>
        {sent ? (
          <p style={{ fontSize:'13px', color:'#ede8e0' }}>Check your email — a sign in link has been sent.</p>
        ) : (
          <form onSubmit={handleSubmit}>
            <label style={{ display:'block', fontSize:'9px', letterSpacing:'0.2em', color:'rgba(237,232,224,0.35)', textTransform:'uppercase', marginBottom:'8px' }}>EMAIL ADDRESS</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="operator@autokirk.com"
              style={{ width:'100%', padding:'12px 14px', background:'rgba(237,232,224,0.04)', border:'1px solid rgba(237,232,224,0.12)', color:'#ede8e0', fontSize:'13px', fontFamily:'monospace', outline:'none', marginBottom:'16px' }} />
            {error && <p style={{ fontSize:'11px', color:'#ff6b6b', marginBottom:'12px' }}>{error}</p>}
            <button type="submit" disabled={loading}
              style={{ width:'100%', padding:'13px', background:'#ede8e0', color:'#0a0908', border:'none', fontSize:'10px', fontFamily:'monospace', fontWeight:700, letterSpacing:'0.15em', textTransform:'uppercase', cursor:'pointer' }}>
              {loading ? 'Sending...' : 'Send Magic Link →'}
            </button>
          </form>
        )}
        <p style={{ fontSize:'10px', color:'rgba(237,232,224,0.15)', textAlign:'center', marginTop:'24px' }}>Old Salt Marine Sales Console</p>
      </div>
    </div>
  )
}
