import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'

const TRIAL_DAYS = 7
const TrialCtx   = createContext(null)

export function TrialProvider({ children }) {
  const { user, currentProfile, isSubscriptionActive, refreshSubscription } = useAuth()
  const [status, setStatus] = useState(null) // null = loading

  useEffect(() => {
    if (!user) return
    // Wait for AuthContext to load the subscription columns before computing status
    if (currentProfile === null) return
    let cancelled = false

    async function fetchStatus() {
      const { data: profile } = await supabase
        .from('profiles')
        .select('trial_start')
        .eq('id', user.id)
        .maybeSingle()

      if (cancelled) return

      const subscriptionPlan      = currentProfile?.subscription_plan      ?? null
      const subscriptionFrequency = currentProfile?.subscription_frequency ?? null
      const subscriptionEndDate   = currentProfile?.subscription_end_date  ?? null

      // If the DB still says 'active' but the end date has already passed,
      // correct it to 'expired' now so the webhook didn't miss it.
      const dbStatusActive = currentProfile?.subscription_status === 'active'
      const endDatePassed  = !!subscriptionEndDate && new Date(subscriptionEndDate) <= new Date()
      const isNonLifetime  = subscriptionPlan && subscriptionPlan !== 'lifetime'
      if (dbStatusActive && isNonLifetime && endDatePassed && !cancelled) {
        await supabase
          .from('profiles')
          .update({ subscription_status: 'expired' })
          .eq('id', user.id)
        if (cancelled) return
        await refreshSubscription()
        // refreshSubscription updates currentProfile in AuthContext, which
        // re-triggers this effect — return early so this pass doesn't proceed
        // with a stale currentProfile.
        return
      }

      const subscriptionActive = isSubscriptionActive()

      // A subscription that was once active but has now lapsed (monthly/annual only —
      // lifetime never expires and is handled by isSubscriptionActive() above)
      const subscriptionExpired =
        !subscriptionActive &&
        isNonLifetime &&
        !!subscriptionEndDate &&
        new Date(subscriptionEndDate) <= new Date()

      if (subscriptionActive) {
        setStatus({
          subscriptionActive: true,
          subscriptionExpired: false,
          subscriptionPlan,
          subscriptionFrequency,
          subscriptionEndDate,
          isReadOnly: false,
          daysRemaining: null,
          trialExpired: false,
        })
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

      setStatus({
        subscriptionActive: false,
        subscriptionExpired,
        subscriptionPlan,
        subscriptionFrequency,
        subscriptionEndDate,
        isReadOnly: trialExpired && !subscriptionActive,
        daysRemaining,
        trialExpired,
      })
    }

    fetchStatus()
    return () => { cancelled = true }
  }, [user, currentProfile, isSubscriptionActive])

  return <TrialCtx.Provider value={status}>{children}</TrialCtx.Provider>
}

export function useTrialStatus() {
  return useContext(TrialCtx)
}
