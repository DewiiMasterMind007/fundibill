import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import PasswordInput from '../components/PasswordInput'
import fundibillLogo from '../../public/FundiBill long.png'

export default function Auth() {
  const { signIn, signUp, signOut, recoveryMode, clearRecoveryMode } = useAuth()

  // mode: 'choice' | 'login' | 'register' | 'forgot'
  const [mode,       setMode]       = useState('choice')
  const [email,      setEmail]      = useState('')
  const [password,   setPassword]   = useState('')
  const [confirm,    setConfirm]    = useState('')
  const [error,      setError]      = useState('')
  const [loading,    setLoading]    = useState(false)

  // Signup success screen
  const [registered, setRegistered] = useState(false)
  const [regEmail,   setRegEmail]   = useState('')

  // Unverified email
  const [isUnverified,   setIsUnverified]   = useState(false)
  const [resendStatus,   setResendStatus]   = useState('idle') // 'idle'|'sending'|'sent'|'error'
  const [resendError,    setResendError]    = useState('')
  const [resendCooldown, setResendCooldown] = useState(0)

  // Password reset (send email)
  const [resetSent,    setResetSent]    = useState(false)
  const [resetError,   setResetError]   = useState('')
  const [resetLoading, setResetLoading] = useState(false)

  // Set new password (recovery mode — token already handled by AuthContext)
  const [newPassword,        setNewPassword]        = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [resetNewLoading,    setResetNewLoading]    = useState(false)
  const [resetNewError,      setResetNewError]      = useState('')
  const [resetNewSuccess,    setResetNewSuccess]    = useState(false)

  const isRegister = mode === 'register'
  const isForgot   = mode === 'forgot'

  // Resend cooldown countdown
  useEffect(() => {
    if (resendCooldown <= 0) return
    const t = setTimeout(() => setResendCooldown(n => n - 1), 1000)
    return () => clearTimeout(t)
  }, [resendCooldown])

  function switchMode(next) {
    setMode(next)
    setError('')
    setIsUnverified(false)
    setResendStatus('idle')
    setResendError('')
    setResendCooldown(0)
    setResetSent(false)
    setResetError('')
    setPassword('')
    setConfirm('')
    if (next !== 'forgot') setEmail('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setIsUnverified(false)
    if (isRegister && password !== confirm) { setError('Passwords do not match.'); return }
    setLoading(true)
    const submittedEmail = email
    const { error: err } = isRegister
      ? await signUp(email, password)
      : await signIn(email, password)
    setLoading(false)
    if (err) {
      const msg = err.message || ''
      if (msg.includes('Email not confirmed') || msg.includes('email_not_confirmed')) {
        setIsUnverified(true)
        setError(
          'Please verify your email address before logging in. Check your inbox for a confirmation email from noreply@fundibill.online'
        )
      } else {
        setError(msg)
      }
    } else if (isRegister) {
      setRegEmail(submittedEmail)
      setRegistered(true)
    }
  }

  async function handleResend() {
    if (resendCooldown > 0 || resendStatus === 'sending') return
    setResendStatus('sending')
    setResendError('')
    const { error: err } = await supabase.auth.resend({ type: 'signup', email })
    if (err) {
      setResendStatus('error')
      setResendError('Could not resend email. Please try again or contact support at info@fundiai.co.za')
    } else {
      setResendStatus('sent')
    }
    setResendCooldown(60)
  }

  async function handleForgotPassword(e) {
    e.preventDefault()
    setResetError('')
    setResetLoading(true)
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'https://app.fundibill.online',
    })
    setResetLoading(false)
    if (err) {
      setResetError(err.message)
    } else {
      setResetSent(true)
    }
  }

  async function handleSetNewPassword(e) {
    e.preventDefault()
    setResetNewError('')
    if (newPassword.length < 8) {
      setResetNewError('Password must be at least 8 characters.')
      return
    }
    if (newPassword !== confirmNewPassword) {
      setResetNewError('Passwords do not match.')
      return
    }
    setResetNewLoading(true)
    try {
      // Supabase already established the recovery session from the URL hash —
      // we just need to update the password, then sign out so the user logs in
      // fresh with their new credentials.
      const { error: updateErr } = await supabase.auth.updateUser({ password: newPassword })
      if (updateErr) throw updateErr
      await signOut()
      setResetNewSuccess(true)
    } catch (err) {
      setResetNewError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setResetNewLoading(false)
    }
  }

  // ── Styles ────────────────────────────────────────────────────────────────

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

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{
      minHeight:      '100vh',
      background:     'linear-gradient(165deg, #0891b2 0%, #0d9488 48%, #16a34a 100%)',
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'center',
      fontFamily:     'inherit',
      position:       'relative',
      overflow:       'hidden',
    }}>
      {/* Top-light shimmer */}
      <div aria-hidden="true" style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: '55%',
        background: 'linear-gradient(to bottom, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0) 100%)',
        pointerEvents: 'none',
      }} />

      {/* Placeholder + autofill fix for glass inputs */}
      <style>{`
        .fb-input::placeholder { color: rgba(255,255,255,0.50); }
        .fb-input:-webkit-autofill,
        .fb-input:-webkit-autofill:focus {
          -webkit-text-fill-color: #ffffff;
          -webkit-box-shadow: 0 0 0 100px rgba(13,148,136,0.5) inset;
          transition: background-color 9999s;
        }
      `}</style>

      {/* Glass card */}
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

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <img
            src={fundibillLogo} alt="FundiBill"
            style={{ width: '100%', maxWidth: 300, height: 'auto', display: 'block', margin: '0 auto' }}
          />
        </div>

        {/* ── RECOVERY: SET NEW PASSWORD SCREEN ── */}
        {recoveryMode ? (
          resetNewSuccess ? (
            <div style={{ textAlign: 'center', padding: '8px 0 16px' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
              <h2 style={{
                fontSize: 20, fontWeight: 700, color: '#ffffff', margin: '0 0 12px',
                textShadow: '0 1px 6px rgba(0,0,0,0.2)',
              }}>
                Password updated successfully!
              </h2>
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.82)', lineHeight: 1.7, margin: '0 0 28px' }}>
                Your new password has been saved. You can now sign in with your new password.
              </p>
              <button
                onClick={() => {
                  clearRecoveryMode()
                  setResetNewSuccess(false)
                  setNewPassword('')
                  setConfirmNewPassword('')
                  setMode('login')
                }}
                style={{
                  width: '100%', padding: '12px 0', borderRadius: 10,
                  background: '#ffffff', color: '#0d9488',
                  border: 'none', fontSize: 15, fontWeight: 700,
                  cursor: 'pointer', boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                  fontFamily: 'inherit',
                }}
              >
                Continue to App
              </button>
            </div>
          ) : (
            <>
              <h1 style={{ fontSize: 20, fontWeight: 700, color: '#ffffff', margin: '0 0 4px', textShadow: '0 1px 4px rgba(0,0,0,0.15)' }}>
                Set New Password
              </h1>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.72)', margin: '0 0 24px', lineHeight: 1.5 }}>
                Enter your new password below.
              </p>

              <form onSubmit={handleSetNewPassword} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.85)', marginBottom: 6 }}>
                    New Password
                  </label>
                  <PasswordInput
                    className="fb-input"
                    required autoComplete="new-password"
                    value={newPassword} onChange={e => setNewPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    style={INPUT} onFocus={focusStyle} onBlur={blurStyle}
                    iconColor="rgba(255,255,255,0.55)" iconHoverColor="rgba(255,255,255,0.9)"
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.85)', marginBottom: 6 }}>
                    Confirm Password
                  </label>
                  <PasswordInput
                    className="fb-input"
                    required autoComplete="new-password"
                    value={confirmNewPassword} onChange={e => setConfirmNewPassword(e.target.value)}
                    placeholder="••••••••"
                    style={INPUT} onFocus={focusStyle} onBlur={blurStyle}
                    iconColor="rgba(255,255,255,0.55)" iconHoverColor="rgba(255,255,255,0.9)"
                  />
                </div>

                {resetNewError && (
                  <div style={{
                    background: 'rgba(239,68,68,0.22)', border: '1px solid rgba(239,68,68,0.45)',
                    backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
                    borderRadius: 9, padding: '10px 14px', fontSize: 13, color: '#fca5a5',
                  }}>
                    {resetNewError}
                  </div>
                )}

                <button
                  type="submit" disabled={resetNewLoading}
                  style={{
                    marginTop: 4,
                    background: resetNewLoading ? 'rgba(255,255,255,0.70)' : '#ffffff',
                    color: '#0d9488', border: 'none', borderRadius: 10,
                    padding: '12px 0', fontSize: 15, fontWeight: 700,
                    cursor: resetNewLoading ? 'wait' : 'pointer',
                    boxShadow: resetNewLoading ? 'none' : '0 4px 20px rgba(0,0,0,0.15)',
                    transition: 'background 0.15s', fontFamily: 'inherit',
                  }}
                >
                  {resetNewLoading ? 'Updating…' : 'Update Password'}
                </button>
              </form>
            </>
          )

        ) : mode === 'choice' ? (
          /* ── CHOICE: SIGN UP OR LOGIN ── */
          <>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#ffffff', margin: '0 0 4px', textShadow: '0 1px 4px rgba(0,0,0,0.15)', textAlign: 'center' }}>
              Welcome to FundiBill
            </h1>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.72)', margin: '0 0 28px', lineHeight: 1.5, textAlign: 'center' }}>
              Sign up to get started or Login if you already have an account.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <button
                onClick={() => switchMode('register')}
                style={{
                  width: '100%', padding: '16px 0', borderRadius: 12,
                  background: '#ffffff', color: '#0d9488',
                  border: 'none', fontSize: 16, fontWeight: 700,
                  cursor: 'pointer', boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                  fontFamily: 'inherit',
                }}
              >
                Sign Up
              </button>
              <button
                onClick={() => switchMode('login')}
                style={{
                  width: '100%', padding: '16px 0', borderRadius: 12,
                  background: 'rgba(255,255,255,0.15)', color: '#ffffff',
                  border: '1.5px solid rgba(255,255,255,0.50)', fontSize: 16, fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'inherit',
                  backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
                }}
              >
                Login
              </button>
            </div>

            {/* Legal */}
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textAlign: 'center', margin: '24px 0 0', lineHeight: 1.6 }}>
              By using FundiBill you agree to our{' '}
              <a
                href="https://fundibill.online/terms"
                target="_blank" rel="noopener noreferrer"
                style={{ color: 'rgba(255,255,255,0.65)', textDecoration: 'underline', textUnderlineOffset: 2 }}
              >
                terms of service
              </a>
              {' '}and{' '}
              <a
                href="https://fundibill.online/privacy"
                target="_blank" rel="noopener noreferrer"
                style={{ color: 'rgba(255,255,255,0.65)', textDecoration: 'underline', textUnderlineOffset: 2 }}
              >
                privacy policy
              </a>
            </p>
          </>

        ) : registered ? (
          <div style={{ textAlign: 'center', padding: '8px 0 16px' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
            <h2 style={{
              fontSize: 20, fontWeight: 700, color: '#ffffff', margin: '0 0 12px',
              textShadow: '0 1px 6px rgba(0,0,0,0.2)',
            }}>
              Account created!
            </h2>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.88)', lineHeight: 1.7, margin: '0 0 8px' }}>
              We&apos;ve sent a verification email to
            </p>
            <p style={{
              fontSize: 14, fontWeight: 700, color: '#ffffff',
              margin: '0 0 16px', wordBreak: 'break-all',
            }}>
              {regEmail}
            </p>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.80)', lineHeight: 1.7, margin: '0 0 28px' }}>
              Please check your inbox and click the link to activate your account.
              Once verified, come back here to log in.
            </p>
            <button
              onClick={() => {
                setRegistered(false)
                setMode('login')
                setEmail('')
                setPassword('')
                setConfirm('')
              }}
              style={{
                width: '100%', padding: '12px 0', borderRadius: 10,
                background: '#ffffff', color: '#0d9488',
                border: 'none', fontSize: 15, fontWeight: 700,
                cursor: 'pointer', boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                fontFamily: 'inherit',
              }}
            >
              Back to Login
            </button>
          </div>

        ) : isForgot ? (
          /* ── FORGOT PASSWORD SCREEN ── */
          <>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#ffffff', margin: '0 0 4px', textShadow: '0 1px 4px rgba(0,0,0,0.15)' }}>
              Reset your password
            </h1>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.72)', margin: '0 0 24px', lineHeight: 1.5 }}>
              Enter your email and we&apos;ll send you a reset link.
            </p>

            {resetSent ? (
              <div style={{
                background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.35)',
                borderRadius: 10, padding: '16px 18px', fontSize: 14,
                color: '#ffffff', lineHeight: 1.65, textAlign: 'center',
              }}>
                📬 Password reset email sent! Check your inbox.
              </div>
            ) : (
              <form onSubmit={handleForgotPassword} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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

                {resetError && (
                  <div style={{
                    background: 'rgba(239,68,68,0.22)', border: '1px solid rgba(239,68,68,0.45)',
                    backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
                    borderRadius: 9, padding: '10px 14px', fontSize: 13, color: '#fca5a5',
                  }}>
                    {resetError}
                  </div>
                )}

                <button
                  type="submit" disabled={resetLoading}
                  style={{
                    marginTop: 4, background: resetLoading ? 'rgba(255,255,255,0.70)' : '#ffffff',
                    color: '#0d9488', border: 'none', borderRadius: 10,
                    padding: '12px 0', fontSize: 15, fontWeight: 700,
                    cursor: resetLoading ? 'wait' : 'pointer',
                    boxShadow: resetLoading ? 'none' : '0 4px 20px rgba(0,0,0,0.15)',
                    transition: 'background 0.15s', fontFamily: 'inherit',
                  }}
                >
                  {resetLoading ? 'Sending…' : 'Send Reset Email'}
                </button>
              </form>
            )}

            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', textAlign: 'center', margin: '22px 0 0' }}>
              <button
                onClick={() => switchMode('login')}
                style={{
                  background: 'none', border: 'none', padding: 0,
                  color: '#ffffff', fontWeight: 700, fontSize: 13,
                  cursor: 'pointer', fontFamily: 'inherit',
                  textDecoration: 'underline', textUnderlineOffset: 2,
                }}
              >
                ← Back to Login
              </button>
            </p>
          </>

        ) : (
          /* ── LOGIN / REGISTER SCREEN ── */
          <>
            <button
              onClick={() => switchMode('choice')}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                background: 'none', border: 'none', padding: 0, marginBottom: 10,
                color: 'rgba(255,255,255,0.70)', fontWeight: 600, fontSize: 13,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              ← Back
            </button>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#ffffff', margin: '0 0 4px', textShadow: '0 1px 4px rgba(0,0,0,0.15)' }}>
              {isRegister ? 'Create your account' : 'Welcome back'}
            </h1>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.72)', margin: '0 0 24px', lineHeight: 1.5 }}>
              {isRegister
                ? 'Sign up to start managing your invoices.'
                : 'Sign in to access your FundiBill workspace.'}
            </p>

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

              {/* Error box */}
              {error && (
                <div style={{
                  background: 'rgba(239,68,68,0.22)', border: '1px solid rgba(239,68,68,0.45)',
                  backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
                  borderRadius: 9, padding: '10px 14px', fontSize: 13, color: '#fca5a5',
                  lineHeight: 1.55,
                }}>
                  {error}
                </div>
              )}

              {/* Resend verification — shown only for unverified email errors */}
              {isUnverified && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {resendStatus === 'sent' ? (
                    <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.90)', margin: 0, lineHeight: 1.5 }}>
                      ✅ Verification email sent! Check your inbox.
                    </p>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={handleResend}
                        disabled={resendStatus === 'sending' || resendCooldown > 0}
                        style={{
                          background: 'transparent',
                          border: '1.5px solid rgba(255,255,255,0.50)',
                          color: '#ffffff',
                          borderRadius: 9, padding: '9px 14px',
                          fontSize: 13, fontWeight: 600,
                          cursor: (resendStatus === 'sending' || resendCooldown > 0) ? 'default' : 'pointer',
                          opacity: (resendStatus === 'sending' || resendCooldown > 0) ? 0.65 : 1,
                          fontFamily: 'inherit',
                          transition: 'opacity 0.15s',
                        }}
                      >
                        {resendStatus === 'sending'
                          ? 'Sending…'
                          : resendCooldown > 0
                            ? `Resend again in ${resendCooldown}s`
                            : 'Resend Verification Email'}
                      </button>
                      {resendStatus === 'error' && resendError && (
                        <p style={{ fontSize: 12, color: '#fca5a5', margin: 0, lineHeight: 1.5 }}>
                          {resendError}
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Submit */}
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
                  letterSpacing: '-0.1px',
                  fontFamily:   'inherit',
                }}
              >
                {loading
                  ? (isRegister ? 'Creating account…' : 'Signing in…')
                  : (isRegister ? 'Create account'    : 'Sign in')}
              </button>
            </form>

            {/* Forgot password link — login mode only */}
            {!isRegister && (
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', textAlign: 'center', margin: '14px 0 0' }}>
                <button
                  onClick={() => switchMode('forgot')}
                  style={{
                    background: 'none', border: 'none', padding: 0,
                    color: 'rgba(255,255,255,0.80)', fontWeight: 500, fontSize: 13,
                    cursor: 'pointer', fontFamily: 'inherit',
                    textDecoration: 'underline', textUnderlineOffset: 2,
                  }}
                >
                  Forgot password?
                </button>
              </p>
            )}

            {/* Switch mode */}
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', textAlign: 'center', margin: '14px 0 0' }}>
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

            {/* Legal */}
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textAlign: 'center', margin: '18px 0 0', lineHeight: 1.6 }}>
              By using FundiBill you agree to our{' '}
              <a
                href="https://fundibill.online/terms"
                target="_blank" rel="noopener noreferrer"
                style={{ color: 'rgba(255,255,255,0.65)', textDecoration: 'underline', textUnderlineOffset: 2 }}
              >
                terms of service
              </a>
              {' '}and{' '}
              <a
                href="https://fundibill.online/privacy"
                target="_blank" rel="noopener noreferrer"
                style={{ color: 'rgba(255,255,255,0.65)', textDecoration: 'underline', textUnderlineOffset: 2 }}
              >
                privacy policy
              </a>
            </p>
          </>
        )}

      </div>
    </div>
  )
}
