import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import fundibillLogo from '../../public/FundiBill long.png'

// ─── Nav items ────────────────────────────────────────────────────────────────

const navItems = [
  {
    path: '/dashboard',
    label: 'Dashboard',
    tutorial: 'nav-dashboard',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
      </svg>
    ),
  },
  {
    path: '/invoices',
    label: 'Invoices',
    tutorial: 'nav-invoices',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
  },
  {
    path: '/estimates',
    label: 'Estimates',
    tutorial: 'nav-estimates',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    ),
  },
  {
    path: '/clients',
    label: 'Clients',
    tutorial: 'nav-clients',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    path: '/items',
    label: 'Items',
    tutorial: 'nav-items',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="8" y1="6" x2="21" y2="6" />
        <line x1="8" y1="12" x2="21" y2="12" />
        <line x1="8" y1="18" x2="21" y2="18" />
        <line x1="3" y1="6" x2="3.01" y2="6" />
        <line x1="3" y1="12" x2="3.01" y2="12" />
        <line x1="3" y1="18" x2="3.01" y2="18" />
      </svg>
    ),
  },
  {
    path: '/expenses',
    label: 'Expenses',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <line x1="2" y1="10" x2="22" y2="10" />
      </svg>
    ),
  },
  {
    path: '/settings',
    label: 'Settings',
    tutorial: 'nav-settings',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
]

// ─── Liquid-glass token sets ──────────────────────────────────────────────────

// Active pill — iOS 26 "liquid glass" effect
const GLASS_ACTIVE = {
  background:           'rgba(255,255,255,0.22)',
  backdropFilter:       'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border:               '1px solid rgba(255,255,255,0.40)',
  boxShadow:            '0 4px 20px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.50)',
}

// Hover pill — lighter glass
const GLASS_HOVER = {
  background:           'rgba(255,255,255,0.11)',
  backdropFilter:       'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  border:               '1px solid rgba(255,255,255,0.20)',
  boxShadow:            'none',
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

export default function Sidebar({ onTutorial, primaryColor = '#14b8a6' }) {
  const { signOut, user } = useAuth()

  // Track hover with React state so we never write/reset inline styles
  // (avoids the momentary colour flash on re-click)
  const [hovered,         setHovered]         = useState(null)
  const [tutorialHovered, setTutorialHovered] = useState(false)
  const [signOutHovered,  setSignOutHovered]  = useState(false)

  // Base link layout (no colours — those are computed per-render)
  const linkBase = {
    display:        'flex',
    alignItems:     'center',
    gap:            12,
    padding:        '10px 14px',
    borderRadius:   11,
    textDecoration: 'none',
    fontSize:       14,
    transition:     'background 0.18s, box-shadow 0.18s, border-color 0.18s',
  }

  return (
    <aside
      data-tutorial="sidebar"
      style={{
        width:      240,
        minWidth:   240,
        height:     '100vh',
        // Blue → teal → green gradient matching the FA logo palette
        background: 'linear-gradient(165deg, #0891b2 0%, #0d9488 48%, #16a34a 100%)',
        display:        'flex',
        flexDirection:  'column',
        userSelect:     'none',
        position:       'relative',
        overflow:       'hidden',
      }}
    >
      {/* ── Top-light shimmer — gives the glass panel its floating quality ── */}
      <div
        aria-hidden="true"
        style={{
          position:      'absolute',
          top: 0, left: 0, right: 0,
          height:        '52%',
          background:    'linear-gradient(to bottom, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0) 100%)',
          pointerEvents: 'none',
          zIndex:        0,
        }}
      />

      {/* ── All content above the shimmer ── */}
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>

        {/* ── Logo / brand ── */}
        <div style={{ padding: '24px 20px 20px', borderBottom: '1px solid rgba(255,255,255,0.15)' }}>
          {/* Wide wordmark — contains the brand name, no extra text needed */}
          <img
            src={fundibillLogo}
            alt="FundiBill"
            style={{
              width:     '100%',
              maxWidth:  168,
              height:    'auto',
              display:   'block',
            }}
          />
        </div>

        {/* ── Navigation ── */}
        <nav style={{ flex: 1, padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: 3 }}>

          {navItems.map(({ path, label, icon, tutorial }) => (
            <NavLink
              key={path}
              to={path}
              data-tutorial={tutorial}
              onMouseEnter={() => setHovered(path)}
              onMouseLeave={() => setHovered(null)}
              style={({ isActive }) => ({
                ...linkBase,
                color:      '#ffffff',
                fontWeight: isActive ? 600 : 500,
                textShadow: '0 1px 4px rgba(0,0,0,0.18)',
                // Choose glass level: active > hover > none
                ...(isActive
                  ? GLASS_ACTIVE
                  : hovered === path
                    ? GLASS_HOVER
                    : { background: 'transparent', border: '1px solid transparent', boxShadow: 'none' }),
              })}
            >
              {icon}
              {label}
            </NavLink>
          ))}

          {/* ── Tutorial button ── */}
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.15)' }}>
            <button
              onClick={onTutorial}
              onMouseEnter={() => setTutorialHovered(true)}
              onMouseLeave={() => setTutorialHovered(false)}
              style={{
                ...linkBase,
                width:      '100%',
                cursor:     'pointer',
                color:      tutorialHovered ? '#ffffff' : 'rgba(255,255,255,0.60)',
                fontWeight: 500,
                fontSize:   13,
                textAlign:  'left',
                background:    tutorialHovered ? 'rgba(255,255,255,0.11)' : 'transparent',
                border:        `1px solid ${tutorialHovered ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.20)'}`,
                boxShadow:     'none',
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              Tutorial
            </button>
          </div>
        </nav>

        {/* ── Bottom: email · sign-out · version ── */}
        <div style={{ padding: '12px 10px', borderTop: '1px solid rgba(255,255,255,0.15)' }}>

          {user?.email && (
            <div style={{
              padding:      '4px 14px 10px',
              fontSize:     11,
              color:        'rgba(255,255,255,0.45)',
              overflow:     'hidden',
              textOverflow: 'ellipsis',
              whiteSpace:   'nowrap',
            }}>
              {user.email}
            </div>
          )}

          <button
            onClick={() => signOut()}
            onMouseEnter={() => setSignOutHovered(true)}
            onMouseLeave={() => setSignOutHovered(false)}
            style={{
              ...linkBase,
              width:      '100%',
              cursor:     'pointer',
              color:      signOutHovered ? '#fca5a5' : 'rgba(255,255,255,0.60)',
              fontWeight: 500,
              fontSize:   14,
              textAlign:  'left',
              background:    signOutHovered ? 'rgba(239,68,68,0.22)' : 'transparent',
              border:        `1px solid ${signOutHovered ? 'rgba(239,68,68,0.38)' : 'transparent'}`,
              boxShadow:     'none',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            Sign Out
          </button>

          <div style={{ padding: '6px 14px 0', fontSize: 11, color: 'rgba(255,255,255,0.30)' }}>
            v1.0.0
          </div>
        </div>

      </div>
    </aside>
  )
}
