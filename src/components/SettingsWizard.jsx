import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import useIsMobile from '../hooks/useIsMobile'

// ─── Step definitions ─────────────────────────────────────────────────────────
//
// One step per individual setting, not per section. `target` matches a
// data-wizard attribute in Settings.jsx (either `field-{name}` on a single
// input, or `section-{id}` for the couple of list-style controls that aren't
// a single field — Payment Methods, Expense Categories). `openSectionId`
// is the parent <Section> id to auto-expand on mobile (its accordion).

const STEPS = [
  // ── Business Profile ──
  { openSectionId: 'business', target: 'field-name',             title: 'Your Name',        description: 'Your own name — used internally, not printed on documents.' },
  { openSectionId: 'business', target: 'field-business_name',    title: 'Business Name',    description: 'This is the name printed on every invoice and quote you send.' },
  { openSectionId: 'business', target: 'field-email',            title: 'Email Address',    description: 'Your business contact email, shown on invoices and quotes.' },
  { openSectionId: 'business', target: 'field-business_address', title: 'Business Address', description: 'Your business address, printed on invoices and quotes.' },
  { openSectionId: 'business', target: 'field-phone',            title: 'Contact Number',   description: 'A phone number your clients can reach you on.' },
  { openSectionId: 'business', target: 'field-vat_number',       title: 'VAT Number',       description: "Optional — add your VAT registration number if you're VAT registered." },
  { openSectionId: 'business', target: 'field-logo',             title: 'Business Logo',    description: 'Upload your logo — it appears on invoices, quotes and emails.' },

  // ── Appearance ──
  { openSectionId: 'appearance', target: 'field-primary_color', title: 'Primary Color', description: 'Your main brand colour — used on PDFs and throughout the app.' },
  { openSectionId: 'appearance', target: 'field-accent_color',  title: 'Accent Color',  description: 'A secondary accent colour for your documents.' },

  // ── Document Settings ──
  { openSectionId: 'documents', target: 'field-invoice_prefix',           title: 'Invoice Prefix',           description: 'The prefix shown before every invoice number, e.g. INV-.' },
  { openSectionId: 'documents', target: 'field-estimate_prefix',          title: 'Quote Prefix',              description: 'The prefix shown before every quote number, e.g. QT-.' },
  { openSectionId: 'documents', target: 'field-starting_invoice_number',  title: 'Starting Invoice Number',  description: 'The number your invoice sequence starts counting from.' },
  { openSectionId: 'documents', target: 'field-starting_estimate_number', title: 'Starting Quote Number',    description: 'The number your quote sequence starts counting from.' },
  { openSectionId: 'documents', target: 'field-discounts_enabled',        title: 'Discounts',                description: 'Enable discounts on invoices and quotes, and choose percentage or fixed amount.' },

  // ── Banking Details ──
  { openSectionId: 'banking', target: 'section-banking',           title: 'Banking Details',      description: 'Add your primary banking details here — they appear on every invoice and quote you send.' },
  { openSectionId: 'banking', target: 'field-add-banking-account', title: 'Add Banking Account',  description: 'Add extra bank accounts here — you can then choose which one to use each time you create or edit an invoice or quote.' },

  // ── Notifications & Messages ──
  { openSectionId: 'whatsapp', target: 'field-email_invoice_message', title: 'Invoice Message',          description: 'The default message sent with an invoice, by email or WhatsApp.' },
  { openSectionId: 'whatsapp', target: 'field-email_quote_message',   title: 'Quote Message',            description: 'The default message sent with a quote, by email or WhatsApp.' },
  { openSectionId: 'whatsapp', target: 'field-email_overdue_message', title: 'Overdue Reminder Message', description: 'The default message sent when reminding a client about an overdue invoice.' },

  // ── Email Settings ──
  { openSectionId: 'email', target: 'field-email_provider',   title: 'Email Provider', description: 'Choose Gmail (connect your Google account) or your own Custom SMTP server for sending emails.' },
  { openSectionId: 'email', target: 'field-smtp_host',        title: 'SMTP Host',      description: 'Your SMTP server address — only needed if using Custom SMTP.' },
  { openSectionId: 'email', target: 'field-smtp_port',        title: 'SMTP Port',      description: 'Your SMTP server port, usually 587 or 465.' },
  { openSectionId: 'email', target: 'field-smtp_user',        title: 'From Email',     description: 'Your SMTP username — also used as the from address.' },
  { openSectionId: 'email', target: 'field-smtp_password',    title: 'SMTP Password',  description: 'Your SMTP password or app password.' },
  { openSectionId: 'email', target: 'field-smtp_from_name',   title: 'From Name',      description: 'The sender name shown on emails you send.' },

  // ── Payment & Reminders ──
  { openSectionId: 'payment', target: 'field-payment_terms_days', title: 'Default Payment Terms', description: 'How many days clients have to pay before an invoice is marked overdue.' },
  { openSectionId: 'payment', target: 'field-auto_reminders_enabled', title: 'Automatic Payment Reminders', description: 'Automatically email overdue clients a reminder — on the due date, again a week later, then every 3 days until they pay. Only for invoices actually sent from the app.' },

  // ── Terms & Conditions ──
  { openSectionId: 'terms', target: 'field-terms_conditions', title: 'Terms & Conditions', description: 'Printed at the bottom of every invoice and quote.' },

  // ── Payment Methods / Expense Categories (list controls, not single fields) ──
  { openSectionId: 'methods',    target: 'section-methods',    title: 'Payment Methods',    description: 'Customise the list of payment methods shown when marking an invoice as paid.' },
  { openSectionId: 'categories', target: 'section-categories', title: 'Expense Categories', description: 'Customise the categories shown when recording an expense.', isLast: true },
]

