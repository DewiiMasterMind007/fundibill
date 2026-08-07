import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import useIsMobile from '../hooks/useIsMobile'

// ─── Step definitions ─────────────────────────────────────────────────────────
//
// Each step has a desktop `description`/`path`/`finder`. Steps whose target or
// wording differs on mobile (≤768px) provide `mobileDescription`/`mobilePath`/
// `mobileFinder` overrides — see buildSteps() below, which merges them.

const STEPS = [
  {
    title: 'Welcome to FundiBill 👋',
    description:
      "This is your main navigation panel. Everything you need is here — let's take a quick tour so you can get up and running fast.",
    mobileDescription:
      "This is your navigation bar. Tap the icons to jump between Dashboard, Invoices, Estimates and Clients, or tap More for everything else — let's take a quick tour so you can get up and running fast.",
    path: null,
    finder: () => document.querySelector('[data-tutorial="primary-nav"]'),
  },
  {
    title: 'Your Dashboard',
    description:
      'The Dashboard gives you a live overview of your business — total revenue, outstanding invoices, overdue amounts and a monthly chart. Check it daily to stay on top of your finances.',
    path: '/dashboard',
    finder: () => document.querySelector('[data-tutorial="nav-dashboard"]'),
  },
  {
    title: 'Stat Cards',
    description:
      'These cards update automatically as you create and manage invoices. Use the date filter buttons above the chart to change the time period.',
    path: '/dashboard',
    finder: () => document.querySelector('[data-tutorial="stat-cards"]'),
  },
  {
    title: 'Invoices',
    description:
      "Create, manage and send all your invoices here. Let's head over and take a look.",
    path: '/invoices',
    finder: () => document.querySelector('[data-tutorial="nav-invoices"]'),
  },
  {
    title: 'Creating an Invoice',
    description:
      "Click New Invoice to start a new invoice. You'll select a client, add your line items, toggle VAT if needed and set a due date. It takes less than a minute.",
    mobileDescription:
      "Tap the + button to start a new invoice. You'll select a client, add your line items, toggle VAT if needed and set a due date. It takes less than a minute.",
    path: '/invoices',
    finder: () => document.querySelector('[data-tutorial="new-invoice"]'),
  },
  {
    title: 'Recurring Invoices',
    description:
      'Got a client you invoice every month? Set up a recurring invoice and FundiBill will automatically create it for you on schedule — daily, weekly, monthly or yearly.',
    path: '/invoices',
    finder: () => document.querySelector('[data-tutorial="recurring"]'),
  },
  {
    title: 'Send via WhatsApp or Email',
    description:
      'Open any invoice or quote and click on the Share button. Choose WhatsApp or Email and click send.',
    mobileDescription:
      'Open any invoice or quote and click on the Share button. Choose WhatsApp or Email and click send.',
    path: '/invoices',
    finder: () => null,
  },
  {
    title: 'Quotes',
    description:
      'Send a quote to a client before the work begins. Once approved, convert it to an invoice with one click — no re-entering data.',
    path: '/estimates',
    finder: () => document.querySelector('[data-tutorial="nav-estimates"]'),
  },
  {
    title: 'Clients',
    description:
      'Store all your client details here. Once added, they appear in a dropdown when creating invoices and estimates — saving you time every time.',
    path: '/clients',
    finder: () => document.querySelector('[data-tutorial="nav-clients"]'),
  },
  {
    title: 'Your Item Catalog',
    description:
      'Add your products and services here. They appear as autocomplete suggestions when you add line items to invoices — the more you add, the faster invoicing becomes.',
    mobileDescription:
      'Your product and service catalog lives under the More menu. Tap More, then Items, to add your products and services — they appear as autocomplete suggestions when you add line items to invoices.',
    path: '/items',
    finder: () => document.querySelector('[data-tutorial="nav-items"]'),
    mobileFinder: () => document.querySelector('[data-tutorial="nav-more"]'),
  },
  {
    title: 'Settings',
    description:
      'Set up your business profile, logo, banking details, email settings and app theme here. Do this first before creating your first invoice so everything looks professional.',
    mobileDescription:
      'Your business profile, logo, banking details and email settings live under the More menu. Tap More, then Settings, and set this up first before creating your first invoice so everything looks professional.',
    path: '/settings',
    finder: () => document.querySelector('[data-tutorial="nav-settings"]'),
    mobileFinder: () => document.querySelector('[data-tutorial="nav-more"]'),
  },
  {
    title: 'Need Help Anytime?',
    description:
      'Every page has a help button in the top right corner. Click it anytime for a quick reminder of what each feature does — no need to remember everything from this tutorial.',
    mobileDescription:
      'Every page has a help button in the top right corner. Tap it anytime for a quick reminder of what each feature does — no need to remember everything from this tutorial.',
    path: '/settings',
    finder: () => document.querySelector('[data-tutorial="help-button"]'),
  },
  {
    title: "You're ready to go! 🎉",
    description:
      "That's everything. Start by going to Settings to set up your business profile, then add your first client and create your first invoice. You can restart this tutorial anytime from the sidebar. Good luck!",
    mobileDescription:
      "That's everything. Start by going to Settings to set up your business profile, then add your first client and create your first invoice. You can restart this tutorial anytime from the More menu. Good luck!",
    path: null,
    finder: () => document.querySelector('[data-tutorial="primary-nav"]'),
    isLast: true,
  },
]

