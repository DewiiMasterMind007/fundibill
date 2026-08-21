import { useState, useEffect } from 'react'
import { HashRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { TrialProvider, useTrialStatus } from './context/TrialContext'
import { RecurringNotifProvider, useRecurringNotif } from './context/RecurringNotifContext'
import { AppDataProvider, useAppData } from './context/AppDataContext'
import { supabase } from './lib/supabase'
import useIsMobile from './hooks/useIsMobile'
import Auth from './pages/Auth'
import AuthCallback from './components/AuthCallback'
import Sidebar from './components/Sidebar'
import BottomNav from './components/BottomNav'
import MobileHeader from './components/MobileHeader'
import TrialBanner from './components/TrialBanner'
import Tutorial from './components/Tutorial'
import SettingsWizard from './components/SettingsWizard'
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

// ─── Settings wizard prompt ───────────────────────────────────────────────────

function SettingsWizardPrompt({ onYes, onNo }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
      zIndex: 9500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{
        background: '#fff', borderRadius: 14, padding: '28px 26px 22px',
        maxWidth: 380, width: '100%',
        boxShadow: '0 24px 64px rgba(0,0,0,0.25)',
        fontFamily: 'inherit', textAlign: 'center',
      }}>
        <h3 style={{ margin: '0 0 10px', fontSize: 18, fontWeight: 700, color: '#0f172a' }}>
          Need help with your business settings?
        </h3>
        <p style={{ margin: '0 0 22px', fontSize: 14, color: '#475569', lineHeight: 1.6 }}>
          We can walk you through setting up your profile, branding, banking details and more — step by step.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button
            onClick={onNo}
            style={{
              padding: '9px 18px', borderRadius: 8,
              border: '1px solid #e2e8f0', background: '#fff',
              color: '#475569', fontSize: 13, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            No thanks
          </button>
          <button
            onClick={onYes}
            style={{
              padding: '9px 18px', borderRadius: 8, border: 'none',
              background: '#14b8a6', color: '#fff',
              fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Yes, let's do it
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function App() {
  const { user, loading: authLoading } = useAuth()

  // Google OAuth redirects here before a HashRouter exists (it only mounts once
  // authenticated), so this is handled as a standalone screen ahead of the
  // normal auth gate rather than as a react-router <Route>. Checked by
  // pathname, not hash — the redirect target is a plain "/auth/callback" path
  // (see GoogleAuthButton.jsx for why: Supabase appends "#access_token=..."
  // here for the implicit flow, and a redirect target that already had its
  // own "#" produced an unparseable double-hash URL).
  if (window.location.pathname.replace(/\/$/, '') === '/auth/callback') return <AuthCallback />

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
  const showBanner  = trialStatus !== null && !trialStatus.subscriptionActive
  const isMobile    = useIsMobile()

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

  // Called by the Sidebar / BottomNav Tutorial button — always starts from step 1
  function handleOpenTutorial() {
    setTutorialKey(k => k + 1)
    setTutorialOpen(true)
  }

  // ── Settings setup wizard state ─────────────────────────────────────────────
  const [wizardPromptOpen, setWizardPromptOpen] = useState(false)
  const [wizardOpen,       setWizardOpen]       = useState(false)
  const [wizardKey,        setWizardKey]        = useState(0)
  const [wizardStartStep,  setWizardStartStep]  = useState(0)

  // Called when user finishes or skips the main tour — marks it completed,
  // then offers the settings setup wizard unless it's already been finished.
  async function handleCloseTutorial() {
    setTutorialOpen(false)
    if (user) {
      await supabase
        .from('profiles')
        .upsert({ id: user.id, tutorial_completed: true }, { onConflict: 'id' })

      const { data: profile } = await supabase
        .from('profiles')
        .select('settings_wizard_completed, settings_wizard_step')
        .eq('id', user.id)
        .maybeSingle()

      if (!profile?.settings_wizard_completed) {
        setWizardStartStep(profile?.settings_wizard_step || 0)
        setWizardPromptOpen(true)
      }
    }
  }

  function handleAcceptWizard() {
    setWizardPromptOpen(false)
    setWizardKey(k => k + 1)
    setWizardOpen(true)
  }

  function handleDeclineWizard() {
    setWizardPromptOpen(false)
  }

  function handleCloseWizard() {
    setWizardOpen(false)
  }

  // Manual trigger — the 🪄 button on the Settings page. Always restarts from
  // step 1, matching how the Tutorial button always restarts the main tour.
  useEffect(() => {
    function onOpenWizard() {
      setWizardStartStep(0)
      setWizardKey(k => k + 1)
      setWizardOpen(true)
    }
    window.addEventListener('fundibill:open-settings-wizard', onOpenWizard)
    return () => window.removeEventListener('fundibill:open-settings-wizard', onOpenWizard)
  }, [])

  // ── Shared route tree (identical on both layouts) ──────────────────────────
  const appRoutes = (
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
  )

  return (
    <HashRouter>
      {/* Inject the user's chosen primary colour as a CSS custom property so
          all themed UI elements pick it up via var(--primary). */}
      <style>{`:root { --primary: ${primaryColor}; --accent: ${accentColor}; }`}</style>

      {isMobile ? (
        // ── Mobile layout ───────────────────────────────────────────────────
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>

          {/* Sticky top header */}
          <MobileHeader />

          {/* Auto-update notification */}
          <UpdateNotification />

          {/* Trial expiry / upgrade banner */}
          {showBanner && (
            <TrialBanner
              daysRemaining={trialStatus.daysRemaining}
              trialExpired={trialStatus.trialExpired}
              subscriptionExpired={trialStatus.subscriptionExpired}
              subscriptionEndDate={trialStatus.subscriptionEndDate}
            />
          )}

          {/* Recurring-invoice notification banners */}
          <RecurringBanners />

          {/* Scrollable page area — padded so content clears the fixed bottom nav */}
          <main style={{
            flex:          1,
            overflowY:     'auto',
            overflowX:     'hidden',   /* prevent any child from causing horizontal page scroll */
            width:         '100%',
            maxWidth:      '100%',
            background:    '#f8fafc',
            display:       'flex',
            flexDirection: 'column',
            paddingBottom: 'calc(64px + env(safe-area-inset-bottom))',
          }}>
            {appRoutes}
          </main>

          {/* Fixed bottom tab bar + slide-up drawer */}
          <BottomNav onTutorial={handleOpenTutorial} primaryColor={primaryColor} />
        </div>

      ) : (
        // ── Desktop layout (unchanged) ──────────────────────────────────────
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>

          {/* Auto-update notification banner */}
          <UpdateNotification />

          {/* Trial expiry / upgrade banner */}
          {showBanner && (
            <TrialBanner
              daysRemaining={trialStatus.daysRemaining}
              trialExpired={trialStatus.trialExpired}
              subscriptionExpired={trialStatus.subscriptionExpired}
              subscriptionEndDate={trialStatus.subscriptionEndDate}
            />
          )}

          {/* Recurring-invoice notification banners (zero height when none pending) */}
          <RecurringBanners />

          <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
            {/* className="sidebar" lets the CSS media-query hide it as a fallback */}
            <div className="sidebar">
              <Sidebar onTutorial={handleOpenTutorial} primaryColor={primaryColor} />
            </div>
            <main style={{
              flex:          1,
              overflowY:     'auto',
              overflowX:     'hidden',
              background:    '#f8fafc',
              display:       'flex',
              flexDirection: 'column',
              paddingBottom: 40,
            }}>
              {appRoutes}
            </main>
          </div>

        </div>
      )}

      {/* Tutorial overlay — conditionally rendered; key forces remount on each start */}
      {tutorialOpen && (
        <Tutorial key={tutorialKey} onClose={handleCloseTutorial} />
      )}

      {/* Settings setup wizard prompt — shown after the main tour closes */}
      {wizardPromptOpen && (
        <SettingsWizardPrompt onYes={handleAcceptWizard} onNo={handleDeclineWizard} />
      )}

      {/* Settings setup wizard — walks the user through each Settings section */}
      {wizardOpen && (
        <SettingsWizard
          key={wizardKey}
          userId={user?.id}
          startStep={wizardStartStep}
          onClose={handleCloseWizard}
        />
      )}

    </HashRouter>
  )
}
