import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAppData } from '../context/AppDataContext'
import fundibillLogo from '../../public/FundiBill long.png'

const PAGE_NAMES = {
  '/dashboard':  'Dashboard',
  '/invoices':   'Invoices',
  '/estimates':  'Estimates',
  '/clients':    'Clients',
  '/items':      'Items',
  '/expenses':   'Expenses',
  '/settings':   'Settings',
}

const QUICK_CREATE = [
  { label: 'Invoice',  path: '/invoices',  icon: '🧾' },
  { label: 'Quote',    path: '/estimates', icon: '📋' },
  { label: 'Client',   path: '/clients',   icon: '👤' },
  { label: 'Expense',  path: '/expenses',  icon: '💸' },
]

export default function MobileHeader() {
  const { profile }           = useAppData()
  const location              = useLocation()
  const navigate              = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  const pageName     = PAGE_NAMES[location.pathname] || null
  const businessName = profile?.business_name || 'FundiBill'
  const initial      = businessName.charAt(0).toUpperCase()
  const logoUrl      = profile?.logo_url || null

  function handleCreate(path) {
    setMenuOpen(false)
    navigate(path, { state: { quickCreate: true } })
  }

  return (
    <>
      {/* ── Quick-create backdrop ── */}
      {menuOpen && (
        <div
          onClick={() => setMenuOpen(false)}
          style={{
            position:   'fixed',
            inset:      0,
            background: 'rgba(0,0,0,0.45)',
            zIndex:     200,
            WebkitTapHighlightColor: 'transparent',
          }}
        />
      )}

      {/* ── Quick-create bottom sheet ── */}
      <div style={{
        position:      'fixed',
        bottom:        0,
        left:          0,
        right:         0,
        background:    '#ffffff',
        borderRadius:  '20px 20px 0 0',
        boxShadow:     '0 -4px 32px rgba(0,0,0,0.14)',
        paddingTop:    12,
        paddingBottom: 'calc(80px + env(safe-area-inset-bottom))',
        transform:     menuOpen ? 'translateY(0)' : 'translateY(100%)',
        transition:    'transform 0.28s cubic-bezier(0.32, 0.72, 0, 1)',
        zIndex:        300,
        userSelect:    'none',
      }}>
        {/* Drag handle */}
        <div style={{ width: 40, height: 4, background: '#e2e8f0', borderRadius: 2, margin: '0 auto 14px' }} />

        <div style={{ padding: '0 16px 10px', fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Quick Create
        </div>

        {QUICK_CREATE.map(({ label, path, icon }) => (
          <button
            key={path}
            onClick={() => handleCreate(path)}
            onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
            style={{
              display:     'flex',
              alignItems:  'center',
              gap:         14,
              width:       '100%',
              padding:     '13px 20px',
              background:  'none',
              border:      'none',
              borderRadius: 12,
              cursor:      'pointer',
              fontSize:    15,
              fontWeight:  500,
              color:       '#1e293b',
              textAlign:   'left',
              fontFamily:  'inherit',
              transition:  'background 0.12s',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <span style={{ fontSize: 22, lineHeight: 1 }}>{icon}</span>
            {label}
          </button>
        ))}
      </div>

      {/* ── Sticky top header ── */}
      <header style={{
        height:         56,
        flexShrink:     0,
        background:     'linear-gradient(165deg, #0891b2 0%, #0d9488 48%, #16a34a 100%)',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        padding:        '0 16px',
        position:       'relative',
        zIndex:         30,
        userSelect:     'none',
      }}>
        {/* ── Top-light shimmer ── */}
        <div aria-hidden="true" style={{
          position:      'absolute',
          inset:         0,
          background:    'linear-gradient(to bottom, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0) 100%)',
          pointerEvents: 'none',
        }} />

        {/* ── Left: page title or FundiBill wordmark ── */}
        <div style={{ position: 'relative', zIndex: 1 }}>
          {pageName ? (
            <span style={{
              fontSize:      19,
              fontWeight:    700,
              color:         '#ffffff',
              letterSpacing: '-0.3px',
              textShadow:    '0 1px 4px rgba(0,0,0,0.18)',
            }}>
              {pageName}
            </span>
          ) : (
            <img
              src={fundibillLogo}
              alt="FundiBill"
              style={{ height: 26, width: 'auto' }}
            />
          )}
        </div>

        {/* ── Right: Create+ button + logo/avatar ── */}
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 10 }}>

          {/* Create+ pill */}
          <button
            onClick={() => setMenuOpen(true)}
            style={{
              display:         'flex',
              alignItems:      'center',
              gap:             4,
              padding:         '6px 13px',
              background:      'rgba(255,255,255,0.22)',
              backdropFilter:  'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              border:          '1px solid rgba(255,255,255,0.40)',
              borderRadius:    20,
              color:           '#ffffff',
              fontSize:        13,
              fontWeight:      700,
              cursor:          'pointer',
              fontFamily:      'inherit',
              letterSpacing:   '-0.2px',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            + Create
          </button>

          {/* Business logo or initial avatar */}
          {logoUrl ? (
            <div style={{
              width:        34,
              height:       34,
              borderRadius: '50%',
              overflow:     'hidden',
              border:       '1.5px solid rgba(255,255,255,0.50)',
              background:   '#ffffff',
              display:      'flex',
              alignItems:   'center',
              justifyContent: 'center',
              flexShrink:   0,
            }}>
              <img
                src={logoUrl}
                alt="logo"
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            </div>
          ) : (
            <div style={{
              width:           34,
              height:          34,
              borderRadius:    '50%',
              background:      'rgba(255,255,255,0.25)',
              border:          '1.5px solid rgba(255,255,255,0.50)',
              backdropFilter:  'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              display:         'flex',
              alignItems:      'center',
              justifyContent:  'center',
              color:           '#ffffff',
              fontWeight:      700,
              fontSize:        15,
              letterSpacing:   '-0.3px',
              flexShrink:      0,
            }}>
              {initial}
            </div>
          )}
        </div>
      </header>
    </>
  )
}
