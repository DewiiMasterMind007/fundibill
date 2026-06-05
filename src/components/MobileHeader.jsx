import { useLocation } from 'react-router-dom'
import { useAppData } from '../context/AppDataContext'
import fundibillLogo from '../../public/FundiBill long.png'

// Maps route paths to human-readable page titles
const PAGE_NAMES = {
  '/dashboard':  'Dashboard',
  '/invoices':   'Invoices',
  '/estimates':  'Estimates',
  '/clients':    'Clients',
  '/items':      'Items',
  '/expenses':   'Expenses',
  '/settings':   'Settings',
}

/**
 * Sticky top header shown on mobile (≤768 px).
 * Displays the current page name (derived from the URL) on the left,
 * or the FundiBill wordmark when no named page is active.
 * Shows a business-name initial avatar on the right.
 */
export default function MobileHeader() {
  const { profile } = useAppData()
  const location    = useLocation()

  const pageName     = PAGE_NAMES[location.pathname] || null
  const businessName = profile?.business_name || 'FundiBill'
  const initial      = businessName.charAt(0).toUpperCase()

  return (
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
            fontSize:   19,
            fontWeight: 700,
            color:      '#ffffff',
            letterSpacing: '-0.3px',
            textShadow: '0 1px 4px rgba(0,0,0,0.18)',
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

      {/* ── Right: business-name initial avatar ── */}
      <div style={{
        position:        'relative',
        zIndex:          1,
        width:           34,
        height:          34,
        borderRadius:    '50%',
        background:      'rgba(255,255,255,0.25)',
        border:          '1.5px solid rgba(255,255,255,0.50)',
        backdropFilter:  'blur(8px)',
        display:         'flex',
        alignItems:      'center',
        justifyContent:  'center',
        color:           '#ffffff',
        fontWeight:      700,
        fontSize:        15,
        letterSpacing:   '-0.3px',
      }}>
        {initial}
      </div>
    </header>
  )
}
