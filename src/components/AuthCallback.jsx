import { useEffect } from 'react'
import { supabase } from '../lib/supabase'

// Reached at the plain path /auth/callback after a Supabase Google OAuth
// redirect (see GoogleAuthButton.jsx for why it's a plain path, not
// "/#/auth/callback" — Supabase appends "#access_token=..." here for the
// implicit flow it uses for Google sign-in, and that collides with a "#"
// already in the redirect target). supabase-js parses the token(s) out of
// the hash asynchronously on load, so we wait for onAuthStateChange to
// report the resulting session rather than calling getSession() immediately
// (which can race ahead and return a stale null session).
//
// Because we land here on a real path (not "/"), every exit below resets
// the full URL back to origin + a "/#/..." hash route — just setting
// location.hash would leave the browser on ".../auth/callback#/dashboard"
// instead of ".../#/dashboard".
export default function AuthCallback() {
  useEffect(() => {
    let settled = false

    function goToLogin() {
      if (settled) return
      settled = true
      window.location.href = window.location.origin + '/#/login?error=auth_failed'
    }

    async function ensureProfile(user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .maybeSingle()

      if (!profile) {
        const fullName = user.user_metadata?.full_name || user.user_metadata?.name || ''
        await supabase.from('profiles').upsert(
          { id: user.id, email: user.email, business_name: fullName, tutorial_completed: false },
          { onConflict: 'id' }
        )
      }
    }

    async function handleSession(session) {
      if (settled || !session?.user) return
      settled = true
      await ensureProfile(session.user)
      window.location.href = window.location.origin + '/#/dashboard'
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) handleSession(session)
    })

    // Fallback in case the auth event already fired before this listener attached,
    // or the exchange is just slow. A single 5s timeout was too aggressive —
    // confirmed in production against real accounts where the session was
    // created successfully (auth.users.last_sign_in_at set) but only after the
    // 5s window had already given up and redirected to the error screen,
    // discarding a login that was about to succeed. Poll every 2s for up to
    // 20s instead, so a slow (but working) exchange has real time to land.
    let pollCount = 0
    const MAX_POLLS = 10 // 10 * 2s = 20s total
    let pollTimer = null

    async function poll() {
      if (settled) return
      pollCount++
      const { data: { session } } = await supabase.auth.getSession()
      if (settled) return
      if (session?.user) {
        handleSession(session)
        return
      }
      if (pollCount >= MAX_POLLS) {
        goToLogin()
        return
      }
      pollTimer = setTimeout(poll, 2000)
    }
    pollTimer = setTimeout(poll, 2000)

    return () => { clearTimeout(pollTimer); subscription.unsubscribe() }
  }, [])

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(165deg, #0891b2 0%, #0d9488 48%, #16a34a 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <div
        aria-label="Signing in…"
        style={{
          width: 40, height: 40, borderRadius: '50%',
          border: '3px solid rgba(255,255,255,0.35)',
          borderTopColor: '#ffffff',
          animation: 'fb-callback-spin 0.8s linear infinite',
        }}
      />
      <style>{`@keyframes fb-callback-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
