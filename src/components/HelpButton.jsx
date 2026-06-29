/**
 * src/components/HelpButton.jsx
 *
 * A small reusable "?" button that toggles a contextual help dropdown.
 * Intentionally neutral (grey) so it never clashes with the user's theme color.
 *
 * Usage:
 *   <HelpButton page="invoices" />
 *
 * Accepted page keys:
 *   "dashboard" | "invoices" | "estimates" | "clients" | "items" | "settings"
 */

import { useState, useEffect, useRef } from 'react'

// ─── Help content ─────────────────────────────────────────────────────────────

const HELP = {
  dashboard: {
    title: 'Dashboard',
    bullets: [
      'View your total revenue, outstanding amounts and overdue invoices at a glance.',
      'Use the date filters to see revenue for the last 7, 30 or 90 days, or choose a custom date range.',
      'The bar chart shows your monthly revenue trend. You can scroll over each month to see your stats.',
      'Stat cards update automatically as you create and manage invoices.',
    ],
  },
  invoices: {
    title: 'Invoices',
    bullets: [
      'Create a new invoice by clicking "New Invoice" and selecting a client.',
      'Add line items by typing an item name — previously used items will auto-suggest.',
      'Toggle VAT (15%) on or off per invoice using the VAT checkbox.',
      'Mark an invoice as paid once payment is received.',
      'Download a PDF of any invoice using the Preview PDF button.',
      'Use the Share button to send an invoice to your client via WhatsApp or Email.',
      'Overdue invoices are detected automatically based on the due date.',
      'Use Recurring Invoices to automatically generate invoices on a set schedule.',
    ],
  },
  estimates: {
    title: 'Quotes',
    bullets: [
      'Create a quote for a client before work begins.',
      'Add line items the same way as invoices, with VAT toggle support.',
      'Once a quote is approved, it will automatically convert to an invoice and list the quote under "Approved".',
      'Download or send quotes to your clients using the Share button (Email or WhatsApp).',
    ],
  },
  clients: {
    title: 'Clients',
    bullets: [
      'Add all your clients here for quick selection when creating invoices.',
      'Each client stores their name, email, phone and address.',
      'Click a client to view their full invoice and estimate history.',
      'Edit or delete clients using the action buttons.',
    ],
  },
  items: {
    title: 'Items',
    bullets: [
      'Build your master product and service catalog here.',
      'Items saved here appear as autocomplete suggestions when adding line items.',
      'Set a default unit price for each item to speed up invoice creation.',
      'New items typed during invoice creation are automatically saved here.',
    ],
  },
  expenses: {
    title: 'Expenses',
    bullets: [
      'Track all your business expenses here to keep your finances in order.',
      'Add an expense by clicking "New Expense" and filling in the details.',
      'Assign a category to each expense — categories can be managed in Settings.',
      'Use the search bar to find expenses by description or category.',
      'The total shown updates based on your current search filter.',
      'Delete an expense by clicking the trash icon on the right.',
    ],
  },
  settings: {
    title: 'Settings',
    bullets: [
      'Set your business name, logo, address and contact details.',
      'Your logo and business name appear on all PDF invoices and estimates.',
      'Set your invoice and estimate number prefixes (e.g. INV-, EST-).',
      'Add your banking details and terms & conditions for PDF footers.',
      'Configure your SMTP email settings to send invoices from your own email address.',
      "Use the color picker to change the app's accent colour.",
      'Click Send Test Email to verify your email settings are working.',
    ],
  },
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function HelpButton({ page }) {
  const [open, setOpen] = useState(false)
  const [dropPos, setDropPos] = useState({ top: 0, right: 16, width: 360 })
  const wrapRef = useRef(null)
  const btnRef  = useRef(null)
  const content = HELP[page]

  function handleToggle() {
    if (!open && btnRef.current) {
      const r   = btnRef.current.getBoundingClientRect()
      const vw  = window.innerWidth
      const w   = Math.min(360, vw - 32)
      // Right-align to button's right edge, but don't let left edge go off-screen
      const idealLeft = r.right - w
      const left      = Math.max(8, idealLeft)
      const right     = vw - left - w
      setDropPos({ top: r.bottom + 8, right: Math.max(0, right), width: w })
    }
    setOpen(o => !o)
  }

  // Close on click outside
  useEffect(() => {
    if (!open) return
    function onMouseDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    function onKeyDown(e) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  if (!content) return null

  return (
    <div ref={wrapRef} style={{ position: 'relative', flexShrink: 0 }}>

      {/* ── Trigger ─────────────────────────────────────────────────────────── */}
      <button
        ref={btnRef}
        data-tutorial="help-button"
        onClick={handleToggle}
        title={`Help — ${content.title}`}
        aria-label={`Help — ${content.title}`}
        style={{
          width:          28,
          height:         28,
          borderRadius:   '50%',
          border:         `1.5px solid ${open ? '#94a3b8' : '#cbd5e1'}`,
          background:     open ? '#f1f5f9' : '#fff',
          color:          '#64748b',
          fontSize:       13,
          fontWeight:     700,
          cursor:         'pointer',
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          lineHeight:     1,
          transition:     'border-color 0.15s, background 0.15s',
          flexShrink:     0,
        }}
        onMouseEnter={e => {
          e.currentTarget.style.borderColor = '#94a3b8'
          e.currentTarget.style.background  = '#f1f5f9'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.borderColor = open ? '#94a3b8' : '#cbd5e1'
          e.currentTarget.style.background  = open ? '#f1f5f9'  : '#fff'
        }}
      >
        ?
      </button>

      {/* ── Dropdown panel (position: fixed so it never clips off-screen) ───── */}
      {open && (
        <div
          role="dialog"
          aria-label={`Help — ${content.title}`}
          style={{
            position:     'fixed',
            top:          dropPos.top,
            right:        dropPos.right,
            zIndex:       1000,
            width:        dropPos.width,
            maxHeight:    420,
            overflowY:    'auto',
            background:   '#ffffff',
            borderRadius: 12,
            border:       '1px solid #e2e8f0',
            boxShadow:    '0 8px 32px rgba(15,23,42,0.13), 0 2px 8px rgba(15,23,42,0.07)',
          }}
        >
          {/* Header */}
          <div style={{
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'space-between',
            padding:        '13px 16px 11px',
            borderBottom:   '1px solid #f1f5f9',
            position:       'sticky',
            top:            0,
            background:     '#fff',
            borderRadius:   '12px 12px 0 0',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                width:          22,
                height:         22,
                borderRadius:   '50%',
                background:     '#f1f5f9',
                color:          '#64748b',
                fontSize:       11,
                fontWeight:     800,
                display:        'inline-flex',
                alignItems:     'center',
                justifyContent: 'center',
                flexShrink:     0,
              }}>?</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                Help — {content.title}
              </span>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close help"
              style={{
                background:  'none',
                border:      'none',
                cursor:      'pointer',
                color:       '#94a3b8',
                fontSize:    20,
                lineHeight:  1,
                padding:     '0 2px',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = '#475569' }}
              onMouseLeave={e => { e.currentTarget.style.color = '#94a3b8' }}
            >
              ×
            </button>
          </div>

          {/* Bullet list */}
          <ul style={{
            margin:    0,
            padding:   '14px 16px 16px 36px',
            listStyle: 'disc',
          }}>
            {content.bullets.map((bullet, i) => (
              <li
                key={i}
                style={{
                  fontSize:    13,
                  color:       '#334155',
                  lineHeight:  1.58,
                  marginBottom: i < content.bullets.length - 1 ? 9 : 0,
                }}
              >
                {bullet}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
