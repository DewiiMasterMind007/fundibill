import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { getSession, onAuthStateChange, signIn, signOut, signUp } from '../lib/auth'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

// Profile columns needed to determine subscription/license status
const SUBSCRIPTION_COLUMNS =
  'is_licensed, subscription_status, subscription_end_date, subscription_plan, subscription_frequency'

export function AuthProvider({ children }) {
  const [user,           setUser]           = useState(null)
  const [session,        setSession]        = useState(null)
  const [loading,        setLoading]        = useState(true)
  const [currentProfile, setCurrentProfile] = useState(null)
  const [recoveryMode,   setRecoveryMode]   = useState(false)

  useEffect(() => {
    // Synchronously check for a password-recovery token in the URL hash BEFORE
    // we hydrate the session. Supabase auto-processes this hash on client init
    // which would log the user straight into the app — we intercept it here.
    const hashParams  = new URLSearchParams(window.location.hash.substring(1))
    const isRecovery  = hashParams.get('type') === 'recovery' && !!hashParams.get('access_token')

    if (isRecovery) {
      setRecoveryMode(true)
      setLoading(false)
      // Do NOT clear the hash here — Supabase's detectSessionInUrl reads it
      // asynchronously. Clearing it now prevents Supabase from establishing
      // the session, which causes updateUser() to fail with "Auth session missing!".
      // The hash is cleared inside the PASSWORD_RECOVERY handler below, after
      // Supabase has read it and the session is active.
    } else {
      // Normal path: hydrate from the existing session
      getSession().then(({ data }) => {
        setSession(data.session)
        setUser(data.session?.user ?? null)
        setLoading(false)
      })
    }

    // Keep state in sync with Supabase auth events (login, logout, token refresh).
    // Compare user IDs so a mere token refresh does NOT produce a new `user` object
    // reference — which would re-trigger every useCallback/useEffect that depends on
    // `user` and cause every page to reload its data unnecessarily.
    const { data: { subscription } } = onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        // Supabase has now read the hash and established the session internally.
        // Clear the token from the address bar and show the reset-password screen.
        window.history.replaceState(null, null, window.location.pathname)
        setRecoveryMode(true)
        setLoading(false)
        return
      }
      const incoming = session?.user ?? null
      setSession(session)
      setUser(prev => {
        if (prev?.id && prev.id === incoming?.id) return prev   // same user — keep ref stable
        return incoming
      })
    })

    return () => subscription.unsubscribe()
  }, [])

  // ── Subscription/license profile fields ────────────────────────────────────
  // Fetched separately (and kept minimal) so AuthContext can determine access
  // without depending on AppDataContext's full profile load.
  const fetchProfile = useCallback(async (uid) => {
    if (!uid) { setCurrentProfile(null); return }
    const { data } = await supabase
      .from('profiles')
      .select(SUBSCRIPTION_COLUMNS)
      .eq('id', uid)
      .maybeSingle()
    setCurrentProfile(data ?? null)
  }, [])

  useEffect(() => {
    fetchProfile(user?.id)
  }, [user, fetchProfile])

  const refreshSubscription = useCallback(() => fetchProfile(user?.id), [user, fetchProfile])

  // ── Subscription status helper ──────────────────────────────────────────────
  const isSubscriptionActive = useCallback(() => {
    const profile = currentProfile
    if (!profile) return false

    // Lifetime license
    if (profile.subscription_plan === 'lifetime') return true

    // Active or cancelled-but-not-yet-expired subscription
    // (cancelled users keep access until subscription_end_date)
    if (['active', 'cancelled'].includes(profile.subscription_status) &&
        profile.subscription_end_date) {
      return new Date(profile.subscription_end_date) > new Date()
    }

    // Legacy is_licensed: only honoured when no subscription record exists
    // (one-time licence holders from before the subscription system)
    if (profile.is_licensed === true && !profile.subscription_status) return true

    return false
  }, [currentProfile])

  const value = {
    user,
    session,
    loading,
    currentProfile,
    refreshSubscription,
    isSubscriptionActive,
    recoveryMode,
    clearRecoveryMode: () => setRecoveryMode(false),
    signIn:  (email, password) => signIn(email, password),
    signUp:  (email, password) => signUp(email, password),
    signOut: ()                => signOut(),
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
