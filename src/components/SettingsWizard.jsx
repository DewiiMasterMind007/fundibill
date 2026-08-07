import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import useIsMobile from '../hooks/useIsMobile'

// ─── Step definitions ─────────────────────────────────────────────────────────
//
// One step per Settings section card. `sectionId` matches the `id` prop each
// <Section> in Settings.jsx is given, which is now also exposed on the DOM as
// data-wizard="section-{id}" — see Section() in Settings.jsx.

const STEPS = [
  {
    sectionId:   'business',
    title:       'Business Profile',
    description: "Fill in your business name, address, contact details and VAT number — this appears on every invoice and quote you send. Edit any field below, then click Next to save and continue.",
  },
  {
    sectionId:   'appearance',
    title:       'Appearance',
    description: 'Pick your brand colours. They control the look of your generated PDFs and the app theme.',
  },
  {
    sectionId:   'documents',
    title:       'Document Settings',
    description: 'Set your invoice and quote numbering prefixes, starting numbers, and whether discounts are enabled.',
  },
  {
    sectionId:   'banking',
    title:       'Banking Details',
    description: 'Add your bank name, account number and branch code — these are printed on invoices so clients know where to pay.',
  },
  {
    sectionId:   'whatsapp',
    title:       'Notifications & Messages',
    description: 'Customise the default WhatsApp and email message templates sent with invoices, quotes and overdue reminders.',
  },
  {
    sectionId:   'email',
    title:       'Email Settings',
    description: 'Connect Gmail or set up your own SMTP server so FundiBill can send invoices and quotes directly from your email address.',
  },
  {
    sectionId:   'payment',
    title:       'Payment & Reminders',
    description: 'Set your default payment terms (how many days clients have to pay) and default payment method.',
  },
  {
    sectionId:   'terms',
    title:       'Terms & Conditions',
    description: 'Add the terms and conditions text printed at the bottom of your invoices and quotes.',
  },
  {
    sectionId:   'methods',
    title:       'Payment Methods',
    description: 'Customise the list of payment methods shown when marking an invoice as paid.',
    isLast:      true,
  },
]

const TOTAL   = STEPS.length
const PAD     = 10
const PW      = 360
const PGAP    = 16
const OVERLAY = 'rgba(0,0,0,0.55)'

/**
 * Settings setup wizard — walks the user through each Settings section,
 * spotlighting the real live form fields (fully editable underneath the
 * spotlight) and auto-saving after every step.
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

  // ── Open the matching mobile accordion + find/position the spotlight ──────
  useEffect(() => {
    let cancelled = false
    setVisible(false)
    navigate('/settings')
    window.dispatchEvent(new CustomEvent('fundibill:wizard-open-section', { detail: current.sectionId }))

    const t1 = setTimeout(() => {
      if (cancelled) return
      const el = document.querySelector(`[data-wizard="section-${current.sectionId}"]`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        const t2 = setTimeout(() => {
          if (cancelled) return
          const r = el.getBoundingClientRect()
          setSpotlight({ top: r.top, left: r.left, w: r.width, h: r.height })
          setVisible(true)
        }, 150)
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

  let popupTop, popupLeft
  const popupW = Math.min(PW, vw - 20)

  if (!spotlight) {
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
          overlay div, so the real, live Settings fields underneath stay fully
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

      {/* Popup card */}
      <div style={{
        position: 'fixed', top: popupTop, left: popupLeft, width: popupW,
        zIndex: 9002, background: '#ffffff', borderRadius: 14,
        boxShadow: '0 24px 64px rgba(0,0,0,0.2), 0 4px 16px rgba(0,0,0,0.1)',
        padding: '22px 24px 18px', fontFamily: 'inherit',
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