const TOTAL   = STEPS.length
const PAD     = 10            // spotlight padding around target (px)
const PW      = 340           // popup width (px)
const PGAP    = 16            // gap between spotlight edge and popup (px)
const OVERLAY = 'rgba(0,0,0,0.55)'

// ─── Tutorial ─────────────────────────────────────────────────────────────────

/**
 * Renders a full-screen tutorial overlay with a spotlight cutout.
 * Parent controls visibility via conditional render; Tutorial resets itself on each mount.
 *
 * Props:
 *   onClose  — called when the user finishes or skips the tutorial
 */
export default function Tutorial({ onClose }) {
  const navigate = useNavigate()
  const isMobile = useIsMobile()

  const [step,      setStep]      = useState(0)
  const [spotlight, setSpotlight] = useState(null)   // { top, left, w, h }
  const [visible,   setVisible]   = useState(false)

  const base = STEPS[step]

  // Merge mobile overrides (if any) into the step used for this render
  const current = {
    ...base,
    description: (isMobile && base.mobileDescription) || base.description,
    path:        (isMobile && base.mobilePath)         || base.path,
    finder:      (isMobile && base.mobileFinder)       || base.finder,
  }

  // ── Find and position spotlight whenever step changes ──────────────────────
  useEffect(() => {
    let cancelled = false
    setVisible(false)

    const { path, finder } = current

    // Navigate to the required page (no-op if already there)
    if (path) navigate(path)

    // Wait for the route transition + React re-render, then locate the element
    const t1 = setTimeout(() => {
      if (cancelled) return

      const el = finder?.()
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })

        // Small extra pause for scroll to settle before measuring
        const t2 = setTimeout(() => {
          if (cancelled) return
          const r = el.getBoundingClientRect()
          setSpotlight({ top: r.top, left: r.left, w: r.width, h: r.height })
          setVisible(true)
        }, 120)

        return () => clearTimeout(t2)
      } else {
        setSpotlight(null)
        setVisible(true)
      }
    }, 380)

    return () => {
      cancelled = true
      clearTimeout(t1)
    }
  }, [step, isMobile]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Escape key to close ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Don't render anything while we're waiting for the element
  if (!visible) return null

  // ── Spotlight geometry (with padding) ──────────────────────────────────────
  const vw = window.innerWidth
  const vh = window.innerHeight

  let sTop = 0, sLeft = 0, sW = vw, sH = vh, sRight = vw, sBottom = vh
  if (spotlight) {
    sTop    = Math.max(0, spotlight.top  - PAD)
    sLeft   = Math.max(0, spotlight.left - PAD)
    sW      = spotlight.w + PAD * 2
    sH      = spotlight.h + PAD * 2
    sRight  = sLeft + sW
    sBottom = sTop  + sH
  }

  // ── Popup position ─────────────────────────────────────────────────────────
  // Priority: right of spotlight → below → above → centred
  let popupTop, popupLeft
  const popupW = Math.min(PW, vw - 20)

  if (!spotlight) {
    // No target found — centre the popup
    popupTop  = Math.max(10, (vh - 300) / 2)
    popupLeft = Math.max(10, (vw - popupW) / 2)
  } else if (sRight + PGAP + popupW <= vw) {
    // Enough room to the right (sidebar elements land here)
    popupLeft = sRight + PGAP
    popupTop  = Math.max(10, Math.min(sTop, vh - 320))
  } else if (sBottom + PGAP + 270 <= vh) {
    // Enough room below (page content elements)
    popupTop  = sBottom + PGAP
    popupLeft = Math.max(10, Math.min(sLeft, vw - popupW - 10))
  } else if (sTop - PGAP - 270 >= 0) {
    // Fall back to above
    popupTop  = Math.max(10, sTop - PGAP - 270)
    popupLeft = Math.max(10, Math.min(sLeft, vw - popupW - 10))
  } else {
    // No room above, below or beside (e.g. a fixed bottom nav on mobile) — centre instead
    popupTop  = Math.max(10, (vh - 300) / 2)
    popupLeft = Math.max(10, (vw - popupW) / 2)
  }

  // ── Shared button styles ───────────────────────────────────────────────────
  const btnSecondary = {
    padding: '8px 16px', borderRadius: 8,
    border: '1px solid #e2e8f0', background: '#fff',
    color: '#475569', fontSize: 13, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit',
  }
  const btnPrimary = {
    padding: '8px 20px', borderRadius: 8, border: 'none',
    background: '#14b8a6', color: '#fff',
    fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
  }

  return (
    <>
      {/* ── 4-panel overlay with rectangular cutout ──────────────────────── */}
      {spotlight ? (
        <>
          {/* Top strip */}
          {sTop > 0 && (
            <div style={{
              position: 'fixed', top: 0, left: 0, right: 0, height: sTop,
              background: OVERLAY, zIndex: 9000, pointerEvents: 'none',
            }} />
          )}
          {/* Bottom strip */}
          <div style={{
            position: 'fixed', top: sBottom, left: 0, right: 0, bottom: 0,
            background: OVERLAY, zIndex: 9000, pointerEvents: 'none',
          }} />
          {/* Left strip */}
          {sLeft > 0 && (
            <div style={{
              position: 'fixed', top: sTop, left: 0, width: sLeft, height: sH,
              background: OVERLAY, zIndex: 9000, pointerEvents: 'none',
            }} />
          )}
          {/* Right strip */}
          <div style={{
            position: 'fixed', top: sTop, left: sRight, right: 0, height: sH,
            background: OVERLAY, zIndex: 9000, pointerEvents: 'none',
          }} />
          {/* Teal ring around the spotlight */}
          <div style={{
            position: 'fixed', top: sTop, left: sLeft, width: sW, height: sH,
            border: '2px solid rgba(20,184,166,0.85)', borderRadius: 8,
            boxShadow: '0 0 0 4px rgba(20,184,166,0.2)',
            zIndex: 9001, pointerEvents: 'none',
          }} />
        </>
      ) : (
        // Full overlay when no target found for this step
        <div style={{
          position: 'fixed', inset: 0,
          background: OVERLAY, zIndex: 9000, pointerEvents: 'none',
        }} />
      )}

      {/* ── Popup card ───────────────────────────────────────────────────── */}
      <div style={{
        position: 'fixed', top: popupTop, left: popupLeft, width: popupW,
        zIndex: 9002, background: '#ffffff', borderRadius: 14,
        boxShadow: '0 24px 64px rgba(0,0,0,0.2), 0 4px 16px rgba(0,0,0,0.1)',
        padding: '22px 24px 18px', fontFamily: 'inherit',
      }}>

        {/* Step badge + progress label */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{
            width: 26, height: 26, borderRadius: '50%',
            background: '#14b8a6', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 700, flexShrink: 0,
          }}>
            {step + 1}
          </div>
          <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500, letterSpacing: '0.02em' }}>
            Step {step + 1} of {TOTAL}
          </span>
        </div>

        {/* Progress bar */}
        <div style={{ height: 3, borderRadius: 2, background: '#e2e8f0', marginBottom: 14 }}>
          <div style={{
            height: 3, borderRadius: 2, background: '#14b8a6',
            width: `${((step + 1) / TOTAL) * 100}%`,
            transition: 'width 0.3s ease',
          }} />
        </div>

        {/* Title */}
        <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: '#0f172a', lineHeight: 1.3 }}>
          {current.title}
        </h3>

        {/* Description */}
        <p style={{ margin: '0 0 20px', fontSize: 14, color: '#475569', lineHeight: 1.65 }}>
          {current.description}
        </p>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>

          {/* Skip link */}
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#94a3b8', fontSize: 13, padding: 0, fontFamily: 'inherit',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = '#64748b' }}
            onMouseLeave={e => { e.currentTarget.style.color = '#94a3b8' }}
          >
            Skip tutorial
          </button>

          {/* Back + Next/Finish */}
          <div style={{ display: 'flex', gap: 8 }}>
            {/* Back — visible on steps 2-11 (not first, not last) */}
            {step > 0 && !current.isLast && (
              <button
                onClick={() => setStep(s => s - 1)}
                style={btnSecondary}
                onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc' }}
                onMouseLeave={e => { e.currentTarget.style.background = '#fff' }}
              >
                Back
              </button>
            )}

            {/* Finish (last step only) or Next */}
            {current.isLast ? (
              <button
                onClick={onClose}
                style={btnPrimary}
                onMouseEnter={e => { e.currentTarget.style.background = '#0d9488' }}
                onMouseLeave={e => { e.currentTarget.style.background = '#14b8a6' }}
              >
                Finish 🎉
              </button>
            ) : (
              <button
                onClick={() => setStep(s => s + 1)}
                style={btnPrimary}
                onMouseEnter={e => { e.currentTarget.style.background = '#0d9488' }}
                onMouseLeave={e => { e.currentTarget.style.background = '#14b8a6' }}
              >
                Next →
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
