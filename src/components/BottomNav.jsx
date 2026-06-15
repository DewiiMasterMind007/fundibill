import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// ─── SVG icon helpers ─────────────────────────────────────────────────────────

const Icon = ({ children, size = 22, active }) => (
  <svg
    width={size} height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={active ? 2.5 : 2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {children}
  </svg>
)

const DashboardIcon  = ({ active }) => <Icon active={active}><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></Icon>
const InvoicesIcon   = ({ active }) => <Icon active={active}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></Icon>
const EstimatesIcon  = ({ active }) => <Icon active={active}><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></Icon>
const ClientsIcon    = ({ active }) => <Icon active={active}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></Icon>
const ItemsIcon      = ({ active }) => <Icon size={20} active={active}><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></Icon>
const ExpensesIcon   = ({ active }) => <Icon size={20} active={active}><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></Icon>
const SettingsIcon   = ({ active }) => <Icon size={20} active={active}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></Icon>
const TutorialIcon   = ()           => <Icon size={20}><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></Icon>
const SignOutIcon    = ()           => <Icon size={20}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></Icon>
const MoreIcon       = ()           => <Icon size={22}><circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none"/></Icon>

// ─── Tab definitions ──────────────────────────────────────────────────────────

const TABS = [
  { path: '/dashboard', label: 'Dashboard', Icon: DashboardIcon, tutorial: 'nav-dashboard' },
  { path: '/invoices',  label: 'Invoices',  Icon: InvoicesIcon,  tutorial: 'nav-invoices'  },
  { path: '/estimates', label: 'Estimates', Icon: EstimatesIcon, tutorial: 'nav-estimates' },
  { path: '/clients',   label: 'Clients',   Icon: ClientsIcon,   tutorial: 'nav-clients'   },
]

// Routes that live in the More drawer — used to highlight the More button
const MORE_PATHS = ['/items', '/expenses', '/settings']

// ─── BottomNav ────────────────────────────────────────────────────────────────

export default function BottomNav({ onTutorial, primaryColor = '#14b8a6' }) {
  const { signOut } = useAuth()
  const location    = useLocation()
  const [drawerOpen, setDrawerOpen] = useState(false)

  const moreActive = MORE_PATHS.includes(location.pathname)

  function closeDrawerAndNavigate(fn) {
    setDrawerOpen(false)
    // Small delay so the drawer closes before navigation re-renders the page
    setTimeout(fn, 60)
  }

  // ── Shared drawer-item button style ──
  const drawerBtn = (colorOverride) => ({
    display:        'flex',
    alignItems:     'center',
    gap:            14,
    width:          '100%',
    padding:        '13px 16px',
    background:     'none',
    border:         'none',
    borderRadius:   12,
    cursor:         'pointer',
    fontSize:       15,
    fontWeight:     500,
    color:          colorOverride || '#1e293b',
    textAlign:      'left',
    fontFamily:     'inherit',
    transition:     'background 0.12s',
  })

  return (
    <>
      {/* ── Dark overlay ─────────────────────────────────────────────────────── */}
      {drawerOpen && (
        <div
          onClick={() => setDrawerOpen(false)}
          style={{
            position:   'fixed',
            inset:      0,
            background: 'rgba(0,0,0,0.45)',
            zIndex:     200,
            WebkitTapHighlightColor: 'transparent',
          }}
        />
      )}

      {/* ── Slide-up More drawer ─────────────────────────────────────────────── */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="More options"
        style={{
          position:      'fixed',
          bottom:        0,
          left:          0,
          right:         0,
          background:    '#ffffff',
          borderRadius:  '20px 20px 0 0',
          boxShadow:     '0 -4px 32px rgba(0,0,0,0.14)',
          paddingTop:    12,
          // Extra bottom padding = bottom-nav height + device safe area
          paddingBottom: 'calc(72px + env(safe-area-inset-bottom))',
          transform:     drawerOpen ? 'translateY(0)' : 'translateY(100%)',
          transition:    'transform 0.28s cubic-bezier(0.32, 0.72, 0, 1)',
          zIndex:        300,
          userSelect:    'none',
        }}
      >
        {/* Drag handle */}
        <div style={{
          width:        40,
          height:       4,
          background:   '#e2e8f0',
          borderRadius: 2,
          margin:       '0 auto 16px',
        }} />

        {/* Items */}
        <button
          data-tutorial="nav-items"
          style={drawerBtn()}
          onClick={() => closeDrawerAndNavigate(() => window.location.hash = '#/items')}
          onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
        >
          <ItemsIcon />
          Items
        </button>

        {/* Expenses */}
        <button
          style={drawerBtn()}
          onClick={() => closeDrawerAndNavigate(() => window.location.hash = '#/expenses')}
          onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
        >
          <ExpensesIcon />
          Expenses
        </button>

        {/* Settings */}
        <button
          data-tutorial="nav-settings"
          style={drawerBtn()}
          onClick={() => closeDrawerAndNavigate(() => window.location.hash = '#/settings')}
          onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
        >
          <SettingsIcon />
          Settings
        </button>

        {/* Divider */}
        <div style={{ height: 1, background: '#f1f5f9', margin: '8px 16px' }} />

        {/* Tutorial */}
        <button
          style={drawerBtn()}
          onClick={() => closeDrawerAndNavigate(onTutorial)}
          onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
        >
          <TutorialIcon />
          Tutorial
        </button>

        {/* Sign Out */}
        <button
          style={drawerBtn('#ef4444')}
          onClick={() => { setDrawerOpen(false); signOut() }}
          onMouseEnter={e => { e.currentTarget.style.background = '#fef2f2' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
        >
          <SignOutIcon />
          Sign Out
        </button>
      </div>

      {/* ── Bottom tab bar ───────────────────────────────────────────────────── */}
      <nav data-tutorial="primary-nav" style={{
        position:      'fixed',
        bottom:        0,
        left:          0,
        right:         0,
        height:        'calc(64px + env(safe-area-inset-bottom))',
        background:    '#ffffff',
        borderTop:     '1px solid #e2e8f0',
        boxShadow:     '0 -2px 16px rgba(0,0,0,0.07)',
        display:       'flex',
        alignItems:    'flex-start', // align to top so icon+label are centred within 64px
        paddingTop:    0,
        paddingBottom: 'env(safe-area-inset-bottom)',
        zIndex:        100,
        userSelect:    'none',
      }}>

        {/* ── Primary tabs ── */}
        {TABS.map(({ path, label, Icon: TabIcon, tutorial }) => (
          <NavLink
            key={path}
            to={path}
            data-tutorial={tutorial}
            style={({ isActive }) => ({
              flex:            1,
              display:         'flex',
              flexDirection:   'column',
              alignItems:      'center',
              justifyContent:  'center',
              gap:             3,
              height:          64,
              textDecoration:  'none',
              color:           isActive ? primaryColor : '#94a3b8',
              fontSize:        10,
              fontWeight:      isActive ? 600 : 400,
              letterSpacing:   '0.1px',
              WebkitTapHighlightColor: 'transparent',
              transition:      'color 0.15s',
            })}
          >
            {({ isActive }) => (
              <>
                <TabIcon active={isActive} />
                {label}
              </>
            )}
          </NavLink>
        ))}

        {/* ── More tab ── */}
        <button
          data-tutorial="nav-more"
          onClick={() => setDrawerOpen(d => !d)}
          style={{
            flex:            1,
            display:         'flex',
            flexDirection:   'column',
            alignItems:      'center',
            justifyContent:  'center',
            gap:             3,
            height:          64,
            background:      'none',
            border:          'none',
            cursor:          'pointer',
            color:           (drawerOpen || moreActive) ? primaryColor : '#94a3b8',
            fontSize:        10,
            fontWeight:      (drawerOpen || moreActive) ? 600 : 400,
            letterSpacing:   '0.1px',
            fontFamily:      'inherit',
            WebkitTapHighlightColor: 'transparent',
            transition:      'color 0.15s',
            padding:         0,
          }}
        >
          <MoreIcon />
          More
        </button>

      </nav>
    </>
  )
}
