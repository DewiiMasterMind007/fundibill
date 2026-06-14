import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import PasswordInput from '../components/PasswordInput'
import fundibillLogo from '../../public/FundiBill long.png'

export default function Auth() {
  const { signIn, signUp } = useAuth()

  const [mode,       setMode]       = useState('login')
  const [email,      setEmail]      = useState('')
  const [password,   setPassword]   = useState('')
  const [confirm,    setConfirm]    = useState('')
  const [error,      setError]      = useState('')
  const [loading,    setLoading]    = useState(false)
  const [registered, setRegistered] = useState(false)  // show success screen
  const [countdown,  setCountdown]  = useState(5)       // seconds until redirect

  const isRegister = mode === 'register'

  // After a successful registration: count down then return to login
  useEffect(() => {
    if (!registered) return
    if (countdown <= 0) {
      setRegistered(false)
      setCountdown(5)
      setMode('login')
      setEmail(''); setPassword(''); setConfirm('')
      return
    }
    const t = setTimeout(() => setCountdown(n => n - 1), 1000)
    return () => clearTimeout(t)
  }, [registered, countdown])

  function switchMode(next) {
    setMode(next); setError('')
    setEmail(''); setPassword(''); setConfirm('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (isRegister && password !== confirm) { setError('Passwords do not match.'); return }
    setLoading(true)
    const { error: err } = isRegister
      ? await signUp(email, password)
      : await signIn(email, password)
    setLoading(false)
    if (err) {
      setError(err.message)
    } else if (isRegister) {
      // Supabase sends a confirmation email — show the success screen
      setRegistered(true)
      setCountdown(5)
    }
  }

  // Glass input style — white text on frosted background
  const INPUT = {
    width: '100%', padding: '11px 14px', borderRadius: 10, fontSize: 16,
    background: 'rgba(255,255,255,0.15)',
    border: '1.5px solid rgba(255,255,255,0.30)',
    color: '#ffffff',
    outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
    backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
    transition: 'border-color 0.15s, background 0.15s',
  }
  const focusStyle = e => {
    e.target.style.borderColor = 'rgba(255,255,255,0.70)'
    e.target.style.background  = 'rgba(255,255,255,0.22)'
  }
  const blurStyle = e => {
    e.target.style.borderColor = 'rgba(255,255,255,0.30)'
    e.target.style.background  = 'rgba(255,255,255,0.15)'
  }

  return (
    <div style={{
      minHeight:       '100vh',
      background:      'linear-gradient(165deg, #0891b2 0%, #0d9488 48%, #16a34a 100%)',
      display:         'flex',
      alignItems:      'center',
      justifyContent:  'center',
      fontFamily:      'inherit',
      position:        'relative',
      overflow:        'hidden',
    }}>
      {/* ── Top-light shimmer (matches sidebar) ── */}
      <div aria-hidden="true" style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: '55%',
        background: 'linear-gradient(to bottom, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0) 100%)',
        pointerEvents: 'none',
      }} />

      {/* ── Placeholder colour fix for glass inputs ── */}
      <style>{`
        .fb-input::placeholder { color: rgba(255,255,255,0.50); }
        .fb-input:-webkit-autofill,
        .fb-input:-webkit-autofill:focus {
          -webkit-text-fill-color: #ffffff;
          -webkit-box-shadow: 0 0 0 100px rgba(13,148,136,0.5) inset;
          transition: background-color 9999s;
        }
      `}</style>

      {/* ── Glass card ── */}
      <div style={{
        position:             'relative',
        zIndex:               1,
        background:           'rgba(255,255,255,0.16)',
        backdropFilter:       'blur(28px)',
        WebkitBackdropFilter: 'blur(28px)',
        borderRadius:         20,
        padding:              '44px 40px 36px',
        border:               '1px solid rgba(255,255,255,0.36)',
        boxShadow:            '0 8px 48px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.50)',
        width:                '100%',
        maxWidth:             420,
      }}>

        {/* ── Logo — wide wordmark ── */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <img
            src={fundibillLogo}
            alt="FundiBill"
            style={{ width: '100%', maxWidth: 300, height: 'auto', display: 'block', margin: '0 auto' }}
          />
        </div>

        {/* ── Registration success screen ── */}
        {registered ? (
          <div style={{ textAlign: 'center', padding: '8px 0 16px' }}>
            <div style={{ fontSize: 52, marginBottom: 16 }}>✉️</div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#ffffff', margin: '0 0 12px',
                         textShadow: '0 1px 6px rgba(0,0,0,0.2)' }}>
              Check your inbox!
            </h2>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.85)', lineHeight: 1.65, margin: '0 0 24px' }}>
              Thank you for signing up. Please check your emails to confirm
              your email address before signing in.
            </p>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', margin: 0 }}>
              Returning to sign in in {countdown}s…
            </p>
          </div>
        ) : (
          <>
        {/* ── Heading ── */}
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#ffffff', margin: '0 0 4px', textShadow: '0 1px 4px rgba(0,0,0,0.15)' }}>
          {isRegister ? 'Create your account' : 'Welcome back'}
        </h1>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.72)', margin: '0 0 24px', lineHeight: 1.5 }}>
          {isRegister
            ? 'Sign up to start managing your invoices.'
            : 'Sign in to access your FundiBill workspace.'}
        </p>

        {/* ── Form ── */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.85)', marginBottom: 6 }}>
              Email address
            </label>
            <input
              className="fb-input"
              type="email" required autoComplete="email"
              value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={INPUT} onFocus={focusStyle} onBlur={blurStyle}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.85)', marginBottom: 6 }}>
              Password
            </label>
            <PasswordInput
              className="fb-input"
              required autoComplete={isRegister ? 'new-password' : 'current-password'}
              value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              style={INPUT} onFocus={focusStyle} onBlur={blurStyle}
              iconColor="rgba(255,255,255,0.55)" iconHoverColor="rgba(255,255,255,0.9)"
            />
          </div>

          {isRegister && (
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.85)', marginBottom: 6 }}>
                Confirm password
              </label>
              <PasswordInput
                className="fb-input"
                required autoComplete="new-password"
                value={confirm} onChange={e => setConfirm(e.target.value)}
                placeholder="••••••••"
                style={INPUT} onFocus={focusStyle} onBlur={blurStyle}
                iconColor="rgba(255,255,255,0.55)" iconHoverColor="rgba(255,255,255,0.9)"
              />
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{
              background: 'rgba(239,68,68,0.22)', border: '1px solid rgba(239,68,68,0.45)',
              backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
              borderRadius: 9, padding: '10px 14px', fontSize: 13, color: '#fca5a5',
            }}>
              {error}
            </div>
          )}

          {/* Submit — solid white so it pops out of the glass card */}
          <button
            type="submit" disabled={loading}
            style={{
              marginTop:    6,
              background:   loading ? 'rgba(255,255,255,0.70)' : '#ffffff',
              color:        '#0d9488',
              border:       'none',
              borderRadius: 10,
              padding:      '12px 0',
              fontSize:     15,
              fontWeight:   700,
              cursor:       loading ? 'wait' : 'pointer',
              boxShadow:    loading ? 'none' : '0 4px 20px rgba(0,0,0,0.15)',
              transition:   'background 0.15s, box-shadow 0.15s',
              letterSpacing:'-0.1px',
            }}
          >
            {loading
              ? (isRegister ? 'Creating account…' : 'Signing in…')
              : (isRegister ? 'Create account'    : 'Sign in')}
          </button>
        </form>

        {/* Toggle */}
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', textAlign: 'center', margin: '22px 0 0' }}>
          {isRegister ? 'Already have an account? ' : "Don't have an account? "}
          <button
            onClick={() => switchMode(isRegister ? 'login' : 'register')}
            style={{
              background: 'none', border: 'none', padding: 0,
              color: '#ffffff', fontWeight: 700, fontSize: 13,
              cursor: 'pointer', fontFamily: 'inherit',
              textDecoration: 'underline', textUnderlineOffset: 2,
            }}
          >
            {isRegister ? 'Sign in' : 'Register'}
          </button>
        </p>
          </>
        )}

      </div>
    </div>
  )
}
