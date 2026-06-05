/**
 * src/context/AppDataContext.jsx
 *
 * Global data cache — loads profile, clients and catalog once when the user
 * logs in and keeps them in memory.  Individual pages call the refresh*()
 * helpers only after a write so the rest of the app stays in sync without
 * making redundant network requests.
 *
 * primaryColor / accentColor are derived from the profile and used by the
 * Sidebar and other UI components so the user's brand colour applies
 * throughout the app, not just on PDFs.
 */

import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'

const AppDataCtx = createContext(null)

export function AppDataProvider({ children }) {
  const { user } = useAuth()

  const [profile,  setProfile]  = useState(null)
  const [clients,  setClients]  = useState([])
  const [catalog,  setCatalog]  = useState([])   // items / product catalog
  const [loaded,   setLoaded]   = useState(false)

  // ── Derived colours (fallback to default teal if user hasn't customised) ──
  const primaryColor = profile?.primary_color || '#14b8a6'
  const accentColor  = profile?.accent_color  || '#0f172a'

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) {
      // User signed out — clear everything so the next login gets a fresh load
      setProfile(null)
      setClients([])
      setCatalog([])
      setLoaded(false)
      return
    }

    if (loaded) return  // already loaded for this session — don't reload

    let cancelled = false
    async function init() {
      const [{ data: prof }, { data: cli }, { data: cat }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id',      user.id).maybeSingle(),
        supabase.from('clients') .select('*').eq('user_id', user.id).order('company_name'),
        supabase.from('items')   .select('*').eq('user_id', user.id).order('name'),
      ])
      if (cancelled) return
      setProfile(prof  ?? null)
      setClients(cli   ?? [])
      setCatalog(cat   ?? [])
      setLoaded(true)
    }
    init()
    return () => { cancelled = true }
  }, [user, loaded])

  // ── Targeted refresh helpers — called after writes ─────────────────────────

  const refreshProfile = useCallback(async () => {
    if (!user) return
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
    setProfile(data ?? null)
  }, [user])

  const refreshClients = useCallback(async () => {
    if (!user) return
    const { data } = await supabase.from('clients').select('*').eq('user_id', user.id).order('company_name')
    setClients(data ?? [])
  }, [user])

  const refreshCatalog = useCallback(async () => {
    if (!user) return
    const { data } = await supabase.from('items').select('*').eq('user_id', user.id).order('name')
    setCatalog(data ?? [])
  }, [user])

  return (
    <AppDataCtx.Provider value={{
      // Data
      profile,  setProfile,
      clients,  setClients,
      catalog,  setCatalog,
      loaded,
      // Colours for UI theming
      primaryColor,
      accentColor,
      // Refresh helpers
      refreshProfile,
      refreshClients,
      refreshCatalog,
    }}>
      {children}
    </AppDataCtx.Provider>
  )
}

export function useAppData() {
  const ctx = useContext(AppDataCtx)
  if (!ctx) throw new Error('useAppData must be used inside AppDataProvider')
  return ctx
}
