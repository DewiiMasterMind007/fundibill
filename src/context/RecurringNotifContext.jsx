/**
 * src/context/RecurringNotifContext.jsx
 *
 * Fetches invoices that were auto-created by the recurring-invoice system
 * and have not yet been dismissed by the user.
 *
 * Shape of each notification: { id, invoice_number, client_name }
 *
 * Queried columns from `invoices`:
 *   from_recurring          boolean — set by the scheduling backend
 *   notification_dismissed  boolean — set here when user dismisses
 *   status                  text    — only 'draft' ones are actionable
 */

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'

const RecurringNotifCtx = createContext({
  notifications:       [],
  dismissNotification: async () => {},
  refresh:             async () => {},
})

export function RecurringNotifProvider({ children }) {
  const { user } = useAuth()
  const [notifications, setNotifications] = useState([])

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const refresh = useCallback(async () => {
    if (!user) { setNotifications([]); return }

    // 1. Invoices that need a notification banner
    // status is 'draft' OR 'sent' (not just 'draft') so an auto-sent recurring
    // invoice (auto_send on the template — see Section 6) still gets a banner,
    // even though its status skips past 'draft' the moment it's auto-sent.
    const { data: invData } = await supabase
      .from('invoices')
      .select('id, invoice_number, client_id')
      .eq('user_id',              user.id)
      .eq('from_recurring',       true)
      .eq('notification_dismissed', false)
      .in('status',               ['draft', 'sent'])
      .order('created_at', { ascending: false })

    if (!invData?.length) { setNotifications([]); return }

    // 2. Resolve client names in a single query
    const clientIds = [...new Set(invData.map(i => i.client_id).filter(Boolean))]
    const clientMap = {}
    if (clientIds.length) {
      const { data: cliData } = await supabase
        .from('clients')
        .select('id, name, company_name')
        .in('id', clientIds)
      for (const c of (cliData ?? [])) clientMap[c.id] = c
    }

    setNotifications(
      invData.map(inv => ({
        id:             inv.id,
        invoice_number: inv.invoice_number,
        client_name:    clientMap[inv.client_id]?.company_name
                     || clientMap[inv.client_id]?.name
                     || '—',
      }))
    )
  }, [user])

  // Refresh once on login (user change triggers this)
  useEffect(() => { refresh() }, [refresh])

  // ── Dismiss ────────────────────────────────────────────────────────────────

  const dismissNotification = useCallback(async (invoiceId) => {
    // Optimistic: remove from UI immediately
    setNotifications(prev => prev.filter(n => n.id !== invoiceId))
    // Persist: mark as dismissed in Supabase
    if (user) {
      await supabase
        .from('invoices')
        .update({ notification_dismissed: true })
        .eq('id', invoiceId)
        .eq('user_id', user.id)
    }
  }, [user])

  return (
    <RecurringNotifCtx.Provider value={{ notifications, dismissNotification, refresh }}>
      {children}
    </RecurringNotifCtx.Provider>
  )
}

export function useRecurringNotif() {
  return useContext(RecurringNotifCtx)
}
