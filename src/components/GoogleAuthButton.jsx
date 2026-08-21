import { useState } from 'react'
import { supabase } from '../lib/supabase'

function GoogleGIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.98v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC04" d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.98A9 9 0 0 0 0 9c0 1.45.35 2.83.98 4.03l2.97-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .98 4.97L3.95 7.3C4.66 5.17 6.65 3.58 9 3.58z" />
    </svg>
  )
}

export default function GoogleAuthButton({ mode, onError }) {
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    setLoading(true)
    // No "#" here (not '/#/auth/callback') — Supabase's Google OAuth uses the
    // implicit flow and appends "#access_token=..." to this redirectTo. If
    // this value already contained its own "#", the result is two "#"
    // characters in one URL (".../#/auth/callback#access_token=..."), which
    // browsers treat as ONE mangled fragment starting at the first "#" —
    // supabase-js can't parse access_token out of that, so it never detects
    // the session even though Supabase already created one server-side. A
    // plain path keeps Supabase's appended "#access_token=..." as the URL's
    // only fragment. See App.jsx's matching check on window.location.pathname
    // and AuthCallback.jsx.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + '/auth/callback',
      },
    })
    if (error) {
      onError?.(error.message)
      setLoading(false)
    }
    // On success the browser navigates away to Google — nothing more to do here.
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        padding: '11px 0',
        borderRadius: 10,
        background: loading ? '#f8f8f8' : '#ffffff',
        border: '1px solid #dadce0',
        color: '#3c4043',
        fontSize: 14,
        fontWeight: 600,
        fontFamily: 'inherit',
        cursor: loading ? 'wait' : 'pointer',
        transition: 'background 0.15s',
      }}
      onMouseEnter={e => { if (!loading) e.currentTarget.style.background = '#f8f8f8' }}
      onMouseLeave={e => { if (!loading) e.currentTarget.style.background = '#ffffff' }}
    >
      {loading ? (
        <span
          aria-hidden="true"
          style={{
            width: 16, height: 16, borderRadius: '50%',
            border: '2px solid #dadce0', borderTopColor: '#3c4043',
            animation: 'fb-google-spin 0.7s linear infinite',
          }}
        />
      ) : (
        <GoogleGIcon />
      )}
      {mode === 'signup' ? 'Sign up with Google' : 'Continue with Google'}
      <style>{`@keyframes fb-google-spin { to { transform: rotate(360deg); } }`}</style>
    </button>
  )
}
