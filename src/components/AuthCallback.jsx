import { useEffect } from 'react'
import { supabase } from '../lib/supabase'

// Reached at #/auth/callback after a Supabase Google OAuth redirect. supabase-js
// exchanges the ?code= param for a session asynchronously on load, so we wait for
// onAuthStateChange to report it rather than calling getSession() immediately
// (which can race ahead of the exchange and return a stale null session).
export default function AuthCallback() {
  useEffect(() => {
    let settled = false

    function goToLogin() {
      if (settled) return
      settled = true
      window.location.href = window.location.pathname + '#/login?error=auth_failed'
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
      window.location.hash = '#/dashboard'
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) handleSession(session)
    })

    // Fallback in case the auth event already fired before this listener attached,
    // or the exchange never completes.
    const timeout = setTimeout(async () => {
      if (settled) return
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        handleSession(session)
      } else {
        goToLogin()
      }
    }, 5000)

    return () => { clearTimeout(timeout); subscription.unsubscribe() }
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
