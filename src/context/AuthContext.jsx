import { createContext, useContext, useEffect, useState } from 'react'
import { getSession, onAuthStateChange, signIn, signOut, signUp } from '../lib/auth'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null)
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Hydrate from the existing session on mount
    getSession().then(({ data }) => {
      setSession(data.session)
      setUser(data.session?.user ?? null)
      setLoading(false)
    })

    // Keep state in sync with Supabase auth events (login, logout, token refresh).
    // Compare user IDs so a mere token refresh does NOT produce a new `user` object
    // reference — which would re-trigger every useCallback/useEffect that depends on
    // `user` and cause every page to reload its data unnecessarily.
    const { data: { subscription } } = onAuthStateChange((_event, session) => {
      const incoming = session?.user ?? null
      setSession(session)
      setUser(prev => {
        if (prev?.id && prev.id === incoming?.id) return prev   // same user — keep ref stable
        return incoming
      })
    })

    return () => subscription.unsubscribe()
  }, [])

  const value = {
    user,
    session,
    loading,
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
