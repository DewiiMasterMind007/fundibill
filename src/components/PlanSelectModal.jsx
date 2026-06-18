/**
 * src/components/PlanSelectModal.jsx
 *
 * Plan picker shown when the user clicks Buy / Upgrade / Renew Now.
 * Lets the user choose Monthly, Annual or Lifetime before being sent to
 * the PayFast payment page (built via buildPayFastURL).
 *
 * Usage:
 *   <PlanSelectModal onSelect={(plan) => ...} onClose={() => ...} />
 */

const PLANS = [
  {
    id:       'monthly',
    name:     'Monthly',
    price:    'R29',
    period:   '/month',
    note:     null,
    badge:    null,
  },
  {
    id:       'annual',
    name:     'Annual',
    price:    'R299',
    period:   '/year',
    note:     'Save 14%',
    badge:    'Most Popular',
  },
]

export default function PlanSelectModal({ onSelect, onClose }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Choose your plan"
      onClick={onClose}
      style={{
        position:       'fixed',
        inset:          0,
        zIndex:         10000,
        background:     'rgba(2, 6, 23, 0.72)',
        backdropFilter: 'blur(4px)',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        padding:        20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background:   '#ffffff',
          borderRadius: 16,
          width:        '100%',
          maxWidth:     620,
          boxShadow:    '0 32px 80px rgba(0,0,0,0.35)',
          overflow:     'hidden',
        }}
      >
        {/* ── Header ── */}
        <div style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          padding:        '18px 24px',
          borderBottom:   '1px solid #f1f5f9',
        }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0f172a' }}>
            Choose Your Plan
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#94a3b8', fontSize: 22, lineHeight: 1, padding: '0 2px',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = '#475569' }}
            onMouseLeave={e => { e.currentTarget.style.color = '#94a3b8' }}
          >
            ×
          </button>
        </div>

        {/* ── Plan cards ── */}
        <div style={{
          display:  'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap:      16,
          padding:  24,
        }}>
          {PLANS.map(plan => {
            const popular = plan.id === 'annual'
            return (
              <div
                key={plan.id}
                style={{
                  position:     'relative',
                  display:      'flex',
                  flexDirection: 'column',
                  alignItems:   'center',
                  textAlign:    'center',
                  borderRadius: 12,
                  border:       popular ? '2px solid #14b8a6' : '1px solid #e2e8f0',
                  padding:      '24px 16px',
                  background:   popular ? 'rgba(20,184,166,0.05)' : '#fff',
                }}
              >
                {plan.badge && (
                  <span style={{
                    position:     'absolute',
                    top:          -11,
                    background:   '#14b8a6',
                    color:        '#fff',
                    fontSize:     11,
                    fontWeight:   700,
                    padding:      '3px 10px',
                    borderRadius: 999,
                    letterSpacing: '0.02em',
                    whiteSpace:   'nowrap',
                  }}>
                    {plan.badge}
                  </span>
                )}

                <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginTop: plan.badge ? 6 : 0 }}>
                  {plan.name}
                </div>

                <div style={{ margin: '10px 0 2px', display: 'flex', alignItems: 'baseline', gap: 3 }}>
                  <span style={{ fontSize: 26, fontWeight: 800, color: '#0f172a' }}>{plan.price}</span>
                  {plan.period && (
                    <span style={{ fontSize: 13, color: '#94a3b8', fontWeight: 500 }}>{plan.period}</span>
                  )}
                </div>

                {plan.note && (
                  <div style={{
                    fontSize:   12,
                    fontWeight: 600,
                    color:      popular ? '#0d9488' : '#64748b',
                    marginBottom: 14,
                  }}>
                    {plan.note}
                  </div>
                )}
                {!plan.note && <div style={{ height: 14 + 12 }} />}

                <button
                  onClick={() => onSelect(plan.id)}
                  style={{
                    width:        '100%',
                    marginTop:    'auto',
                    border:       'none',
                    borderRadius: 8,
                    padding:      '10px 0',
                    fontSize:     14,
                    fontWeight:   700,
                    cursor:       'pointer',
                    background:   popular ? '#14b8a6' : '#0f172a',
                    color:        '#fff',
                    transition:   'opacity 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.opacity = '0.88' }}
                  onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
                >
                  Select
                </button>
              </div>
            )
          })}
        </div>

        {/* ── Trust strip ── */}
        <div style={{
          margin:        '0 24px 22px',
          padding:       '14px 16px',
          background:    '#f8fafc',
          borderRadius:  10,
          border:        '1px solid #e2e8f0',
          display:       'flex',
          flexDirection: 'column',
          alignItems:    'center',
          gap:           10,
        }}>
          {/* Headline */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
              stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
              Guaranteed Safe &amp; Secure Payments
            </span>
          </div>

          {/* Logos row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>

            {/* PayFast wordmark */}
            <div style={{
              background:   '#fff',
              border:       '1px solid #e2e8f0',
              borderRadius: 6,
              padding:      '5px 10px',
              display:      'flex',
              alignItems:   'center',
              gap:          5,
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="11" fill="#002DCC"/>
                <path d="M7 12l3.5 3.5L17 8" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span style={{ fontSize: 11, fontWeight: 800, color: '#002DCC', letterSpacing: '-0.2px' }}>
                payfast
              </span>
            </div>

            <span style={{ color: '#d1d5db', fontSize: 16, lineHeight: 1 }}>·</span>

            {/* Apple Pay */}
            <div style={{
              background:   '#000',
              borderRadius: 6,
              padding:      '5px 10px',
              display:      'flex',
              alignItems:   'center',
              gap:          4,
            }}>
              <svg width="11" height="13" viewBox="0 0 11 13" fill="white">
                <path d="M9.14 2.06c.65-.78.9-1.57.92-1.88-.9.05-1.97.6-2.6 1.33-.58.67-.98 1.47-.93 2.34.98.04 1.96-.5 2.61-1.79zM9.18 3.75c-1.44-.08-2.66.81-3.35.81-.69 0-1.75-.77-2.88-.75C1.5 3.83.3 4.67.3 6.48c0 2.83 2.26 6.52 3.5 6.52.6 0 1.12-.4 1.98-.4.85 0 1.43.41 2.04.41 1.2 0 2.55-3.41 2.55-3.41S9.4 8.37 9.4 7.1c0-1.14.75-1.7 1.39-2.12-.48-.76-1.3-1.22-1.61-1.23z"/>
              </svg>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', letterSpacing: '0.3px' }}>Pay</span>
            </div>

            <span style={{ color: '#d1d5db', fontSize: 16, lineHeight: 1 }}>·</span>

            {/* Mastercard */}
            <div style={{
              background:   '#fff',
              border:       '1px solid #e2e8f0',
              borderRadius: 6,
              padding:      '5px 9px',
              display:      'flex',
              alignItems:   'center',
            }}>
              <svg width="34" height="20" viewBox="0 0 34 20">
                <circle cx="12" cy="10" r="9" fill="#EB001B"/>
                <circle cx="22" cy="10" r="9" fill="#F79E1B"/>
                <path d="M17 4.4a9 9 0 0 1 0 11.2A9 9 0 0 1 17 4.4z" fill="#FF5F00"/>
              </svg>
            </div>

            <span style={{ color: '#d1d5db', fontSize: 16, lineHeight: 1 }}>·</span>

            {/* Visa */}
            <div style={{
              background:   '#1A1F71',
              borderRadius: 6,
              padding:      '5px 10px',
            }}>
              <svg width="34" height="12" viewBox="0 0 34 12">
                <text x="0" y="11" fontFamily="Arial, sans-serif" fontSize="13"
                  fontWeight="800" fontStyle="italic" fill="white" letterSpacing="1">
                  VISA
                </text>
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
