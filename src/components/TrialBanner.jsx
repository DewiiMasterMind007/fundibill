import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { buildPayFastURL } from '../lib/payfast'

const POLL_INTERVAL_MS = 10_000   // check every 10 seconds
const POLL_MAX_MS      = 600_000  // stop after 10 minutes

export default function TrialBanner({ daysRemaining, trialExpired }) {
  const { user } = useAuth()
  const urgent   = !trialExpired && daysRemaining <= 2

  // Profile is needed to populate PayFast's name_first field
  const [profile, setProfile]           = useState(null)
  // UI states
  const [showHint, setShowHint]         = useState(false)  // redirect hint
  const [polling,  setPolling]          = useState(false)  // waiting for webhook
  const [confirmed, setConfirmed]       = useState(false)  // payment confirmed!

  const pollIntervalRef = useRef(null)
  const pollStartRef    = useRef(null)

  // Fetch the profile once so we have business_name for PayFast
  useEffect(() => {
    if (!user) return
    supabase
      .from('profiles')
      .select('business_name')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => setProfile(data))
  }, [user])

  // Clean up the interval if the component unmounts mid-poll
  useEffect(() => () => clearInterval(pollIntervalRef.current), [])

  // ── Polling ───────────────────────────────────────────────────────────────

  function stopPolling() {
    clearInterval(pollIntervalRef.current)
    pollIntervalRef.current = null
    setPolling(false)
  }

  function startPolling() {
    setPolling(true)
    pollStartRef.current = Date.now()

    pollIntervalRef.current = setInterval(async () => {
      // Auto-cancel after 10 minutes
      if (Date.now() - pollStartRef.current >= POLL_MAX_MS) {
        stopPolling()
        return
      }

      const { data } = await supabase
        .from('profiles')
        .select('is_licensed')
        .eq('id', user.id)
        .maybeSingle()

      if (data?.is_licensed === true) {
        stopPolling()
        setConfirmed(true)
        // Give the user 2.5 s to read the success message, then reload
        // so TrialContext re-fetches and all restrictions are lifted.
        setTimeout(() => window.location.reload(), 2500)
      }
    }, POLL_INTERVAL_MS)
  }

  // ── Buy handler ───────────────────────────────────────────────────────────

  function handleBuy() {
    const url = buildPayFastURL(user, profile)
    window.db?.openExternal(url)
    setShowHint(true)
    if (!polling && !confirmed) startPolling()
  }

  // ── Render ────────────────────────────────────────────────────────────────

  // Show extra rows when we have supplementary messages to display
  const hasExtra = showHint || polling || confirmed

  return (
    <div
      role="alert"
      style={{
        background:     '#0f172a',
        color:          '#fff',
        padding:        hasExtra ? '8px 20px' : '0 20px',
        minHeight:      40,
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        gap:            14,
        fontSize:       13,
        fontWeight:     500,
        flexShrink:     0,
        userSelect:     'none',
        transition:     'padding 0.2s',
      }}
    >
      {/* ── Left: status message ─────────────────────────────────────────── */}
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {confirmed ? (
          /* Payment success — shown for ~2.5 s before page reloads */
          <span style={{ color: '#4ade80', fontWeight: 700, fontSize: 14 }}>
            🎉 Payment confirmed! Full access activated.
          </span>
        ) : trialExpired ? (
          <>
            <span style={{ fontSize: 15 }}>🔒</span>
            <span style={{ color: '#cbd5e1' }}>Your free trial has ended.</span>
            <span style={{ color: '#64748b', fontWeight: 400 }}>
              You&apos;re in read-only mode — your data is safe.
            </span>
          </>
        ) : (
          <>
            <span style={{ fontSize: 15 }}>⏳</span>
            <span style={{
              background:   urgent ? '#dc2626' : '#d97706',
              color:        '#fff',
              borderRadius: 4,
              padding:      '2px 8px',
              fontWeight:   700,
              fontSize:     12,
            }}>
              {daysRemaining} day{daysRemaining !== 1 ? 's' : ''}
            </span>
            <span style={{ color: '#94a3b8', fontWeight: 400 }}>left in your FundiBill free trial</span>
          </>
        )}
      </span>

      {/* ── Right: button + sub-messages ─────────────────────────────────── */}
      {!confirmed && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
          <button
            onClick={handleBuy}
            style={{
              background:    '#14b8a6',
              color:         '#fff',
              border:        'none',
              borderRadius:  6,
              padding:       '6px 16px',
              fontSize:      13,
              fontWeight:    700,
              cursor:        'pointer',
              letterSpacing: '0.01em',
              whiteSpace:    'nowrap',
              boxShadow:     '0 2px 8px rgba(20,184,166,0.35)',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#0d9488' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#14b8a6' }}
          >
            Buy FundiBill Lifetime Access — R99
          </button>

          {/* Redirect hint — shown immediately after the button is clicked */}
          {showHint && !polling && (
            <span style={{ fontSize: 11, color: '#94a3b8', textAlign: 'right' }}>
              ↗ You&apos;ll be redirected to PayFast to complete your payment securely.
            </span>
          )}

          {/* Polling indicator — shown once the poll loop starts */}
          {polling && (
            <span style={{ fontSize: 11, color: '#64748b', display: 'flex', alignItems: 'center', gap: 5 }}>
              <svg
                width="10" height="10" viewBox="0 0 24 24" fill="none"
                stroke="#64748b" strokeWidth="2.5"
                style={{ animation: 'bannerSpin 1s linear infinite', flexShrink: 0 }}
              >
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
              </svg>
              Waiting for payment confirmation…
            </span>
          )}
        </div>
      )}

      <style>{`@keyframes bannerSpin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
