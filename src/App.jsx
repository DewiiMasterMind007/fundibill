import { useState, useEffect } from 'react'
import { HashRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { TrialProvider, useTrialStatus } from './context/TrialContext'
import { RecurringNotifProvider, useRecurringNotif } from './context/RecurringNotifContext'
import { AppDataProvider, useAppData } from './context/AppDataContext'
import { supabase } from './lib/supabase'
import Auth from './pages/Auth'
import Sidebar from './components/Sidebar'
import TrialBanner from './components/TrialBanner'
import Tutorial from './components/Tutorial'
import UpdateNotification from './components/UpdateNotification'
import Dashboard from './pages/Dashboard'
import Invoices from './pages/Invoices'
import Estimates from './pages/Estimates'
import Clients from './pages/Clients'
import Items from './pages/Items'
import Expenses from './pages/Expenses'
import Settings from './pages/Settings'

// ─── Recurring notification banners ──────────────────────────────────────────
// Must live inside <HashRouter> so useNavigate is available.

function RecurringBanners() {
  const { notifications, dismissNotification } = useRecurringNotif()
  const navigate = useNavigate()

  if (!notifications.length) return null

  return (
    <div style={{ flexShrink: 0 }}>
      {notifications.map(notif => (
        <div
          key={notif.id}
          role="alert"
          style={{
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'space-between',
            gap:            12,
            padding:        '10px 20px',
            background:     '#fefce8',
            borderBottom:   '1px solid #fde68a',
            boxShadow:      '0 1px 4px rgba(0,0,0,0.06)',
            fontSize:       13,
            color:          '#78350f',
            flexShrink:     0,
          }}
        >
          {/* ── Clickable message — navigates to the invoice, does NOT dismiss ── */}
          <span
            onClick={() => navigate('/invoices', { state: { openId: notif.id } })}
            style={{
              cursor:      'pointer',
              display:     'flex',
              alignItems:  'center',
              gap:         8,
              flex:        1,
              userSelect:  'none',
            }}
          >
            <span style={{ fontSize: 16, flexShrink: 0 }}>📄</span>
            <span style={{ lineHeight: 1.45 }}>
              Recurring invoice{' '}
              <strong style={{ fontWeight: 700 }}>{notif.invoice_number}</strong>
              {' '}for{' '}
              <strong style={{ fontWeight: 700 }}>{notif.client_name}</strong>
              {' '}was automatically created.{' '}
              <span style={{
                textDecoration:      'underline',
                textDecorationStyle: 'dotted',
                opacity:             0.75,
              }}>
                Click here to view, edit or send it.
              </span>
            </span>
          </span>

          {/* ── X button — dismisses the banner and updates Supabase ── */}
          <button
            onClick={() => dismissNotification(notif.id)}
            title="Dismiss"
            style={{
              background:  'none',
              border:      'none',
              cursor:      'pointer',
              color:       '#92400e',
              fontSize:    20,
              lineHeight:  1,
              padding:     '0 4px',
              flexShrink:  0,
              opacity:     0.6,
              fontWeight:  400,
            }}
            onMouseEnter={e => { e.currentTarget.style.opacity = '1' }}
            onMouseLeave={e => { e.currentTarget.style.opacity = '0.6' }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function App() {
  const { user, loading: authLoading } = useAuth()

  if (authLoading) return null
  if (!user) return <Auth />

  return (
    <TrialProvider>
      <AppDataProvider>
        <RecurringNotifProvider>
          <AuthenticatedApp />
        </RecurringNotifProvider>
      </AppDataProvider>
    </TrialProvider>
  )
}

// ─── Authenticated shell ──────────────────────────────────────────────────────

function AuthenticatedApp() {
  const { user }                       = useAuth()
  const { primaryColor, accentColor }  = useAppData()
  const trialStatus = useTrialStatus()
  const showBanner  = trialStatus !== null && !trialStatus.isLicensed

  // ── Tutorial state ─────────────────────────────────────────────────────────
  const [tutorialOpen, setTutorialOpen] = useState(false)
  // Increment key each time tutorial starts to force a full remount (step reset)
  const [tutorialKey,  setTutorialKey]  = useState(0)

  // Auto-start for first-time users: check tutorial_completed on mount
  useEffect(() => {
    if (!user) return
    let cancelled = false

    async function checkFirstRun() {
      const { data: profile } = await supabase
        .from('profiles')
        .select('tutorial_completed')
        .eq('id', user.id)
        .maybeSingle()

      if (cancelled) return

      if (!profile?.tutorial_completed) {
        // New user — auto-start after a 2-second delay
        const timer = setTimeout(() => {
          if (cancelled) return
          setTutorialKey(k => k + 1)
          setTutorialOpen(true)
        }, 2000)
        return () => clearTimeout(timer)
      }
    }

    checkFirstRun()
    return () => { cancelled = true }
  }, [user])

  // Called by the Sidebar Tutorial button — always starts from step 1
  function handleOpenTutorial() {
    setTutorialKey(k => k + 1)
    setTutorialOpen(true)
  }

  // Called when user finishes or skips — marks tutorial as completed
  async function handleCloseTutorial() {
    setTutorialOpen(false)
    if (user) {
      await supabase
        .from('profiles')
        .upsert({ id: user.id, tutorial_completed: true }, { onConflict: 'id' })
    }
  }

  return (
    <HashRouter>
      {/* Inject the user's chosen primary colour as a CSS custom property so
          all themed UI elements pick it up via var(--primary). */}
      <style>{`:root { --primary: ${primaryColor}; --accent: ${accentColor}; }`}</style>

      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>

        {/* Auto-update notification banner */}
        <UpdateNotification />

        {/* Trial expiry / upgrade banner */}
        {showBanner && (
          <TrialBanner
            daysRemaining={trialStatus.daysRemaining}
            trialExpired={trialStatus.trialExpired}
          />
        )}

        {/* Recurring-invoice notification banners (zero height when none pending) */}
        <RecurringBanners />

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <Sidebar onTutorial={handleOpenTutorial} primaryColor={primaryColor} />
          <main style={{
            flex:          1,
            overflow:      'auto',
            background:    '#f8fafc',
            display:       'flex',
            flexDirection: 'column',
          }}>
            <Routes>
              <Route path="/"          element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/invoices"  element={<Invoices />} />
              <Route path="/estimates" element={<Estimates />} />
              <Route path="/clients"   element={<Clients />} />
              <Route path="/items"     element={<Items />} />
              <Route path="/expenses"  element={<Expenses />} />
              <Route path="/settings"  element={<Settings />} />
            </Routes>
          </main>
        </div>

        {/* Tutorial overlay — conditionally rendered; key forces remount on each start */}
        {tutorialOpen && (
          <Tutorial key={tutorialKey} onClose={handleCloseTutorial} />
        )}

      </div>
    </HashRouter>
  )
}
