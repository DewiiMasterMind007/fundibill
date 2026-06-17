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

        {/* ── Footer note ── */}
        <div style={{
          padding:   '0 24px 22px',
          fontSize:  12,
          color:     '#94a3b8',
          textAlign: 'center',
        }}>
          You&apos;ll be redirected to PayFast to complete your payment securely.
        </div>
      </div>
    </div>
  )
}
