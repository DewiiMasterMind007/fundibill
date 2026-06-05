import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'

const TRIAL_DAYS = 7
const TrialCtx   = createContext(null)

export function TrialProvider({ children }) {
  const { user }    = useAuth()
  const [status, setStatus] = useState(null) // null = loading

  useEffect(() => {
    if (!user) return
    let cancelled = false

    async function fetchStatus() {
      const { data: profile } = await supabase
        .from('profiles')
        .select('trial_start, is_licensed')
        .eq('id', user.id)
        .maybeSingle()

      if (cancelled) return

      if (profile?.is_licensed === true) {
        setStatus({ isLicensed: true, isReadOnly: false, daysRemaining: null, trialExpired: false })
        return
      }

      let trialStart = profile?.trial_start
      if (!trialStart) {
        const now = new Date().toISOString()
        await supabase
          .from('profiles')
          .upsert({ id: user.id, trial_start: now }, { onConflict: 'id' })
        if (cancelled) return
        trialStart = now
      }

      const elapsed       = Date.now() - new Date(trialStart).getTime()
      const elapsedDays   = Math.floor(elapsed / 86_400_000)
      const daysRemaining = Math.max(0, TRIAL_DAYS - elapsedDays)
      const trialExpired  = elapsedDays >= TRIAL_DAYS

      setStatus({ isLicensed: false, isReadOnly: trialExpired, daysRemaining, trialExpired })
    }

    fetchStatus()
    return () => { cancelled = true }
  }, [user])

  return <TrialCtx.Provider value={status}>{children}</TrialCtx.Provider>
}

export function useTrialStatus() {
  return useContext(TrialCtx)
}