const TOTAL       = STEPS.length
const PAD         = 10
const PW          = 360
const PGAP        = 16
const OVERLAY     = 'rgba(0,0,0,0.55)'
const SHEET_H_EST = 300   // rough mobile bottom-sheet height, used to keep the target above it

/**
 * Settings setup wizard — walks the user through each individual Settings
 * field, spotlighting the real live form field (fully editable underneath
 * the spotlight) and auto-saving after every step.
 *
 * Props:
 *   userId     — current user's id, for persisting wizard progress
 *   startStep  — step index to resume from (0-based)
 *   onClose    — called with { completed: boolean } when the wizard closes
 */
export default function SettingsWizard({ userId, startStep = 0, onClose }) {
  const navigate = useNavigate()
  const isMobile = useIsMobile()

  const [step,      setStep]      = useState(Math.min(startStep, TOTAL - 1))
  const [spotlight, setSpotlight] = useState(null)
  const [visible,   setVisible]   = useState(false)
  const [saving,    setSaving]    = useState(false)

  const current = STEPS[step]

  function autoSave() {
    setSaving(true)
    window.dispatchEvent(new CustomEvent('fundibill:wizard-save'))
    setTimeout(() => setSaving(false), 600)
  }

  async function persistStep(stepIndex) {
    if (!userId) return
    await supabase.from('profiles').upsert(
      { id: userId, settings_wizard_step: stepIndex, settings_wizard_completed: false },
      { onConflict: 'id' }
    )
  }

  async function persistCompleted() {
    if (!userId) return
    await supabase.from('profiles').upsert(
      { id: userId, settings_wizard_completed: true, settings_wizard_step: null },
      { onConflict: 'id' }
    )
  }

  // ── Lock all page scrolling for as long as the wizard is open ─────────────
  // A scrolling page underneath a `position:fixed` spotlight is a race: the
  // ring is measured once and then stays put while the page can keep moving
  // (smooth-scroll animation, or the user scrolling by hand/wheel/touch), so
  // the ring visibly drifts off the field it's meant to highlight. Locking
  // scroll on every scrollable ancestor, plus swallowing wheel and touchmove
  // events, removes every source of that drift — scrollIntoView()/scrollTop
  // still work fine on an `overflow:hidden` container, only user-driven
  // scrolling is blocked. Settings.jsx's own root div is independently
  // scrollable (nested inside App.jsx's <main>, which is ALSO scrollable) —
  // both need locking, not just <main>.
  useEffect(() => {
    const settingsRoot = document.querySelector('[data-wizard-scroll-root]')
    const targets = [document.body, document.documentElement, document.querySelector('main'), settingsRoot].filter(Boolean)
    const prevOverflow = targets.map(el => el.style.overflow)
    targets.forEach(el => { el.style.overflow = 'hidden' })

    const preventScroll = e => e.preventDefault()
    window.addEventListener('wheel', preventScroll, { passive: false })
    window.addEventListener('touchmove', preventScroll, { passive: false })

    return () => {
      targets.forEach((el, i) => { el.style.overflow = prevOverflow[i] })
      window.removeEventListener('wheel', preventScroll, { passive: false })
      window.removeEventListener('touchmove', preventScroll, { passive: false })
    }
  }, [])

  // ── Open the matching mobile accordion + find/position the spotlight ──────
  useEffect(() => {
    let cancelled = false
    setVisible(false)
    navigate('/settings')
    window.dispatchEvent(new CustomEvent('fundibill:wizard-open-section', { detail: current.openSectionId }))

    const t1 = setTimeout(() => {
      if (cancelled) return
      const el = document.querySelector(`[data-wizard="${current.target}"]`)
      if (el) {
        // Instant positioning — no smooth-scroll animation to race against.
        // Settings.jsx's own root div (not App.jsx's outer <main>) is the
        // container that actually scrolls its fields — see data-wizard-scroll-root.
        const scroller = document.querySelector('[data-wizard-scroll-root]') || document.querySelector('main') || document.scrollingElement
        const elRect       = el.getBoundingClientRect()
        const scrollerRect = scroller.getBoundingClientRect()
        const elTopInScroller = elRect.top - scrollerRect.top + scroller.scrollTop

        const availH = isMobile ? window.innerHeight - SHEET_H_EST : window.innerHeight
        scroller.scrollTop = Math.max(0, elTopInScroller - Math.max(0, (availH - elRect.height) / 2))

        const t2 = setTimeout(() => {
          if (cancelled) return
          const r = el.getBoundingClientRect()
          setSpotlight({ top: r.top, left: r.left, w: r.width, h: r.height })
          setVisible(true)
        }, 60)
        return () => clearTimeout(t2)
      } else {
        setSpotlight(null)
        setVisible(true)
      }
    }, 200)

    return () => { cancelled = true; clearTimeout(t1) }
  }, [step]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Escape key ───────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') handleCancel() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleNext() {
    autoSave()
    if (current.isLast) {
      persistCompleted()
      onClose({ completed: true })
    } else {
      setStep(s => s + 1)
    }
  }

  function handleBack() {
    setStep(s => Math.max(0, s - 1))
  }

  function handleContinueLater() {
    autoSave()
    persistStep(step)
    onClose({ completed: false })
  }

  function handleCancel() {
    autoSave()
    persistStep(null)
    onClose({ completed: false })
  }

  if (!visible) return null

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

  // ── Popup position ─────────────────────────────────────────────────────
  let popupTop, popupLeft, popupStyleExtra = {}
  const popupW = Math.min(PW, vw - 20)

  if (isMobile) {
    // Always a bottom sheet on mobile — never overlaps the spotlighted field,
    // since the field is scrolled to sit in the area above it (see effect).
    popupStyleExtra = {
      bottom: 0, left: 0, right: 0, top: undefined, width: '100%',
      borderRadius: '16px 16px 0 0',
      maxHeight: '48vh', overflowY: 'auto',
    }
  } else if (!spotlight) {
    popupTop  = Math.max(10, (vh - 320) / 2)
    popupLeft = Math.max(10, (vw - popupW) / 2)
  } else if (sRight + PGAP + popupW <= vw) {
    popupLeft = sRight + PGAP
    popupTop  = Math.max(10, Math.min(sTop, vh - 340))
  } else if (sLeft - PGAP - popupW >= 0) {
    popupLeft = sLeft - PGAP - popupW
    popupTop  = Math.max(10, Math.min(sTop, vh - 340))
  } else if (sBottom + PGAP + 290 <= vh) {
    popupTop  = sBottom + PGAP
    popupLeft = Math.max(10, Math.min(sLeft, vw - popupW - 10))
  } else {
    popupTop  = Math.max(10, (vh - 320) / 2)
    popupLeft = Math.max(10, (vw - popupW) / 2)
  }

  const btnSecondary = {
    padding: '8px 14px', borderRadius: 8,
    border: '1px solid #e2e8f0', background: '#fff',
    color: '#475569', fontSize: 13, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
  }
  const btnPrimary = {
    padding: '8px 20px', borderRadius: 8, border: 'none',
    background: '#14b8a6', color: '#fff',
    fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
  }

  return (
    <>
      {/* Overlay with rectangular cutout — the cutout area itself receives no
          overlay div, so the real, live Settings field underneath stays fully
          clickable/editable while spotlighted. */}
      {spotlight ? (
        <>
          {sTop > 0 && (
            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: sTop, background: OVERLAY, zIndex: 9000, pointerEvents: 'none' }} />
          )}
          <div style={{ position: 'fixed', top: sBottom, left: 0, right: 0, bottom: 0, background: OVERLAY, zIndex: 9000, pointerEvents: 'none' }} />
          {sLeft > 0 && (
            <div style={{ position: 'fixed', top: sTop, left: 0, width: sLeft, height: sH, background: OVERLAY, zIndex: 9000, pointerEvents: 'none' }} />
          )}
          <div style={{ position: 'fixed', top: sTop, left: sRight, right: 0, height: sH, background: OVERLAY, zIndex: 9000, pointerEvents: 'none' }} />
          <div style={{
            position: 'fixed', top: sTop, left: sLeft, width: sW, height: sH,
            border: '2px solid rgba(20,184,166,0.85)', borderRadius: 8,
            boxShadow: '0 0 0 4px rgba(20,184,166,0.2)',
            zIndex: 9001, pointerEvents: 'none',
          }} />
        </>
      ) : (
        <div style={{ position: 'fixed', inset: 0, background: OVERLAY, zIndex: 9000, pointerEvents: 'none' }} />
      )}

      {/* Popup card — bottom sheet on mobile, floating card on desktop */}
      <div style={{
        position: 'fixed',
        top: isMobile ? undefined : popupTop,
        left: isMobile ? undefined : popupLeft,
        width: isMobile ? undefined : popupW,
        zIndex: 9002, background: '#ffffff', borderRadius: 14,
        boxShadow: '0 24px 64px rgba(0,0,0,0.2), 0 4px 16px rgba(0,0,0,0.1)',
        padding: '22px 24px 18px', fontFamily: 'inherit',
        ...popupStyleExtra,
      }}>
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

        <div style={{ height: 3, borderRadius: 2, background: '#e2e8f0', marginBottom: 14 }}>
          <div style={{ height: 3, borderRadius: 2, background: '#14b8a6', width: `${((step + 1) / TOTAL) * 100}%`, transition: 'width 0.3s ease' }} />
        </div>

        <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: '#0f172a', lineHeight: 1.3 }}>
          {current.title}
        </h3>

        <p style={{ margin: '0 0 14px', fontSize: 14, color: '#475569', lineHeight: 1.6 }}>
          {current.description}
        </p>

        {saving && (
          <p style={{ margin: '0 0 14px', fontSize: 12, color: '#14b8a6', fontWeight: 600 }}>
            Saving…
          </p>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              onClick={handleCancel}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 13, padding: 0, fontFamily: 'inherit' }}
              onMouseEnter={e => { e.currentTarget.style.color = '#64748b' }}
              onMouseLeave={e => { e.currentTarget.style.color = '#94a3b8' }}
            >
              Cancel
            </button>
            <button
              onClick={handleContinueLater}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 13, padding: 0, fontFamily: 'inherit' }}
              onMouseEnter={e => { e.currentTarget.style.color = '#64748b' }}
              onMouseLeave={e => { e.currentTarget.style.color = '#94a3b8' }}
            >
              Continue later
            </button>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            {step > 0 && (
              <button
                onClick={handleBack}
                style={btnSecondary}
                onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc' }}
                onMouseLeave={e => { e.currentTarget.style.background = '#fff' }}
              >
                Back
              </button>
            )}
            <button
              onClick={handleNext}
              style={btnPrimary}
              onMouseEnter={e => { e.currentTarget.style.background = '#0d9488' }}
              onMouseLeave={e => { e.currentTarget.style.background = '#14b8a6' }}
            >
              {current.isLast ? 'Finish Setup 🎉' : 'Save & Next →'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
