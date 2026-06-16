import { useState, useEffect, useRef, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { PdfPreviewModal } from '../pdf/PdfPreviewModal'
import { SendEmailModal } from '../components/SendEmailModal'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useTrialStatus } from '../context/TrialContext'
import { useRecurringNotif } from '../context/RecurringNotifContext'
import { useAppData } from '../context/AppDataContext'
import HelpButton from '../components/HelpButton'
import { generateReminderEmail, generatePaymentConfirmationEmail, PLAIN_TEXT_FOOTER } from '../lib/emailTemplates'
import { sendEmail } from '../lib/sendEmail'
import { buildPdfBuffer } from '../lib/pdfBuffer'
import { sendPdfViaWhatsApp, buildInvoiceWhatsAppMessage } from '../lib/whatsapp'
import { WhatsAppButton } from '../components/WhatsAppButton'
import useIsMobile from '../hooks/useIsMobile'

const READONLY_MSG = 'Your trial has ended. Upgrade to continue.'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n) => {
  const num = Number(n) || 0
  return 'R\u00a0' + num.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const todayStr = () => new Date().toISOString().slice(0, 10)

const addDays = (dateStr, days) => {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return ''   // guard: invalid input → don't crash
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

const calcNextSendDate = (dateStr, interval) => {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return ''
  if      (interval === 'daily')   d.setDate(d.getDate() + 1)
  else if (interval === 'weekly')  d.setDate(d.getDate() + 7)
  else if (interval === 'monthly') d.setMonth(d.getMonth() + 1)
  else if (interval === 'yearly')  d.setFullYear(d.getFullYear() + 1)
  return d.toISOString().slice(0, 10)
}

const STATUS_META = {
  draft:   { label: 'Draft',   bg: '#f1f5f9', color: '#475569' },
  sent:    { label: 'Sent',    bg: '#dbeafe', color: '#1d4ed8' },
  paid:    { label: 'Paid',    bg: '#dcfce7', color: '#15803d' },
  overdue: { label: 'Overdue', bg: '#fee2e2', color: '#dc2626' },
}

function StatusBadge({ status }) {
  const m = STATUS_META[status] || STATUS_META.draft
  return (
    <span style={{
      display: 'inline-block', padding: '3px 10px', borderRadius: 20,
      fontSize: 12, fontWeight: 600, background: m.bg, color: m.color,
    }}>{m.label}</span>
  )
}

function UndoButton({ onClick, title }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '3px 9px', borderRadius: 20, fontSize: 12, fontWeight: 600,
        border: '1px solid #cbd5e1', background: '#fff', color: '#64748b',
        cursor: 'pointer', fontFamily: 'inherit',
      }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
      </svg>
      Undo
    </button>
  )
}

function RevertConfirmModal({ message, onConfirm, onCancel, confirming }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3200 }}>
      <div style={{ background: '#fff', borderRadius: 14, padding: 28, width: 380, maxWidth: '92vw', boxShadow: '0 20px 60px rgba(0,0,0,0.18)' }}>
        <h3 style={{ margin: '0 0 10px', fontSize: 17, fontWeight: 700, color: '#0f172a' }}>Revert Status?</h3>
        <p style={{ color: '#64748b', fontSize: 14, marginBottom: 22 }}>{message}</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} disabled={confirming} style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 600, fontSize: 14, cursor: confirming ? 'not-allowed' : 'pointer' }}>Cancel</button>
          <button onClick={onConfirm} disabled={confirming} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: '#64748b', color: '#fff', fontWeight: 600, fontSize: 14, cursor: confirming ? 'not-allowed' : 'pointer', opacity: confirming ? 0.7 : 1 }}>
            {confirming ? 'Reverting…' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Mobile Invoice Card ──────────────────────────────────────────────────────

function MobileInvoiceCard({ inv, onSelect, onOpenReminder, onMarkPaid, onDelete, isReadOnly }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)
  const isOverdueBell = inv.status !== 'paid' && inv.status !== 'draft' && inv.due_date && inv.due_date < todayStr()

  useEffect(() => {
    const fn = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false) }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [])

  const menuItems = [
    { label: 'View / Edit',  fn: () => { setMenuOpen(false); onSelect(inv) } },
    !isReadOnly && inv.status !== 'paid' && { label: 'Mark as Paid',  fn: () => { setMenuOpen(false); onMarkPaid(inv) } },
    { label: 'Send Invoice',  fn: () => { setMenuOpen(false); onSelect(inv) } },
    { label: 'Download PDF',  fn: () => { setMenuOpen(false); onSelect(inv) } },
    !isReadOnly && { label: 'Delete', fn: () => { setMenuOpen(false); onDelete(inv) }, danger: true },
  ].filter(Boolean)

  return (
    <div
      onClick={() => onSelect(inv)}
      style={{
        background: '#fff', borderRadius: 8,
        boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
        border: '1px solid #f1f5f9',
        padding: 16, marginBottom: 10,
        position: 'relative', cursor: 'pointer',
      }}
    >
      {/* ── Top row: invoice # + bell + three-dot menu ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{inv.invoice_number}</span>
          {isOverdueBell && (
            <span
              onClick={e => { e.stopPropagation(); onOpenReminder(inv) }}
              title="Send payment reminder"
              style={{ fontSize: 14, color: '#d97706', cursor: 'pointer', lineHeight: 1 }}
            >🔔</span>
          )}
        </div>

        {/* Three-dot menu */}
        <div ref={menuRef} style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
          <button
            onClick={e => { e.stopPropagation(); setMenuOpen(o => !o) }}
            aria-label="More actions"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '4px 8px', borderRadius: 6,
              color: '#94a3b8', fontSize: 20, lineHeight: 1,
              letterSpacing: 2,
            }}
          >···</button>

          {menuOpen && (
            <div style={{
              position: 'absolute', right: 0, top: '100%', zIndex: 200,
              background: '#fff', borderRadius: 10,
              boxShadow: '0 4px 24px rgba(0,0,0,0.14)',
              border: '1px solid #e2e8f0',
              minWidth: 168, overflow: 'hidden', marginTop: 4,
            }}>
              {menuItems.map(item => (
                <button
                  key={item.label}
                  onClick={item.fn}
                  style={{
                    display: 'block', width: '100%',
                    padding: '12px 16px',
                    background: 'none', border: 'none',
                    cursor: 'pointer', textAlign: 'left',
                    fontSize: 14, fontWeight: 500,
                    color: item.danger ? '#dc2626' : '#0f172a',
                    fontFamily: 'inherit',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = item.danger ? '#fef2f2' : '#f8fafc' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
                >{item.label}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Client name ── */}
      <div style={{ fontSize: 13, color: '#64748b', marginBottom: 8 }}>
        {inv.client_name || inv.client_company || '—'}
      </div>

      {/* ── Amount + due date ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--primary, #14b8a6)' }}>{fmt(inv.total)}</span>
        {inv.due_date && (
          <span style={{ fontSize: 12, color: '#94a3b8' }}>Due {inv.due_date}</span>
        )}
      </div>

      {/* ── Status badge ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <StatusBadge status={inv.status} />
        {inv.status === 'paid' && inv.payment_date && (
          <span style={{ fontSize: 12, fontWeight: 600, color: '#15803d' }}>Paid: {inv.payment_date}</span>
        )}
      </div>
    </div>
  )
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ message, type = 'success', onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2800)
    return () => clearTimeout(t)
  }, [onDone])
  const bg = type === 'error' ? '#ef4444' : '#10b981'
  return (
    <div style={{
      position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
      background: bg, color: '#fff', padding: '11px 22px', borderRadius: 10,
      fontWeight: 600, fontSize: 14, boxShadow: '0 4px 20px rgba(0,0,0,0.18)',
      zIndex: 9999, animation: 'fadeSlideUp 0.25s ease',
    }}>{message}</div>
  )
}

// ─── Add Client Modal ─────────────────────────────────────────────────────────

function AddClientModal({ onClose, onCreated }) {
  const { user } = useAuth()
  const [form, setForm] = useState({ company_name: '', email: '', phone: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    if (!form.company_name.trim()) { setError('Name / Company is required.'); return }
    setSaving(true)
    try {
      const bizName = form.company_name.trim()
      const { data, error: err } = await supabase
        .from('clients')
        .insert({
          name: bizName,
          company_name: bizName,
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          user_id: user.id,
        })
        .select()
        .single()
      setSaving(false)
      if (err) setError(err.message)
      else onCreated(data)
    } catch (e) { setSaving(false); setError(e.message) }
  }

  const inp = (field) => ({
    value: form[field],
    onChange: e => setForm(p => ({ ...p, [field]: e.target.value })),
    style: { width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: 14, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#0f172a', outline: 'none', boxSizing: 'border-box' },
  })

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000 }}
      onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: '#fff', borderRadius: 14, padding: 28, width: 400, boxShadow: '0 20px 60px rgba(0,0,0,0.18)' }}>
        <h3 style={{ margin: '0 0 18px', fontSize: 17, fontWeight: 700, color: '#0f172a' }}>New Client</h3>
        {error && <p style={{ color: '#dc2626', fontSize: 13, marginBottom: 12 }}>{error}</p>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div><label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 5 }}>Name / Company *</label><input {...inp('company_name')} placeholder="Client or company name" /></div>
          <div><label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 5 }}>Email</label><input {...inp('email')} type="email" placeholder="email@example.com" /></div>
          <div><label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 5 }}>Phone</label><input {...inp('phone')} placeholder="+27 ..." /></div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 22, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: '#14b8a6', color: '#fff', fontWeight: 600, fontSize: 14, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>{saving ? 'Saving…' : 'Create Client'}</button>
        </div>
      </div>
    </div>
  )
}

// ─── Client Selector ──────────────────────────────────────────────────────────

function ClientSelector({ clients, value, onChange, onAddNewClient }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef(null)

  const selected = clients.find(c => c.id === value)
  const filtered = query.trim()
    ? clients.filter(c => (c.name || '').toLowerCase().includes(query.toLowerCase()) || (c.company_name || '').toLowerCase().includes(query.toLowerCase()))
    : clients

  useEffect(() => {
    const fn = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div onClick={() => { setOpen(o => !o); setQuery('') }}
        style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#f8fafc', color: selected ? '#0f172a' : '#94a3b8', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', userSelect: 'none', minHeight: 40 }}>
        <span>{selected ? (selected.company_name || selected.name) : 'Select client…'}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
      </div>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, boxShadow: '0 8px 30px rgba(0,0,0,0.12)', marginTop: 4, overflow: 'hidden' }}>
          <div style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9' }}>
            <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search clients…"
              style={{ width: '100%', padding: '7px 10px', borderRadius: 7, fontSize: 13, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#0f172a', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div style={{ maxHeight: 220, overflowY: 'auto' }}>
            {filtered.map(c => (
              <div key={c.id} onMouseDown={() => { onChange(c.id); setOpen(false) }}
                style={{ padding: '10px 14px', cursor: 'pointer', fontSize: 14, color: '#0f172a', background: value === c.id ? '#f0fdfa' : '#fff' }}
                onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                onMouseLeave={e => e.currentTarget.style.background = value === c.id ? '#f0fdfa' : '#fff'}>
                <div style={{ fontWeight: 600 }}>{c.name}</div>
                {c.company_name && <div style={{ fontSize: 12, color: '#94a3b8' }}>{c.company_name}</div>}
              </div>
            ))}
            {filtered.length === 0 && <div style={{ padding: '10px 14px', fontSize: 13, color: '#94a3b8' }}>No clients found</div>}
          </div>
          <div onMouseDown={() => { setOpen(false); onAddNewClient() }}
            style={{ padding: '10px 14px', borderTop: '1px solid #f1f5f9', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#14b8a6' }}
            onMouseEnter={e => e.currentTarget.style.background = '#f0fdfa'}
            onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
            + Add New Client
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Autocomplete Input ───────────────────────────────────────────────────────

function AutocompleteInput({ value, onChange, catalog, placeholder }) {
  const [focused, setFocused] = useState(false)
  const ref = useRef(null)

  const suggestions = value.trim()
    ? catalog.filter(i => i.name.toLowerCase().includes(value.toLowerCase()) || (i.description || '').toLowerCase().includes(value.toLowerCase())).slice(0, 8)
    : []

  return (
    <div ref={ref} style={{ position: 'relative', flex: 1 }}>
      <input value={value} onChange={e => onChange(e.target.value, null)}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        placeholder={placeholder}
        style={{ width: '100%', padding: '7px 10px', borderRadius: 7, fontSize: 13, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#0f172a', outline: 'none', boxSizing: 'border-box' }} />
      {focused && suggestions.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 300, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 9, boxShadow: '0 8px 24px rgba(0,0,0,0.1)', marginTop: 3, overflow: 'hidden' }}>
          {suggestions.map(item => (
            <div key={item.id} onMouseDown={() => onChange(item.name, item)}
              style={{ padding: '9px 12px', cursor: 'pointer', fontSize: 13, color: '#0f172a' }}
              onMouseEnter={e => e.currentTarget.style.background = '#f0fdfa'}
              onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
              <div style={{ fontWeight: 600 }}>{item.name}</div>
              {item.description && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 1 }}>{item.description}</div>}
              <div style={{ fontSize: 12, color: '#14b8a6', marginTop: 1 }}>{fmt(item.unit_price)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Payment Method Modal ─────────────────────────────────────────────────────

const DEFAULT_METHODS = ['Cash', 'EFT / Bank Transfer', 'Credit Card', 'Debit Card']

function PaymentMethodModal({ methods, defaultMethod, onConfirm, onCancel }) {
  const [selected, setSelected] = useState(defaultMethod || methods[0] || '')
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000,
    }} onMouseDown={e => e.target === e.currentTarget && onCancel()}>
      <div style={{ background: '#fff', borderRadius: 14, padding: 28, width: 360, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <h3 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 700, color: '#0f172a' }}>Mark as Paid</h3>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: '#64748b' }}>Select the payment method used.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
          {methods.map(m => (
            <label key={m} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, border: `1.5px solid ${selected === m ? '#14b8a6' : '#e2e8f0'}`, background: selected === m ? '#f0fdfa' : '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 500, color: '#0f172a' }}>
              <input type="radio" name="payMethod" value={m} checked={selected === m} onChange={() => setSelected(m)} style={{ accentColor: '#14b8a6' }} />
              {m}
            </label>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>Cancel</button>
          <button onClick={() => onConfirm(selected)} style={{ padding: '9px 22px', borderRadius: 8, border: 'none', background: '#15803d', color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>Confirm Payment</button>
        </div>
      </div>
    </div>
  )
}

// ─── Mark as Paid — Thank You Email Modal ─────────────────────────────────────

function MarkAsPaidEmailModal({ invoiceNumber, amount, clientName, clientEmail, businessName, saving, onConfirm, onCancel }) {
  const hasEmail = !!(clientEmail && clientEmail.trim())

  const buildDefaultMessage = () => [
    `Dear ${clientName || 'Valued Client'},`,
    '',
    `Thank you for your payment of ${fmt(amount)} for invoice ${invoiceNumber}.`,
    '',
    'Your payment has been received and your invoice has been marked as paid.',
    '',
    'Thank you for your business — we look forward to working with you again.',
    '',
    'Kind regards,',
    businessName || '',
  ].join('\n')

  const [sendEmailFlag, setSendEmailFlag] = useState(hasEmail)
  const [to,      setTo]      = useState(clientEmail || '')
  const [subject, setSubject] = useState(`Payment Received — Invoice ${invoiceNumber}`)
  const [message, setMessage] = useState(buildDefaultMessage)
  const [paymentDate, setPaymentDate] = useState(todayStr())

  // Escape key
  useEffect(() => {
    const fn = e => { if (e.key === 'Escape' && !saving) onCancel() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [saving, onCancel])

  const iStyle = {
    width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: 14,
    border: '1px solid #e2e8f0', background: '#f8fafc', color: '#0f172a',
    outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3100,
    }} onMouseDown={e => e.target === e.currentTarget && !saving && onCancel()}>
      <div style={{
        background: '#fff', borderRadius: 14, width: 520, maxWidth: '92vw',
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        display: 'flex', flexDirection: 'column', maxHeight: '88vh',
      }}>
        {/* Header */}
        <div style={{ padding: '16px 22px', borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>Mark Invoice as Paid</h2>
        </div>

        {/* Body */}
        <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto', flex: 1 }}>
          <p style={{ margin: 0, fontSize: 14, color: '#334155', lineHeight: 1.6 }}>
            Mark invoice <strong>{invoiceNumber}</strong> for <strong>{clientName || 'this client'}</strong> as paid?
          </p>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 5 }}>Payment Date</label>
            <input value={paymentDate} onChange={e => setPaymentDate(e.target.value)} type="date" style={iStyle} />
          </div>

          {hasEmail && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, fontWeight: 500, color: '#0f172a', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={sendEmailFlag}
                onChange={e => setSendEmailFlag(e.target.checked)}
                style={{ accentColor: '#14b8a6', width: 16, height: 16 }}
              />
              Send payment confirmation email to {clientEmail}
            </label>
          )}

          {hasEmail && sendEmailFlag && (
            <>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 5 }}>To</label>
                <input value={to} onChange={e => setTo(e.target.value)} type="email" placeholder="client@example.com" style={iStyle} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 5 }}>Subject</label>
                <input value={subject} onChange={e => setSubject(e.target.value)} style={iStyle} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 5 }}>Message</label>
                <textarea value={message} onChange={e => setMessage(e.target.value)} rows={9}
                  style={{ ...iStyle, resize: 'vertical', lineHeight: 1.6 }} />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 22px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: 10, justifyContent: 'flex-end', flexShrink: 0 }}>
          <button onClick={onCancel} disabled={saving}
            style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 600, fontSize: 14, cursor: saving ? 'not-allowed' : 'pointer' }}>
            Cancel
          </button>
          <button
            onClick={() => onConfirm({ sendEmail: hasEmail && sendEmailFlag, to: to.trim(), subject: subject.trim(), message: message.trim(), paymentDate })}
            disabled={saving}
            style={{ padding: '9px 22px', borderRadius: 8, border: 'none', background: '#16a34a', color: '#fff', fontWeight: 600, fontSize: 14, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Marking…' : 'Mark as Paid'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Invoice Form ─────────────────────────────────────────────────────────────

const newLine = () => ({ _key: Math.random().toString(36).slice(2), item_name: '', description: '', quantity: 1, unit_price: '', _catalogId: null })

function InvoiceForm({ invoice, clients, catalog, settings, onBack, onSaved, onDeleted, isReadOnly }) {
  const { user } = useAuth()
  const { dismissNotification } = useRecurringNotif()
  const { refreshClients, refreshCatalog } = useAppData()
  const navigate = useNavigate()
  const isNew = !invoice

  const payTermsDays = settings?.payment_terms_days ?? 7

  const [form, setForm] = useState(() => {
    const issueDate    = invoice?.issue_date || todayStr()
    const termsDays    = settings?.payment_terms_days ?? 7
    return {
      invoice_number: invoice?.invoice_number || '',
      client_id:      invoice?.client_id || '',
      issue_date:     issueDate,
      due_date:       invoice?.due_date || addDays(issueDate, termsDays),
      notes:          invoice?.notes || '',
      vat_enabled:    invoice?.vat_enabled ?? false,
      amount_paid:    invoice?.amount_paid ?? 0,
      status:         invoice?.status || 'draft',
      payment_date:    invoice?.payment_date || '',
      previous_status: invoice?.previous_status || null,
    }
  })

  const [lineItems, setLineItems] = useState(() =>
    invoice?.items?.length
      ? invoice.items.map(i => ({ _key: Math.random().toString(36).slice(2), ...i }))
      : [newLine()]
  )

  const [saving, setSaving]           = useState(false)
  const [markingPaid, setMarkingPaid] = useState(false)
  const [errors, setErrors]           = useState({})
  const [showAddClient, setShowAddClient]   = useState(false)
  const [extraClients, setExtraClients]     = useState([])
  const [confirmDelete, setConfirmDelete]   = useState(false)
  const [deleting, setDeleting]             = useState(false)
  const [showPayModal, setShowPayModal]     = useState(false)
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [pendingPaymentMethod, setPendingPaymentMethod] = useState(null)
  const [showMarkPaidEmailModal, setShowMarkPaidEmailModal] = useState(false)
  const [sendingPaymentEmail, setSendingPaymentEmail] = useState(false)
  const [undoTarget, setUndoTarget] = useState(null) // 'paid' | 'sent' | null
  const [undoing, setUndoing] = useState(false)
  const [waLoading, setWaLoading] = useState(false)
  const [waToast, setWaToast] = useState(null)
  const [sourceEstimate,    setSourceEstimate]    = useState(null) // { id, estimate_number, previous_status }
  const [undoConvert,       setUndoConvert]       = useState(false)
  const [undoingConvert,    setUndoingConvert]    = useState(false)

  const selectedClient = [...clients, ...extraClients].find(c => c.id === form.client_id)

  // Generate next invoice number for new invoices.
  // Uses the cached profile from AppDataContext — no extra Supabase call needed.
  useEffect(() => {
    if (!isNew || form.invoice_number) return
    async function genNumber() {
      const { data: existing } = await supabase
        .from('invoices').select('invoice_number').eq('user_id', user.id)
      const prefix = settings?.invoice_prefix || 'INV-'
      const start  = settings?.starting_invoice_number || 1
      const rows   = existing ?? []

      // Build a Set of all numbers already in the database so we can skip them
      const usedSet = new Set(rows.map(inv => inv.invoice_number))

      // Find the highest trailing number across all existing invoices
      const maxNum = rows.reduce((max, inv) => {
        const match = (inv.invoice_number || '').match(/(\d+)$/)
        return match ? Math.max(max, parseInt(match[1], 10)) : max
      }, 0)

      // Walk forward from max+1 until we find a number not yet in the database
      let seq = maxNum > 0 ? maxNum + 1 : start
      let candidate = `${prefix}${String(seq).padStart(4, '0')}`
      while (usedSet.has(candidate)) {
        seq++
        candidate = `${prefix}${String(seq).padStart(4, '0')}`
      }

      setForm(p => ({ ...p, invoice_number: candidate }))
    }
    genNumber()
  }, [])

  // Sync status and amount_paid when the invoice prop updates (e.g. after mark-as-sent/paid)
  useEffect(() => {
    if (invoice) {
      setForm(p => ({
        ...p,
        status:          invoice.status,
        amount_paid:     invoice.amount_paid ?? 0,
        payment_date:    invoice.payment_date || '',
        previous_status: invoice.previous_status || null,
      }))
    }
  }, [invoice?.status, invoice?.amount_paid, invoice?.payment_date, invoice?.previous_status])

  // Reverse-lookup: find the estimate this invoice was converted from (if any)
  useEffect(() => {
    if (isNew || !invoice?.id) return
    let cancelled = false
    supabase
      .from('estimates')
      .select('id, estimate_number, previous_status')
      .eq('converted_invoice_id', invoice.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setSourceEstimate(data ?? null)
      })
    return () => { cancelled = true }
  }, [isNew, invoice?.id])

  // VAT-inclusive: unit_price is the price the client pays (VAT already inside)
  const grossTotal = lineItems.reduce((s, li) => s + (Number(li.quantity) || 0) * (Number(li.unit_price) || 0), 0)
  const subtotal   = form.vat_enabled ? grossTotal / 1.15 : grossTotal
  const vatAmount  = form.vat_enabled ? grossTotal - subtotal : 0
  const total      = grossTotal
  const balanceDue = Math.max(0, total - (Number(form.amount_paid) || 0))

  function setField(k, v) {
    setForm(p => {
      const next = { ...p, [k]: v }
      // Auto-update due_date when issue_date changes (new invoices only).
      // Only apply when addDays returns a valid date — the input may be empty
      // mid-edit (e.g. while the user is navigating the date picker).
      if (k === 'issue_date' && isNew) {
        const newDue = addDays(v, payTermsDays)
        if (newDue) next.due_date = newDue
      }
      return next
    })
  }

  function updateLine(key, field, value) {
    setLineItems(prev => prev.map(li => li._key !== key ? li : { ...li, [field]: value }))
  }

  function selectCatalogItem(key, item) {
    setLineItems(prev => prev.map(li => li._key !== key ? li : {
      ...li, item_name: item.name, description: item.description || '', unit_price: item.unit_price, _catalogId: item.id,
    }))
  }

  async function handleDescriptionBlur(key, value) {
    const li = lineItems.find(l => l._key === key)
    if (!li?._catalogId) return
    await supabase.from('items').update({ description: value || null }).eq('id', li._catalogId).eq('user_id', user.id)
  }

  function addLine()         { setLineItems(p => [...p, newLine()]) }
  function removeLine(key)   { setLineItems(p => p.filter(li => li._key !== key)) }

  function validate() {
    const errs = {}
    if (!form.client_id)  errs.client_id  = 'Select a client.'
    if (!form.issue_date) errs.issue_date  = 'Required.'
    if (!form.due_date)   errs.due_date    = 'Required.'
    if (!lineItems.some(li => li.item_name.trim())) errs.items = 'Add at least one line item.'
    return errs
  }

  async function handleSave(overrideStatus) {
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }

    // Duplicate-number guard: reject if this number already exists on a DIFFERENT invoice
    const { data: clash } = await supabase
      .from('invoices')
      .select('id')
      .eq('user_id', user.id)
      .eq('invoice_number', form.invoice_number)
      .limit(1)
    const clashId = clash?.[0]?.id
    if (clashId && clashId !== invoice?.id) {
      setErrors({ _global: `Invoice number ${form.invoice_number} is already in use. Please choose a different number.` })
      return
    }

    setSaving(true)
    setErrors({})

    const payload = {
      invoice_number: form.invoice_number,
      client_id:      form.client_id || null,
      issue_date:     form.issue_date,
      due_date:       form.due_date,
      notes:          form.notes || null,
      vat_enabled:    form.vat_enabled,
      vat_rate:       form.vat_enabled ? 15 : 0,
      subtotal,
      vat_amount:     vatAmount,
      total,
      amount_paid:    Number(form.amount_paid) || 0,
      status:         overrideStatus || form.status,
    }

    if (overrideStatus && overrideStatus !== form.status) {
      payload.previous_status = form.status
    }

    const items = lineItems
      .filter(li => li.item_name.trim())
      .map(li => ({
        item_name:   li.item_name,
        description: li.description || null,
        quantity:    Number(li.quantity) || 1,
        unit_price:  Number(li.unit_price) || 0,
        line_total:  (Number(li.quantity) || 1) * (Number(li.unit_price) || 0),
      }))

    // Auto-save new catalog items — then refresh the in-memory catalog so
    // autocomplete suggestions update immediately without a page reload.
    const catalogNames = new Set(catalog.map(c => c.name.toLowerCase()))
    let catalogChanged = false
    for (const li of items) {
      if (li.item_name.trim() && !catalogNames.has(li.item_name.toLowerCase())) {
        const { error: itemErr } = await supabase.from('items').insert({
          name: li.item_name, description: li.description || null,
          unit_price: li.unit_price, user_id: user.id,
        })
        if (!itemErr) catalogChanged = true
      }
    }
    if (catalogChanged) refreshCatalog()

    try {
      let invoiceId
      if (isNew) {
        const { data, error } = await supabase
          .from('invoices')
          .insert({ ...payload, user_id: user.id })
          .select()
          .single()
        if (error) throw new Error(error.message)
        invoiceId = data.id
      } else {
        const { error } = await supabase
          .from('invoices')
          .update(payload)
          .eq('id', invoice.id)
          .eq('user_id', user.id)
        if (error) throw new Error(error.message)
        invoiceId = invoice.id
        // Replace all line items
        const { error: delErr } = await supabase
          .from('invoice_items')
          .delete()
          .eq('invoice_id', invoiceId)
        if (delErr) throw new Error(delErr.message)
      }

      if (items.length > 0) {
        const { error: itemsErr } = await supabase
          .from('invoice_items')
          .insert(items.map(i => ({ ...i, invoice_id: invoiceId })))
        if (itemsErr) throw new Error(itemsErr.message)
      }

      setSaving(false)
      // Auto-dismiss the recurring-invoice notification when the invoice is marked as sent
      if (!isNew && payload.status === 'sent' && invoice?.from_recurring) {
        dismissNotification(invoice.id)
      }
      onSaved({ id: invoiceId, ...payload })
    } catch (e) {
      setSaving(false)
      setErrors({ _global: e.message })
    }
  }

  async function confirmMarkAsPaid(paymentMethod, paymentDate) {
    setShowPayModal(false)
    setMarkingPaid(true)
    const payDate = paymentDate || todayStr()
    try {
      const { error } = await supabase
        .from('invoices')
        .update({
          status:          'paid',
          payment_method:  paymentMethod,
          paid_at:         new Date().toISOString(),
          amount_paid:     total,
          payment_date:    payDate,
          previous_status: form.status,
        })
        .eq('id', invoice.id)
        .eq('user_id', user.id)
      setMarkingPaid(false)
      if (error) throw new Error(error.message)
      onSaved({ id: invoice.id, status: 'paid', amount_paid: total, payment_date: payDate, previous_status: form.status })
    } catch (e) {
      setMarkingPaid(false)
      setErrors({ _global: e.message })
    }
  }

  // Called from the "Mark Invoice as Paid" thank-you-email modal. Marks the
  // invoice as paid (unchanged logic above), then optionally sends a payment
  // confirmation email via the user's configured SMTP/relay.
  async function handleConfirmMarkPaidWithEmail({ sendEmail: shouldSend, to, subject, message, paymentDate }) {
    setShowMarkPaidEmailModal(false)
    const paymentMethod = pendingPaymentMethod
    setPendingPaymentMethod(null)
    await confirmMarkAsPaid(paymentMethod, paymentDate)

    if (!shouldSend) return

    setSendingPaymentEmail(true)
    try {
      const businessName  = settings?.business_name || ''
      const businessEmail = settings?.email || settings?.smtp_user || ''
      const smtp = {
        host:      settings?.smtp_host      || '',
        port:      settings?.smtp_port      || '587',
        user:      settings?.smtp_user      || '',
        password:  settings?.smtp_password  || '',
        from_name: settings?.smtp_from_name || businessName || '',
      }
      if (!to || !smtp.host || !smtp.user || !smtp.password) return

      const html = generatePaymentConfirmationEmail({
        businessName,
        businessEmail,
        businessPhone: settings?.phone    || '',
        logoUrl:       settings?.logo_url || settings?.logo_path || '',
        primaryColor:  settings?.primary_color || '#14b8a6',
        clientName:    selectedClient?.company_name || selectedClient?.name || '',
        invoiceNumber: form.invoice_number,
        amount:        total,
        customMessage: message,
      })

      // Build a PDF of the now-paid invoice (with PAID watermark) to attach
      const pdfData = {
        ...(invoice || {}),
        invoice_number: form.invoice_number,
        issue_date:     form.issue_date,
        due_date:       form.due_date,
        notes:          form.notes,
        vat_enabled:    form.vat_enabled,
        vat_rate:       form.vat_enabled ? 15 : 0,
        subtotal,
        vat_amount:     vatAmount,
        total,
        amount_paid:    total,
        status:         'paid',
        payment_date:   paymentDate || todayStr(),
        client_name:    selectedClient?.name || '',
        client_company: selectedClient?.company_name || '',
        client_email:   selectedClient?.email || '',
        client_phone:   selectedClient?.phone || '',
        client_address: selectedClient?.address || '',
        items:          lineItems.filter(li => li.item_name.trim()),
      }
      let pdfBuffer
      try {
        pdfBuffer = await buildPdfBuffer(pdfData, settings, 'INVOICE')
      } catch (_) {
        pdfBuffer = undefined
      }

      await sendEmail({
        to,
        subject,
        message: message + PLAIN_TEXT_FOOTER,
        html,
        smtpHost:      smtp.host,
        smtpPort:      parseInt(smtp.port || '587', 10) || 587,
        smtpUser:      smtp.user,
        smtpPassword:  smtp.password,
        smtpFromName:  smtp.from_name,
        smtpFromEmail: smtp.user,
        pdfBuffer,
        fileName: `Invoice-${form.invoice_number || 'paid'}.pdf`,
      })
    } catch (_) {
      // Non-fatal — the invoice has already been marked as paid.
    } finally {
      setSendingPaymentEmail(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      const { error } = await supabase
        .from('invoices')
        .delete()
        .eq('id', invoice.id)
        .eq('user_id', user.id)
      setDeleting(false)
      if (error) setErrors({ _global: error.message })
      else onDeleted()
    } catch (e) { setDeleting(false); setErrors({ _global: e.message }) }
  }

  async function handleUndo() {
    if (!undoTarget) return
    setUndoing(true)
    try {
      const revertPayload = { status: form.previous_status, previous_status: null }
      if (undoTarget === 'paid') {
        revertPayload.payment_date   = null
        revertPayload.payment_method = null
      } else if (undoTarget === 'sent') {
        revertPayload.sent_from_app = false
      }
      const { error } = await supabase
        .from('invoices')
        .update(revertPayload)
        .eq('id', invoice.id)
        .eq('user_id', user.id)
      setUndoing(false)
      setUndoTarget(null)
      if (error) { setErrors({ _global: error.message }); return }
      onSaved({ id: invoice.id, ...revertPayload })
    } catch (e) {
      setUndoing(false)
      setErrors({ _global: e.message })
    }
  }

  async function handleUndoConvert() {
    if (!sourceEstimate) return
    setUndoingConvert(true)
    try {
      // Delete the invoice (cascade removes invoice_items via FK)
      const { error: delErr } = await supabase
        .from('invoices')
        .delete()
        .eq('id', invoice.id)
        .eq('user_id', user.id)
      if (delErr) throw new Error(delErr.message)

      // Revert the estimate back to its pre-conversion status
      const revertStatus = sourceEstimate.previous_status || 'approved'
      const { error: estErr } = await supabase
        .from('estimates')
        .update({ status: revertStatus, converted_invoice_id: null, previous_status: null })
        .eq('id', sourceEstimate.id)
      if (estErr) throw new Error(estErr.message)

      setUndoingConvert(false)
      setUndoConvert(false)
      // Navigate to Estimates and open the reverted estimate
      navigate('/estimates', { state: { openId: sourceEstimate.id } })
    } catch (e) {
      setUndoingConvert(false)
      setErrors({ _global: e.message })
    }
  }

  async function handleSendWhatsApp() {
    if (waLoading) return
    setWaToast(null)
    setWaLoading(true)
    try {
      const pdfData = {
        ...(invoice || {}),
        invoice_number: form.invoice_number,
        issue_date:     form.issue_date,
        due_date:       form.due_date,
        notes:          form.notes,
        vat_enabled:    form.vat_enabled,
        vat_rate:       form.vat_enabled ? 15 : 0,
        subtotal,
        vat_amount:     vatAmount,
        total,
        amount_paid:    Number(form.amount_paid) || 0,
        status:         form.status,
        payment_date:   form.payment_date,
        client_name:    selectedClient?.name || '',
        client_company: selectedClient?.company_name || '',
        client_email:   selectedClient?.email || '',
        client_phone:   selectedClient?.phone || '',
        client_address: selectedClient?.address || '',
        items:          lineItems.filter(li => li.item_name.trim()),
      }

      let arrayBuffer
      try {
        arrayBuffer = await buildPdfBuffer(pdfData, settings, 'INVOICE')
      } catch {
        setWaToast({ message: 'Could not generate PDF. Please try again.', type: 'error' })
        setWaLoading(false)
        return
      }

      const blob         = new Blob([arrayBuffer], { type: 'application/pdf' })
      const filename     = `Invoice-${form.invoice_number || 'draft'}.pdf`
      const businessName = settings?.business_name || ''
      const clientName   = selectedClient?.company_name || selectedClient?.name || 'there'
      const message = buildInvoiceWhatsAppMessage({
        clientName,
        invoiceNumber: form.invoice_number,
        amount:        fmt(total),
        dueDate:       form.due_date,
        businessName,
      })

      const result = await sendPdfViaWhatsApp({
        blob, filename, message,
        phone: selectedClient?.phone,
        title: `Invoice ${form.invoice_number} from ${businessName}`,
      })

      if (result.status === 'fallback') {
        setWaToast({ message: 'Your PDF has been downloaded. Attach it to the WhatsApp message.', type: 'success' })
      }
    } catch (e) {
      setWaToast({ message: e.message || 'Could not open WhatsApp. Please check your browser settings.', type: 'error' })
    }
    setWaLoading(false)
  }

  const [pdfOpen, setPdfOpen] = useState(false)
  const isMobile = useIsMobile()

  const isPaid    = form.status === 'paid'
  const isOverdue = form.status === 'overdue'

  const btnStyle = (bg, color = '#fff') => ({
    padding: '9px 18px', borderRadius: 8, border: 'none', background: bg,
    color, fontWeight: 600, fontSize: 13, cursor: saving || markingPaid ? 'not-allowed' : 'pointer',
    opacity: saving || markingPaid ? 0.7 : 1,
  })

  const inputStyle = (hasErr) => ({
    width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: 14,
    border: `1px solid ${hasErr ? '#ef4444' : '#e2e8f0'}`, background: '#f8fafc',
    color: '#0f172a', outline: 'none', boxSizing: 'border-box',
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#f8fafc' }}>

      {/* ── Header bar ── */}
      <div style={{
        background: '#fff', borderBottom: '1px solid #e2e8f0',
        padding: isMobile ? '12px 16px' : '14px 28px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 10 : 14, minWidth: 0, flex: 1 }}>
          <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center', gap: 5, fontSize: 14, fontWeight: 600, flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            Back
          </button>
          <span style={{ color: '#e2e8f0', fontWeight: 300 }}>|</span>
          <h2 style={{ fontSize: isMobile ? 15 : 16, fontWeight: 700, color: '#0f172a', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {isNew ? 'New Invoice' : `Invoice ${form.invoice_number}`}
          </h2>
          {!isNew && (
            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'flex-start' : 'center', gap: isMobile ? 4 : 8, flexShrink: 0 }}>
              <StatusBadge status={form.status} />
              {form.status === 'paid' && form.previous_status && (
                <UndoButton title="Undo Mark as Paid" onClick={() => setUndoTarget('paid')} />
              )}
              {form.status === 'sent' && form.previous_status && (
                <UndoButton title="Undo Mark as Sent" onClick={() => setUndoTarget('sent')} />
              )}
              {isPaid && form.payment_date && (
                <span style={{ fontSize: 12, fontWeight: 600, color: '#15803d' }}>Paid on: {form.payment_date}</span>
              )}
              {sourceEstimate && (
                <>
                  <span
                    onClick={() => navigate('/estimates', { state: { openId: sourceEstimate.id } })}
                    title={`View estimate ${sourceEstimate.estimate_number}`}
                    style={{
                      fontSize: 12, fontWeight: 600, color: '#7c3aed',
                      cursor: 'pointer', textDecoration: 'underline',
                      textDecorationStyle: 'dotted',
                    }}
                  >
                    from approved {sourceEstimate.estimate_number}
                  </span>
                  <UndoButton title="Undo Convert to Invoice" onClick={() => setUndoConvert(true)} />
                </>
              )}
            </div>
          )}
        </div>

        {/* Desktop: full action buttons in header */}
        {!isMobile && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {errors._global && <span style={{ color: '#ef4444', fontSize: 13 }}>{errors._global}</span>}
            {isReadOnly && (
              <span style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', background: '#f1f5f9', borderRadius: 6, padding: '4px 10px' }}>
                View only
              </span>
            )}
            {!isNew && (
              <button onClick={() => setPdfOpen(true)}
                style={{ padding: '9px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#475569', fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                Preview PDF
              </button>
            )}
            {!isNew && !isReadOnly && (
              <button onClick={() => setShowEmailModal(true)}
                style={{ padding: '9px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#475569', fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                  <polyline points="22,6 12,13 2,6"/>
                </svg>
                Send by Email
              </button>
            )}
            {!isNew && !isReadOnly && (
              <WhatsAppButton loading={waLoading} onClick={handleSendWhatsApp} />
            )}
            {!isReadOnly && !isNew && (form.status === 'sent' || form.status === 'overdue') && (
              <button onClick={() => setShowPayModal(true)} disabled={markingPaid} style={{ ...btnStyle('#15803d'), background: '#16a34a' }}>
                {markingPaid ? 'Marking…' : 'Mark as Paid'}
              </button>
            )}
            {!isReadOnly && !isNew && form.status === 'draft' && (
              <button onClick={() => handleSave('sent')} disabled={saving} style={btnStyle('#1d4ed8')}>
                Mark as Sent
              </button>
            )}
            {!isReadOnly && !isPaid && (
              <button onClick={() => handleSave()} disabled={saving} style={btnStyle('#14b8a6')}>
                {saving ? 'Saving…' : 'Save Draft'}
              </button>
            )}
            {!isReadOnly && !isNew && (
              <button onClick={() => setConfirmDelete(true)}
                style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #fecaca', background: '#fff', color: '#dc2626', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                Delete
              </button>
            )}
          </div>
        )}

        {/* Mobile: compact icon buttons for PDF / Email / Delete */}
        {isMobile && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
            {!isNew && (
              <button onClick={() => setPdfOpen(true)} title="Preview PDF"
                style={{ padding: '7px', borderRadius: 7, border: '1px solid #e2e8f0', background: '#fff', color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              </button>
            )}
            {!isNew && !isReadOnly && (
              <button onClick={() => setShowEmailModal(true)} title="Send by Email"
                style={{ padding: '7px', borderRadius: 7, border: '1px solid #e2e8f0', background: '#fff', color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                  <polyline points="22,6 12,13 2,6"/>
                </svg>
              </button>
            )}
            {!isNew && !isReadOnly && (
              <WhatsAppButton loading={waLoading} onClick={handleSendWhatsApp} icon />
            )}
            {!isReadOnly && !isNew && (
              <button onClick={() => setConfirmDelete(true)} title="Delete"
                style={{ padding: '7px', borderRadius: 7, border: '1px solid #fecaca', background: '#fff', color: '#dc2626', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Body ── */}
      <div style={{
        flex: 1, overflowY: 'auto',
        padding: isMobile ? 16 : '28px 40px',
        // Extra bottom padding on mobile so content isn't hidden behind the fixed action bar
        paddingBottom: isMobile ? 88 : undefined,
      }}>
        <div style={{ maxWidth: 860, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: isMobile ? 14 : 20 }}>

          {/* ── Details card ── */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: isMobile ? 16 : 24 }}>
            <h3 style={{ margin: `0 0 ${isMobile ? 12 : 16}px`, fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Details</h3>
            {/* Single column on mobile, two columns on desktop */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 14 : 20 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 6 }}>Client *</label>
                <ClientSelector clients={[...clients, ...extraClients]} value={form.client_id} onChange={v => setField('client_id', v)} onAddNewClient={() => setShowAddClient(true)} />
                {errors.client_id && <p style={{ color: '#ef4444', fontSize: 12, marginTop: 4 }}>{errors.client_id}</p>}
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 6 }}>Invoice #</label>
                <input value={form.invoice_number} onChange={e => setField('invoice_number', e.target.value)} style={inputStyle(false)} />
              </div>
              {/* Empty spacer — desktop only */}
              {!isMobile && <div />}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 6 }}>Issue Date *</label>
                <input type="date" value={form.issue_date} onChange={e => setField('issue_date', e.target.value)} style={inputStyle(!!errors.issue_date)} />
                {errors.issue_date && <p style={{ color: '#ef4444', fontSize: 12, marginTop: 4 }}>{errors.issue_date}</p>}
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 6 }}>Due Date *</label>
                <input type="date" value={form.due_date} onChange={e => setField('due_date', e.target.value)} style={inputStyle(!!errors.due_date)} />
                {errors.due_date
                  ? <p style={{ color: '#ef4444', fontSize: 12, marginTop: 4 }}>{errors.due_date}</p>
                  : isNew && <p style={{ color: '#94a3b8', fontSize: 12, marginTop: 4 }}>Based on your {payTermsDays}-day payment terms</p>
                }
              </div>
            </div>
          </div>

          {/* ── Line Items ── */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <div style={{ padding: isMobile ? '12px 16px' : '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Line Items</h3>
              {errors.items && <span style={{ color: '#ef4444', fontSize: 12 }}>{errors.items}</span>}
            </div>

            {isMobile ? (
              /* Mobile: stacked card per line item */
              <div style={{ padding: '8px 12px' }}>
                {lineItems.map((li, idx) => (
                  <div key={li._key} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, marginBottom: 10, background: '#f8fafc', position: 'relative' }}>
                    {/* Remove button */}
                    <button
                      onClick={() => removeLine(li._key)}
                      disabled={lineItems.length === 1}
                      style={{ position: 'absolute', top: 8, right: 8, background: 'none', border: 'none', cursor: lineItems.length === 1 ? 'default' : 'pointer', color: '#94a3b8', padding: 4, display: 'flex' }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>

                    <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 8 }}>
                      Item {idx + 1}
                    </div>

                    <div style={{ marginBottom: 8 }}>
                      <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Item Name</label>
                      <AutocompleteInput
                        value={li.item_name}
                        onChange={(val, item) => { if (item) selectCatalogItem(li._key, item); else updateLine(li._key, 'item_name', val) }}
                        catalog={catalog}
                        placeholder="Item name"
                      />
                    </div>

                    <div style={{ marginBottom: 8 }}>
                      <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Description</label>
                      <textarea
                        value={li.description}
                        onChange={e => updateLine(li._key, 'description', e.target.value)}
                        onBlur={e => handleDescriptionBlur(li._key, e.target.value)}
                        placeholder="Description" rows={2}
                        style={{ padding: '7px 10px', borderRadius: 7, fontSize: 13, border: '1px solid #e2e8f0', background: '#fff', color: '#0f172a', outline: 'none', width: '100%', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }}
                      />
                    </div>

                    <div style={{ display: 'flex', gap: 10 }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Qty</label>
                        <input type="number" min="0" step="1" value={li.quantity} onChange={e => updateLine(li._key, 'quantity', e.target.value)}
                          style={{ padding: '7px 8px', borderRadius: 7, fontSize: 13, border: '1px solid #e2e8f0', background: '#fff', color: '#0f172a', outline: 'none', width: '100%', boxSizing: 'border-box', textAlign: 'right' }} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Unit Price</label>
                        <input type="number" min="0" step="0.01" value={li.unit_price} onChange={e => updateLine(li._key, 'unit_price', e.target.value)} placeholder="0.00"
                          style={{ padding: '7px 8px', borderRadius: 7, fontSize: 13, border: '1px solid #e2e8f0', background: '#fff', color: '#0f172a', outline: 'none', width: '100%', boxSizing: 'border-box', textAlign: 'right' }} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Total</label>
                        <div style={{ padding: '7px 8px', fontSize: 13, fontWeight: 600, color: '#0f172a', textAlign: 'right' }}>
                          {fmt((Number(li.quantity) || 0) * (Number(li.unit_price) || 0))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Add line item — full width on mobile */}
                <button onClick={addLine}
                  style={{ display: 'block', width: '100%', padding: '11px', border: '1.5px dashed #14b8a6', borderRadius: 8, background: '#f0fdfa', color: '#14b8a6', fontWeight: 600, fontSize: 14, cursor: 'pointer', marginBottom: 4 }}>
                  + Add Line Item
                </button>
              </div>
            ) : (
              /* Desktop: existing grid layout (unchanged) */
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 80px 110px 24px', gap: 8, padding: '8px 20px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                  {['Item', 'Description', 'Qty', 'Unit Price', ''].map(h => (
                    <span key={h} style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
                  ))}
                </div>
                {lineItems.map(li => (
                  <div key={li._key} style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 80px 110px 24px', gap: 8, padding: '8px 20px', borderBottom: '1px solid #f9fafb', alignItems: 'start' }}>
                    <AutocompleteInput
                      value={li.item_name}
                      onChange={(val, item) => { if (item) selectCatalogItem(li._key, item); else updateLine(li._key, 'item_name', val) }}
                      catalog={catalog}
                      placeholder="Item name"
                    />
                    <textarea value={li.description} onChange={e => updateLine(li._key, 'description', e.target.value)}
                      onBlur={e => handleDescriptionBlur(li._key, e.target.value)}
                      placeholder="Description" rows={2}
                      style={{ padding: '7px 10px', borderRadius: 7, fontSize: 13, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#0f172a', outline: 'none', width: '100%', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.4 }} />
                    <input type="number" min="0" step="1" value={li.quantity} onChange={e => updateLine(li._key, 'quantity', e.target.value)}
                      style={{ padding: '7px 8px', borderRadius: 7, fontSize: 13, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#0f172a', outline: 'none', width: '100%', boxSizing: 'border-box', textAlign: 'right', marginTop: 1 }} />
                    <input type="number" min="0" step="0.01" value={li.unit_price} onChange={e => updateLine(li._key, 'unit_price', e.target.value)} placeholder="0.00"
                      style={{ padding: '7px 8px', borderRadius: 7, fontSize: 13, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#0f172a', outline: 'none', width: '100%', boxSizing: 'border-box', textAlign: 'right', marginTop: 1 }} />
                    <button onClick={() => removeLine(li._key)} disabled={lineItems.length === 1}
                      style={{ background: 'none', border: 'none', cursor: lineItems.length === 1 ? 'default' : 'pointer', color: '#94a3b8', padding: 0, display: 'flex', alignItems: 'center', marginTop: 6 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>
                  </div>
                ))}
              </>
            )}

            <div style={{ padding: isMobile ? '12px 16px' : '12px 20px', borderTop: '1px solid #f1f5f9', display: 'flex', alignItems: 'flex-start', justifyContent: isMobile ? 'flex-end' : 'space-between' }}>
              {/* Add Line — desktop only (mobile has full-width button above) */}
              {!isMobile && (
                <button onClick={addLine} style={{ background: 'none', border: 'none', color: '#14b8a6', fontWeight: 600, fontSize: 13, cursor: 'pointer', padding: 0 }}>
                  + Add Line
                </button>
              )}
              {/* Totals */}
              <div style={{ minWidth: isMobile ? '100%' : 280 }}>
                {form.vat_enabled && (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13, color: '#64748b' }}>
                      <span>Subtotal (ex-VAT)</span><span>{fmt(subtotal)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: '#64748b', cursor: 'pointer' }}>
                        <input type="checkbox" checked={form.vat_enabled} onChange={e => setField('vat_enabled', e.target.checked)} style={{ accentColor: '#14b8a6', width: 14, height: 14 }} />
                        VAT (15%)
                      </label>
                      <span style={{ fontSize: 13, color: '#64748b' }}>{fmt(vatAmount)}</span>
                    </div>
                  </>
                )}
                {!form.vat_enabled && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: '#64748b', cursor: 'pointer' }}>
                      <input type="checkbox" checked={form.vat_enabled} onChange={e => setField('vat_enabled', e.target.checked)} style={{ accentColor: '#14b8a6', width: 14, height: 14 }} />
                      VAT (15%)
                    </label>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: '2px solid #e2e8f0', fontSize: 15, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>
                  <span>Total</span><span>{fmt(total)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>Amount Paid</label>
                  <input
                    type="number" min="0" step="0.01"
                    value={form.amount_paid}
                    onChange={e => setField('amount_paid', e.target.value)}
                    disabled={isPaid}
                    style={{ width: 110, padding: '5px 8px', borderRadius: 7, fontSize: 13, border: '1px solid #e2e8f0', background: isPaid ? '#f8fafc' : '#fff', color: '#0f172a', outline: 'none', textAlign: 'right', opacity: isPaid ? 0.7 : 1 }}
                  />
                </div>
                {Number(form.amount_paid) > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 6, borderTop: '1px solid #e2e8f0', fontSize: 14, fontWeight: 700, color: balanceDue === 0 ? '#15803d' : '#0f172a' }}>
                    <span>Balance Due</span><span>{fmt(balanceDue)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Notes ── */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: isMobile ? 16 : 24 }}>
            <h3 style={{ margin: `0 0 ${isMobile ? 10 : 12}px`, fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Notes</h3>
            <textarea value={form.notes} onChange={e => setField('notes', e.target.value)} placeholder="Any additional notes for the client…" rows={4}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, fontSize: 14, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#0f172a', outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }} />
          </div>

        </div>
      </div>

      {/* ── Mobile fixed bottom action bar ── */}
      {isMobile && (
        <div style={{
          position:      'fixed',
          bottom:        0,
          left:          0,
          right:         0,
          background:    '#fff',
          borderTop:     '1px solid #e2e8f0',
          padding:       '12px 16px',
          paddingBottom: 'calc(12px + env(safe-area-inset-bottom))',
          boxShadow:     '0 -2px 16px rgba(0,0,0,0.08)',
          zIndex:        110,  /* above BottomNav (100) */
        }}>
          {errors._global && (
            <p style={{ color: '#ef4444', fontSize: 12, margin: '0 0 6px' }}>{errors._global}</p>
          )}
          {/* Row 1: Send via Email / WhatsApp */}
          {!isNew && !isReadOnly && (
            <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
              <button onClick={() => setShowEmailModal(true)}
                style={{ flex: 1, padding: '11px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#475569', fontWeight: 600, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontFamily: 'inherit' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                  <polyline points="22,6 12,13 2,6"/>
                </svg>
                Send via Email
              </button>
              <WhatsAppButton loading={waLoading} onClick={handleSendWhatsApp} mobile />
            </div>
          )}
          <div style={{ display: 'flex', gap: 10 }}>
            {/* Cancel / Back */}
            <button onClick={onBack}
              style={{ flex: 1, padding: '11px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
              Cancel
            </button>

            {/* Mark as Sent — for existing draft invoices */}
            {!isReadOnly && !isNew && form.status === 'draft' && (
              <button onClick={() => handleSave('sent')} disabled={saving}
                style={{ flex: 1.5, padding: '11px', borderRadius: 8, border: 'none', background: '#1d4ed8', color: '#fff', fontWeight: 600, fontSize: 14, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, fontFamily: 'inherit' }}>
                Mark as Sent
              </button>
            )}

            {/* Mark as Paid — for sent/overdue invoices */}
            {!isReadOnly && !isNew && (form.status === 'sent' || form.status === 'overdue') && (
              <button onClick={() => setShowPayModal(true)} disabled={markingPaid}
                style={{ flex: 1.5, padding: '11px', borderRadius: 8, border: 'none', background: '#16a34a', color: '#fff', fontWeight: 600, fontSize: 14, cursor: markingPaid ? 'not-allowed' : 'pointer', opacity: markingPaid ? 0.7 : 1, fontFamily: 'inherit' }}>
                {markingPaid ? 'Marking…' : 'Mark as Paid'}
              </button>
            )}

            {/* Save Draft / Save — when not paid and not read-only */}
            {!isReadOnly && !isPaid && (
              <button onClick={() => handleSave()} disabled={saving}
                style={{ flex: 1.5, padding: '11px', borderRadius: 8, border: 'none', background: '#14b8a6', color: '#fff', fontWeight: 600, fontSize: 14, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, fontFamily: 'inherit' }}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 28, width: 380, boxShadow: '0 20px 60px rgba(0,0,0,0.18)' }}>
            <h3 style={{ margin: '0 0 10px', fontSize: 17, fontWeight: 700, color: '#0f172a' }}>Delete Invoice?</h3>
            <p style={{ color: '#64748b', fontSize: 14, marginBottom: 22 }}>This cannot be undone.</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmDelete(false)} style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleDelete} disabled={deleting} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: '#ef4444', color: '#fff', fontWeight: 600, fontSize: 14, cursor: deleting ? 'not-allowed' : 'pointer', opacity: deleting ? 0.7 : 1 }}>
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddClient && (
        <AddClientModal onClose={() => setShowAddClient(false)}
          onCreated={client => { setShowAddClient(false); setExtraClients(prev => [...prev, client]); setField('client_id', client.id); refreshClients() }} />
      )}

      {/* PDF Preview modal */}
      {(pdfOpen || showEmailModal) && (() => {
        const selectedClient = [...clients, ...extraClients].find(c => c.id === form.client_id)
        const pdfData = {
          ...(invoice || {}),
          invoice_number: form.invoice_number,
          issue_date:     form.issue_date,
          due_date:       form.due_date,
          notes:          form.notes,
          vat_enabled:    form.vat_enabled,
          vat_rate:       form.vat_enabled ? 15 : 0,
          subtotal,
          vat_amount:     vatAmount,
          total,
          amount_paid:    Number(form.amount_paid) || 0,
          status:         form.status,
          payment_date:   form.payment_date,
          client_name:    selectedClient?.name || '',
          client_company: selectedClient?.company_name || '',
          client_email:   selectedClient?.email || '',
          client_phone:   selectedClient?.phone || '',
          client_address: selectedClient?.address || '',
          items:          lineItems.filter(li => li.item_name.trim()),
        }
        return (
          <>
            <PdfPreviewModal
              isOpen={pdfOpen}
              data={pdfData}
              settings={settings}
              docType="INVOICE"
              onClose={() => setPdfOpen(false)}
            />
            <SendEmailModal
              isOpen={showEmailModal}
              data={pdfData}
              settings={settings}
              docType="INVOICE"
              clientEmail={selectedClient?.email || ''}
              onClose={() => setShowEmailModal(false)}
              onSent={async () => {
                // Update invoice: mark as sent from app + promote draft → sent
                if (invoice?.id) {
                  const updatePayload = { sent_from_app: true }
                  if (invoice.status === 'draft') updatePayload.status = 'sent'
                  await supabase
                    .from('invoices')
                    .update(updatePayload)
                    .eq('id', invoice.id)
                    .eq('user_id', user.id)
                  if (invoice.status === 'draft') setField('status', 'sent')
                }
                // Dismiss the recurring notification banner if applicable
                if (invoice?.from_recurring) {
                  dismissNotification(invoice.id)
                }
              }}
            />
          </>
        )
      })()}

      {/* WhatsApp send toast */}
      {waToast && (
        <Toast message={waToast.message} type={waToast.type} onDone={() => setWaToast(null)} />
      )}

      {/* Payment method modal */}
      {showPayModal && (
        <PaymentMethodModal
          methods={(() => {
            const raw = settings?.payment_methods
            if (raw) { try { const p = JSON.parse(raw); if (Array.isArray(p) && p.length) return p } catch (_) {} }
            return DEFAULT_METHODS
          })()}
          defaultMethod={settings?.default_payment_method || ''}
          onConfirm={(method) => { setShowPayModal(false); setPendingPaymentMethod(method); setShowMarkPaidEmailModal(true) }}
          onCancel={() => setShowPayModal(false)}
        />
      )}

      {/* Mark as Paid — thank you email modal */}
      {showMarkPaidEmailModal && (
        <MarkAsPaidEmailModal
          invoiceNumber={form.invoice_number}
          amount={total}
          clientName={selectedClient?.company_name || selectedClient?.name || ''}
          clientEmail={selectedClient?.email || ''}
          businessName={settings?.business_name || ''}
          saving={markingPaid || sendingPaymentEmail}
          onConfirm={handleConfirmMarkPaidWithEmail}
          onCancel={() => { setShowMarkPaidEmailModal(false); setPendingPaymentMethod(null) }}
        />
      )}

      {/* Revert status confirmation modal */}
      {undoTarget && (
        <RevertConfirmModal
          message={`Revert this invoice back to ${STATUS_META[form.previous_status]?.label || form.previous_status}?`}
          onConfirm={handleUndo}
          onCancel={() => setUndoTarget(null)}
          confirming={undoing}
        />
      )}

      {undoConvert && sourceEstimate && (
        <RevertConfirmModal
          message={`Delete invoice ${form.invoice_number} and revert ${sourceEstimate.estimate_number} back to its previous status? This cannot be undone.`}
          onConfirm={handleUndoConvert}
          onCancel={() => setUndoConvert(false)}
          confirming={undoingConvert}
        />
      )}

    </div>
  )
}

// ─── Recurring Invoices ───────────────────────────────────────────────────────

const INTERVALS = ['daily', 'weekly', 'monthly', 'yearly']
const intervalLabel = (v) => v ? v.charAt(0).toUpperCase() + v.slice(1) : '—'

function RecurringForm({ recurringInvoice, clients, catalog, settings, onBack, onSaved, isReadOnly }) {
  const { user } = useAuth()
  const { refresh: refreshNotifications } = useRecurringNotif()
  const { refreshClients } = useAppData()
  const isNew = !recurringInvoice

  const defaultSubject = `Invoice from ${settings?.business_name || 'us'}`
  const defaultMessage = `Dear [client name], please find your invoice attached. Thank you for your business.`

  const [form, setForm] = useState(() => ({
    client_id:      recurringInvoice?.client_id      || '',
    interval:       recurringInvoice?.interval       || 'monthly',
    next_send_date: recurringInvoice?.next_send_date || todayStr(),
    vat_enabled:    recurringInvoice?.vat_enabled    ?? false,
    notes:          recurringInvoice?.notes          || '',
    email_subject:  recurringInvoice?.email_subject  || defaultSubject,
    email_message:  recurringInvoice?.email_message  || defaultMessage,
  }))

  const [lineItems, setLineItems] = useState(() =>
    recurringInvoice?.items?.length
      ? recurringInvoice.items.map(i => ({ _key: Math.random().toString(36).slice(2), ...i }))
      : [newLine()]
  )

  const [saving, setSaving]           = useState(false)
  const [errors, setErrors]           = useState({})
  const [showAddClient, setShowAddClient] = useState(false)
  const [extraClients, setExtraClients]   = useState([])

  const grossTotal = lineItems.reduce((s, li) => s + (Number(li.quantity) || 0) * (Number(li.unit_price) || 0), 0)
  const subtotal   = form.vat_enabled ? grossTotal / 1.15 : grossTotal
  const vatAmount  = form.vat_enabled ? grossTotal - subtotal : 0
  const total      = grossTotal

  function setField(k, v) { setForm(p => ({ ...p, [k]: v })) }

  function updateLine(key, field, value) {
    setLineItems(prev => prev.map(li => li._key !== key ? li : { ...li, [field]: value }))
  }

  function selectCatalogItem(key, item) {
    setLineItems(prev => prev.map(li => li._key !== key ? li : {
      ...li, item_name: item.name, description: item.description || '', unit_price: item.unit_price, _catalogId: item.id,
    }))
  }

  function addLine()       { setLineItems(p => [...p, newLine()]) }
  function removeLine(key) { setLineItems(p => p.filter(li => li._key !== key)) }

  function validate() {
    const errs = {}
    if (!form.client_id)      errs.client_id      = 'Select a client.'
    if (!form.next_send_date) errs.next_send_date  = 'Required.'
    if (!lineItems.some(li => li.item_name.trim())) errs.items = 'Add at least one line item.'
    return errs
  }

  async function handleSave() {
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setSaving(true)
    setErrors({})

    const items = lineItems
      .filter(li => li.item_name.trim())
      .map(li => ({
        item_name:   li.item_name,
        description: li.description || null,
        quantity:    Number(li.quantity) || 1,
        unit_price:  Number(li.unit_price) || 0,
        line_total:  (Number(li.quantity) || 1) * (Number(li.unit_price) || 0),
      }))

    const payload = {
      client_id:      form.client_id || null,
      interval:       form.interval,
      next_send_date: form.next_send_date,
      vat_enabled:    form.vat_enabled,
      notes:          form.notes || null,
      email_subject:  form.email_subject || null,
      email_message:  form.email_message || null,
      items,
    }

    try {
      if (isNew) {
        // ── 1. Insert the recurring_invoice row ───────────────────────────
        const { data: recurring, error: recurringErr } = await supabase
          .from('recurring_invoices')
          .insert({ ...payload, user_id: user.id, is_active: true })
          .select()
          .single()
        if (recurringErr) throw new Error(recurringErr.message)

        // ── 2. Fetch existing invoice numbers (prefix comes from cached settings) ──
        const { data: existingInvs } = await supabase
          .from('invoices').select('invoice_number').eq('user_id', user.id)
        const prefix = settings?.invoice_prefix || 'INV-'
        const start  = settings?.starting_invoice_number || 1
        const maxNum  = (existingInvs ?? []).reduce((max, inv) => {
          const match = (inv.invoice_number || '').match(/(\d+)$/)
          return match ? Math.max(max, parseInt(match[1], 10)) : max
        }, 0)
        const invoiceNumber = `${prefix}${String(maxNum > 0 ? maxNum + 1 : start).padStart(4, '0')}`

        // ── 3. Calculate totals ───────────────────────────────────────────
        const issueDate   = form.next_send_date
        const dueDate     = addDays(issueDate, 30)
        const lineTotal   = items.reduce((s, li) => s + li.line_total, 0)
        const subtotalAmt = form.vat_enabled ? lineTotal / 1.15 : lineTotal
        const vatAmt      = form.vat_enabled ? lineTotal - subtotalAmt : 0

        // ── 4. Insert the first invoice ───────────────────────────────────
        const { data: inv, error: invErr } = await supabase
          .from('invoices')
          .insert({
            invoice_number:       invoiceNumber,
            client_id:            form.client_id || null,
            issue_date:           issueDate,
            due_date:             dueDate,
            notes:                form.notes || null,
            vat_enabled:          form.vat_enabled,
            vat_rate:             form.vat_enabled ? 15 : 0,
            subtotal:             subtotalAmt,
            vat_amount:           vatAmt,
            total:                lineTotal,
            amount_paid:          0,
            status:               'draft',
            from_recurring:       true,
            notification_dismissed: false,
            user_id:              user.id,
          })
          .select()
          .single()
        if (invErr) throw new Error(invErr.message)

        // ── 5. Insert invoice_items ───────────────────────────────────────
        if (items.length > 0) {
          const { error: itemsErr } = await supabase
            .from('invoice_items')
            .insert(items.map(li => ({
              invoice_id:  inv.id,
              item_name:   li.item_name,
              description: li.description,
              quantity:    li.quantity,
              unit_price:  li.unit_price,
              line_total:  li.line_total,
            })))
          if (itemsErr) throw new Error(itemsErr.message)
        }

        // ── 6. Advance next_send_date and set last_sent_date ──────────────
        const nextSendDate = calcNextSendDate(issueDate, form.interval)
        await supabase
          .from('recurring_invoices')
          .update({ next_send_date: nextSendDate, last_sent_date: issueDate })
          .eq('id', recurring.id)
          .eq('user_id', user.id)

        // ── 7. Refresh notification banners immediately ───────────────────
        refreshNotifications()

        setSaving(false)
        onSaved({ ...recurring, next_send_date: nextSendDate, last_sent_date: issueDate, _firstInvoiceCreated: true })

      } else {
        const { error } = await supabase
          .from('recurring_invoices')
          .update(payload)
          .eq('id', recurringInvoice.id)
          .eq('user_id', user.id)
        if (error) throw new Error(error.message)
        setSaving(false)
        onSaved({ ...recurringInvoice, ...payload })
      }
    } catch (e) {
      setSaving(false)
      setErrors({ _global: e.message })
    }
  }

  const inputStyle = (hasErr) => ({
    width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: 14,
    border: `1px solid ${hasErr ? '#ef4444' : '#e2e8f0'}`, background: '#f8fafc',
    color: '#0f172a', outline: 'none', boxSizing: 'border-box',
  })

  const selectStyle = {
    ...inputStyle(false),
    appearance: 'none',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 12px center',
    paddingRight: 36,
    cursor: 'pointer',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#f8fafc' }}>
      {/* Header bar */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '14px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center', gap: 5, fontSize: 14, fontWeight: 600 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            Back
          </button>
          <span style={{ color: '#e2e8f0', fontWeight: 300 }}>|</span>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: 0 }}>
            {isNew ? 'New Recurring Invoice' : 'Edit Recurring Invoice'}
          </h2>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {errors._global && <span style={{ color: '#ef4444', fontSize: 13 }}>{errors._global}</span>}
          {!isReadOnly && (
            <button onClick={handleSave} disabled={saving}
              style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: '#14b8a6', color: '#fff', fontWeight: 600, fontSize: 13, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '28px 40px' }}>
        <div style={{ maxWidth: 860, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Details */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 24 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Details</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 6 }}>Client *</label>
                <ClientSelector clients={[...clients, ...extraClients]} value={form.client_id} onChange={v => setField('client_id', v)} onAddNewClient={() => setShowAddClient(true)} />
                {errors.client_id && <p style={{ color: '#ef4444', fontSize: 12, marginTop: 4 }}>{errors.client_id}</p>}
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 6 }}>Recurrence Interval</label>
                <select value={form.interval} onChange={e => setField('interval', e.target.value)} style={selectStyle}>
                  {INTERVALS.map(iv => <option key={iv} value={iv}>{intervalLabel(iv)}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 6 }}>
                  {isNew ? 'First Send Date *' : 'Next Send Date *'}
                </label>
                <input type="date" value={form.next_send_date} onChange={e => setField('next_send_date', e.target.value)} style={inputStyle(!!errors.next_send_date)} />
                {errors.next_send_date && <p style={{ color: '#ef4444', fontSize: 12, marginTop: 4 }}>{errors.next_send_date}</p>}
              </div>
            </div>
          </div>

          {/* Line Items */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Line Items</h3>
              {errors.items && <span style={{ color: '#ef4444', fontSize: 12 }}>{errors.items}</span>}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 80px 110px 24px', gap: 8, padding: '8px 20px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
              {['Item', 'Description', 'Qty', 'Unit Price', ''].map(h => (
                <span key={h} style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
              ))}
            </div>
            {lineItems.map(li => (
              <div key={li._key} style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 80px 110px 24px', gap: 8, padding: '8px 20px', borderBottom: '1px solid #f9fafb', alignItems: 'start' }}>
                <AutocompleteInput
                  value={li.item_name}
                  onChange={(val, item) => { if (item) selectCatalogItem(li._key, item); else updateLine(li._key, 'item_name', val) }}
                  catalog={catalog}
                  placeholder="Item name"
                />
                <textarea value={li.description} onChange={e => updateLine(li._key, 'description', e.target.value)}
                  placeholder="Description" rows={2}
                  style={{ padding: '7px 10px', borderRadius: 7, fontSize: 13, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#0f172a', outline: 'none', width: '100%', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.4 }} />
                <input type="number" min="0" step="1" value={li.quantity} onChange={e => updateLine(li._key, 'quantity', e.target.value)}
                  style={{ padding: '7px 8px', borderRadius: 7, fontSize: 13, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#0f172a', outline: 'none', width: '100%', boxSizing: 'border-box', textAlign: 'right', marginTop: 1 }} />
                <input type="number" min="0" step="0.01" value={li.unit_price} onChange={e => updateLine(li._key, 'unit_price', e.target.value)} placeholder="0.00"
                  style={{ padding: '7px 8px', borderRadius: 7, fontSize: 13, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#0f172a', outline: 'none', width: '100%', boxSizing: 'border-box', textAlign: 'right', marginTop: 1 }} />
                <button onClick={() => removeLine(li._key)} disabled={lineItems.length === 1}
                  style={{ background: 'none', border: 'none', cursor: lineItems.length === 1 ? 'default' : 'pointer', color: '#94a3b8', padding: 0, display: 'flex', alignItems: 'center', marginTop: 6 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              </div>
            ))}
            <div style={{ padding: '12px 20px', borderTop: '1px solid #f1f5f9', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <button onClick={addLine} style={{ background: 'none', border: 'none', color: '#14b8a6', fontWeight: 600, fontSize: 13, cursor: 'pointer', padding: 0 }}>
                + Add Line
              </button>
              <div style={{ minWidth: 280 }}>
                {form.vat_enabled && (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13, color: '#64748b' }}>
                      <span>Subtotal (ex-VAT)</span><span>{fmt(subtotal)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: '#64748b', cursor: 'pointer' }}>
                        <input type="checkbox" checked={form.vat_enabled} onChange={e => setField('vat_enabled', e.target.checked)} style={{ accentColor: '#14b8a6', width: 14, height: 14 }} />
                        VAT (15%)
                      </label>
                      <span style={{ fontSize: 13, color: '#64748b' }}>{fmt(vatAmount)}</span>
                    </div>
                  </>
                )}
                {!form.vat_enabled && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: '#64748b', cursor: 'pointer' }}>
                      <input type="checkbox" checked={form.vat_enabled} onChange={e => setField('vat_enabled', e.target.checked)} style={{ accentColor: '#14b8a6', width: 14, height: 14 }} />
                      VAT (15%)
                    </label>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: '2px solid #e2e8f0', fontSize: 15, fontWeight: 700, color: '#0f172a' }}>
                  <span>Total</span><span>{fmt(total)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Email */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 24 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Email Settings</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 6 }}>Subject</label>
                <input value={form.email_subject} onChange={e => setField('email_subject', e.target.value)} style={inputStyle(false)} placeholder="Invoice from [business]" />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 6 }}>Message</label>
                <textarea value={form.email_message} onChange={e => setField('email_message', e.target.value)} rows={5}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, fontSize: 14, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#0f172a', outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }}
                  placeholder="Dear [client name], please find your invoice attached…" />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 24 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Notes</h3>
            <textarea value={form.notes} onChange={e => setField('notes', e.target.value)} placeholder="Any additional notes…" rows={3}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, fontSize: 14, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#0f172a', outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }} />
          </div>

        </div>
      </div>

      {showAddClient && (
        <AddClientModal onClose={() => setShowAddClient(false)}
          onCreated={client => { setShowAddClient(false); setExtraClients(prev => [...prev, client]); setField('client_id', client.id); refreshClients() }} />
      )}
    </div>
  )
}

// ─── Recurring List ───────────────────────────────────────────────────────────

function RecurringList({ recurring, clients, onNew, onEdit, onPauseResume, onDelete, onBack, isReadOnly }) {
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)

  const clientMap = {}
  for (const c of clients) clientMap[c.id] = c

  return (
    <div style={{ padding: 32, height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center', gap: 5, fontSize: 14, fontWeight: 600 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            Invoices
          </button>
          <span style={{ color: '#e2e8f0', fontWeight: 300 }}>|</span>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', margin: 0 }}>Recurring Invoices</h1>
          </div>
        </div>
        <button
          onClick={isReadOnly ? undefined : onNew}
          disabled={isReadOnly}
          title={isReadOnly ? READONLY_MSG : undefined}
          style={{ background: '#14b8a6', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontSize: 14, fontWeight: 600, cursor: isReadOnly ? 'not-allowed' : 'pointer', opacity: isReadOnly ? 0.45 : 1 }}
        >
          + New Recurring Invoice
        </button>
      </div>

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 115px 115px 80px 170px', columnGap: 16, padding: '12px 20px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', flexShrink: 0 }}>
          {['Client', 'Interval', 'Next Send', 'Last Sent', 'Status', 'Actions'].map(h => (
            <span key={h} style={{ fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {recurring.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '56px 0', color: '#94a3b8' }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 12 }}>
                <path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                <path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
              </svg>
              <p style={{ fontSize: 14, margin: 0 }}>No recurring invoices yet</p>
              <p style={{ fontSize: 12, marginTop: 4 }}>Click "+ New Recurring Invoice" to set one up.</p>
            </div>
          ) : (
            recurring.map(rec => {
              const client   = clientMap[rec.client_id]
              const isActive = rec.is_active !== false
              return (
                <div key={rec.id} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 115px 115px 80px 170px', columnGap: 16, padding: '14px 20px', borderBottom: '1px solid #f9fafb', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{client?.name || '—'}</div>
                    {client?.company_name && client.company_name !== client.name && (
                      <div style={{ fontSize: 12, color: '#94a3b8' }}>{client.company_name}</div>
                    )}
                  </div>
                  <span style={{ fontSize: 13, color: '#475569' }}>{intervalLabel(rec.interval)}</span>
                  <span style={{ fontSize: 13, color: '#475569' }}>{rec.next_send_date || '—'}</span>
                  <span style={{ fontSize: 13, color: '#475569' }}>{rec.last_sent_date || '—'}</span>
                  <span style={{
                    display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                    background: isActive ? '#dcfce7' : '#f1f5f9',
                    color:      isActive ? '#15803d' : '#475569',
                  }}>
                    {isActive ? 'Active' : 'Paused'}
                  </span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {!isReadOnly && (
                      <>
                        <button onClick={() => onEdit(rec)}
                          style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', color: '#475569', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                          Edit
                        </button>
                        <button onClick={() => onPauseResume(rec)}
                          style={{ padding: '5px 10px', borderRadius: 6, border: `1px solid ${isActive ? '#fde68a' : '#bbf7d0'}`, background: isActive ? '#fefce8' : '#f0fdf4', color: isActive ? '#92400e' : '#15803d', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                          {isActive ? 'Pause' : 'Resume'}
                        </button>
                        <button onClick={() => setConfirmDeleteId(rec.id)}
                          style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #fecaca', background: '#fff', color: '#dc2626', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Delete confirmation */}
      {confirmDeleteId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 28, width: 380, boxShadow: '0 20px 60px rgba(0,0,0,0.18)' }}>
            <h3 style={{ margin: '0 0 10px', fontSize: 17, fontWeight: 700, color: '#0f172a' }}>Delete Recurring Invoice?</h3>
            <p style={{ color: '#64748b', fontSize: 14, marginBottom: 22 }}>This cannot be undone. No further invoices will be generated.</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmDeleteId(null)}
                style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={() => { onDelete(confirmDeleteId); setConfirmDeleteId(null) }}
                style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: '#ef4444', color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Reminder Modal ───────────────────────────────────────────────────────────

function ReminderModal({ invoice, clients, settings, onClose, onReminderSent }) {
  const client       = clients.find(c => c.id === invoice?.client_id)
  const clientName   = client?.company_name || client?.name || 'Valued Client'
  const clientEmail  = client?.email || ''
  const businessName = settings?.business_name || ''
  const businessEmail = settings?.email || settings?.smtp_user || ''

  const smtp = {
    host:      settings?.smtp_host      || '',
    port:      settings?.smtp_port      || '587',
    user:      settings?.smtp_user      || '',
    password:  settings?.smtp_password  || '',
    from_name: settings?.smtp_from_name || businessName || '',
  }

  function buildDefault() {
    const invNum = invoice?.invoice_number || '—'
    const amount = fmt(invoice?.total ?? 0)
    const issued = invoice?.issue_date || '—'
    const due    = invoice?.due_date   || '—'
    return [
      `This is a friendly reminder that invoice ${invNum} for ${amount} issued on ${issued} is still outstanding.`,
      '',
      `Due Date: ${due}`,
      `Amount Due: ${amount}`,
      '',
      `If you have already made payment, please disregard this email or send your proof of payment to ${businessEmail}.`,
      '',
      'Thank you for your prompt attention to this matter.',
    ].join('\n')
  }

  const [to,      setTo]      = useState(clientEmail)
  const [subject, setSubject] = useState(`Payment Reminder — Invoice ${invoice?.invoice_number || ''} is Outstanding`)
  const [message, setMessage] = useState(buildDefault)
  const [sending, setSending] = useState(false)
  const [sent,    setSent]    = useState(false)
  const [error,   setError]   = useState('')

  // Escape key
  useEffect(() => {
    const fn = e => { if (e.key === 'Escape' && !sending) onClose() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [sending, onClose])

  async function handleSend() {
    if (!to.trim()) { setError('Recipient email is required.'); return }
    if (!smtp.host || !smtp.user || !smtp.password) {
      setError('SMTP not configured. Go to Settings → Email Settings.')
      return
    }
    setSending(true)
    setError('')
    try {
      const html = generateReminderEmail({
        businessName,
        businessEmail,
        businessPhone: settings?.phone  || '',
        logoUrl:       settings?.logo_url || settings?.logo_path || '',
        primaryColor:  settings?.primary_color || '#14b8a6',
        clientName,
        invoiceNumber: invoice?.invoice_number || '',
        amount:        invoice?.total ?? 0,
        issueDate:     invoice?.issue_date || '',
        dueDate:       invoice?.due_date   || '',
        customMessage: message.trim(),
      })

      // Build a PDF of the invoice to attach to the reminder
      let pdfBuffer
      try {
        const { data: itemsData } = await supabase
          .from('invoice_items')
          .select('*')
          .eq('invoice_id', invoice.id)

        const pdfData = {
          ...invoice,
          client_name:    client?.name || '',
          client_company: client?.company_name || '',
          client_email:   client?.email || '',
          client_phone:   client?.phone || '',
          client_address: client?.address || '',
          items:          itemsData ?? [],
        }
        pdfBuffer = await buildPdfBuffer(pdfData, settings, 'INVOICE')
      } catch (_) {
        pdfBuffer = undefined
      }

      const res = await sendEmail({
        to:           to.trim(),
        subject:      subject.trim(),
        message:      message.trim() + PLAIN_TEXT_FOOTER,
        html,
        smtpHost:     smtp.host,
        smtpPort:     parseInt(smtp.port || '587', 10) || 587,
        smtpUser:     smtp.user,
        smtpPassword: smtp.password,
        smtpFromName: smtp.from_name,
        smtpFromEmail: smtp.user,
        pdfBuffer,
        fileName:     `Invoice-${invoice?.invoice_number || 'reminder'}.pdf`,
      })

      if (res?.success === false) throw new Error(res.error || 'Failed to send reminder.')

      setSent(true)
      onReminderSent()
    } catch (e) {
      setError(e.message)
    } finally {
      setSending(false)
    }
  }

  const iStyle = {
    width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: 14,
    border: '1px solid #e2e8f0', background: '#f8fafc', color: '#0f172a',
    outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000,
    }} onMouseDown={e => e.target === e.currentTarget && !sending && onClose()}>
      <div style={{
        background: '#fff', borderRadius: 14, width: 520, maxWidth: '92vw',
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        display: 'flex', flexDirection: 'column', maxHeight: '88vh',
      }}>
        {/* Header */}
        <div style={{ padding: '16px 22px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#d97706' }}>🔔</span> Send Payment Reminder
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 22, lineHeight: 1, padding: '2px 4px' }}>×</button>
        </div>

        {sent ? (
          /* ── Success ── */
          <div style={{ padding: '44px 32px', textAlign: 'center' }}>
            <div style={{ fontSize: 44, marginBottom: 12 }}>✓</div>
            <h3 style={{ margin: '0 0 8px', color: '#0f172a', fontSize: 17 }}>Reminder Sent</h3>
            <p style={{ color: '#64748b', fontSize: 14, margin: '0 0 24px' }}>Payment reminder sent to {to}.</p>
            <button onClick={onClose} style={{ padding: '9px 22px', borderRadius: 8, border: 'none', background: '#14b8a6', color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>Close</button>
          </div>
        ) : (
          <>
            {/* Body */}
            <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto', flex: 1 }}>
              {error && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', color: '#dc2626', fontSize: 13 }}>
                  ⚠ {error}
                </div>
              )}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 5 }}>To</label>
                <input value={to} onChange={e => setTo(e.target.value)} type="email" placeholder="client@example.com" style={iStyle} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 5 }}>Subject</label>
                <input value={subject} onChange={e => setSubject(e.target.value)} style={iStyle} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 5 }}>Message</label>
                <textarea value={message} onChange={e => setMessage(e.target.value)} rows={11}
                  style={{ ...iStyle, resize: 'vertical', lineHeight: 1.6 }} />
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: '14px 22px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: 10, justifyContent: 'flex-end', flexShrink: 0 }}>
              <button onClick={onClose} disabled={sending}
                style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={handleSend} disabled={sending}
                style={{ padding: '9px 22px', borderRadius: 8, border: 'none', background: '#d97706', color: '#fff', fontWeight: 600, fontSize: 14, cursor: sending ? 'not-allowed' : 'pointer', opacity: sending ? 0.7 : 1 }}
                onMouseEnter={e => { if (!sending) e.currentTarget.style.background = '#b45309' }}
                onMouseLeave={e => { e.currentTarget.style.background = '#d97706' }}>
                {sending ? 'Sending…' : 'Send Reminder'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── List View ────────────────────────────────────────────────────────────────

const STATUS_TABS = ['all', 'draft', 'sent', 'paid', 'overdue']

function ListView({ invoices, onNew, onRecurring, onSelect, onOpenReminder, onMarkPaid, onDelete, isReadOnly }) {
  const [tab, setTab]   = useState('all')
  const isMobile        = useIsMobile()
  const filtered        = tab === 'all' ? invoices : invoices.filter(inv => inv.status === tab)

  const tabStyle = (active) => ({
    padding:    isMobile ? '5px 12px' : '6px 14px',
    borderRadius: 20,
    fontSize:   isMobile ? 12 : 13,
    fontWeight: 600,
    cursor:     'pointer',
    border:     'none',
    background: active ? '#14b8a6' : 'transparent',
    color:      active ? '#fff' : '#64748b',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  })

  const emptyState = (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '56px 0', color: '#94a3b8' }}>
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 12 }}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
      </svg>
      <p style={{ fontSize: 14, margin: 0 }}>{tab === 'all' ? 'No invoices yet' : `No ${tab} invoices`}</p>
      {tab === 'all' && <p style={{ fontSize: 12, marginTop: 4 }}>
        {isMobile ? 'Tap the + button to create one.' : 'Click "New Invoice" to create one.'}
      </p>}
    </div>
  )

  return (
    <div style={{ padding: isMobile ? 16 : 32, height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>

      {/* ── Page header ── */}
      <div style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        marginBottom:   isMobile ? 12 : 20,
        flexShrink:     0,
      }}>
        {/* Title — hidden on mobile (MobileHeader shows page name) */}
        {!isMobile && (
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>Invoices</h1>
            <p style={{ color: '#64748b', fontSize: 14, margin: 0 }}>Manage and track all your invoices.</p>
          </div>
        )}

        <div style={{
          display:        'flex',
          gap:            isMobile ? 8 : 10,
          alignItems:     'center',
          width:          isMobile ? '100%' : 'auto',
          justifyContent: isMobile ? 'space-between' : 'flex-end',
        }}>
          {/* Recurring — text link on mobile, full button on desktop */}
          {isMobile ? (
            <button
              data-tutorial="recurring"
              onClick={onRecurring}
              style={{ background: 'none', border: 'none', color: '#14b8a6', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '4px 0', display: 'flex', alignItems: 'center', gap: 5 }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                <path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
              </svg>
              Recurring
            </button>
          ) : (
            <button
              data-tutorial="recurring"
              onClick={onRecurring}
              style={{ background: '#fff', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                <path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
              </svg>
              Recurring
            </button>
          )}

          {/* New Invoice button — desktop only; mobile uses the FAB below */}
          {!isMobile && (
            <button
              data-tutorial="new-invoice"
              onClick={isReadOnly ? undefined : onNew}
              disabled={isReadOnly}
              title={isReadOnly ? READONLY_MSG : undefined}
              style={{ background: '#14b8a6', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontSize: 14, fontWeight: 600, cursor: isReadOnly ? 'not-allowed' : 'pointer', opacity: isReadOnly ? 0.45 : 1 }}
            >
              + New Invoice
            </button>
          )}

          <HelpButton page="invoices" />
        </div>
      </div>

      {/* ── Status tabs — scrollable on mobile ── */}
      <div
        className={isMobile ? 'fb-filter-scroll' : undefined}
        style={{
          display:                 'flex',
          gap:                     4,
          marginBottom:            isMobile ? 12 : 16,
          flexShrink:              0,
          overflowX:               isMobile ? 'auto'  : 'visible',
          WebkitOverflowScrolling: isMobile ? 'touch' : undefined,
          scrollbarWidth:          isMobile ? 'none'  : undefined,
          msOverflowStyle:         isMobile ? 'none'  : undefined,
          paddingBottom:           isMobile ? 2 : 0,
        }}
      >
        {STATUS_TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={tabStyle(tab === t)}>
            {t === 'all' ? 'All' : STATUS_META[t]?.label || t}
          </button>
        ))}
      </div>

      {/* ── Invoice list ── */}
      {isMobile ? (
        /* Mobile: card list */
        <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 80 }}>
          {filtered.length === 0 ? emptyState : filtered.map(inv => (
            <MobileInvoiceCard
              key={inv.id}
              inv={inv}
              onSelect={onSelect}
              onOpenReminder={onOpenReminder}
              onMarkPaid={onMarkPaid}
              onDelete={onDelete}
              isReadOnly={isReadOnly}
            />
          ))}
        </div>
      ) : (
        /* Desktop: table (unchanged) */
        <div className="invoices-table" style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 110px 110px 120px 110px 100px 32px', padding: '12px 20px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', flexShrink: 0 }}>
            {['Invoice #', 'Client', 'Issue Date', 'Due Date', 'Total', 'Status', 'Paid Date', ''].map(h => (
              <span key={h} style={{ fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
            ))}
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {filtered.length === 0 ? emptyState : (
              filtered.map(inv => (
                <div key={inv.id} onClick={() => onSelect(inv)}
                  style={{ display: 'grid', gridTemplateColumns: '140px 1fr 110px 110px 120px 110px 100px 32px', padding: '14px 20px', borderBottom: '1px solid #f9fafb', cursor: 'pointer', alignItems: 'center' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                  onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{inv.invoice_number}</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{inv.client_name || '—'}</div>
                    {inv.client_company && <div style={{ fontSize: 12, color: '#94a3b8' }}>{inv.client_company}</div>}
                  </div>
                  <span style={{ fontSize: 13, color: '#475569' }}>{inv.issue_date}</span>
                  <span style={{ fontSize: 13, color: inv.status === 'overdue' ? '#dc2626' : '#475569', fontWeight: inv.status === 'overdue' ? 600 : 400 }}>{inv.due_date || '—'}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{fmt(inv.total)}</span>
                  <StatusBadge status={inv.status} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#15803d' }}>
                    {inv.status === 'paid' && inv.payment_date ? `Paid: ${inv.payment_date}` : ''}
                  </span>
                  {inv.status !== 'paid' && inv.status !== 'draft' && inv.due_date && inv.due_date < todayStr() ? (
                    <span
                      onClick={e => { e.stopPropagation(); onOpenReminder(inv) }}
                      title="Send payment reminder"
                      style={{ fontSize: 16, lineHeight: 1, cursor: 'pointer', display: 'inline-flex', color: '#d97706' }}
                    >🔔</span>
                  ) : <span />}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ── FAB — mobile only (New Invoice floating action button) ── */}
      {isMobile && !isReadOnly && (
        <button
          data-tutorial="new-invoice"
          onClick={onNew}
          title="New Invoice"
          style={{
            position:   'fixed',
            bottom:     80,
            right:      16,
            width:      56,
            height:     56,
            borderRadius: '50%',
            background: 'var(--primary, #14b8a6)',
            color:      '#fff',
            border:     'none',
            boxShadow:  '0 4px 20px rgba(0,0,0,0.24)',
            cursor:     'pointer',
            display:    'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex:     50,
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Invoices() {
  const location    = useLocation()
  const { user }    = useAuth()
  const trialStatus = useTrialStatus()
  const isReadOnly  = trialStatus?.isReadOnly ?? false

  // Shared data from the global cache (no per-page fetch needed)
  const { clients, catalog, profile: settings, refreshClients } = useAppData()

  // view: 'list' | 'form' | 'recurring' | 'recurring-form'
  const [view, setView]                     = useState('list')
  const [editing, setEditing]               = useState(null)
  const [invoices, setInvoices]             = useState([])
  const [loading, setLoading]               = useState(true)
  const [toast, setToast]                   = useState(null)
  const [recurring, setRecurring]           = useState([])
  const [editingRecurring, setEditingRecurring] = useState(null)
  const [reminderInvoice,      setReminderInvoice]      = useState(null)
  // Mobile list-view actions: mark-paid and delete without opening the full form
  const [markPaidListInv,      setMarkPaidListInv]      = useState(null)
  const [deleteListConfirmInv, setDeleteListConfirmInv] = useState(null)
  const [deletingFromList,     setDeletingFromList]     = useState(false)
  const [pendingMarkPaidMethod, setPendingMarkPaidMethod] = useState(null)
  const [showMarkPaidEmailModalList, setShowMarkPaidEmailModalList] = useState(false)
  const [sendingPaymentEmailList, setSendingPaymentEmailList] = useState(false)

  // load() only fetches invoices — clients/settings/catalog come from AppDataContext
  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const { data: rawInvData } = await supabase
      .from('invoices')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    // Auto-overdue: update any invoice past due_date that isn't already paid/overdue
    const todayIso = new Date().toISOString().slice(0, 10)
    const overdueIds = (rawInvData ?? [])
      .filter(inv => inv.due_date && inv.due_date < todayIso && inv.status !== 'paid' && inv.status !== 'overdue')
      .map(inv => inv.id)
    if (overdueIds.length > 0) {
      await supabase.from('invoices').update({ status: 'overdue' }).in('id', overdueIds)
    }

    // Enrich with client names using the globally cached clients list
    const clientMap = {}
    for (const c of clients) clientMap[c.id] = c
    const enriched = (rawInvData ?? []).map(inv => ({
      ...inv,
      status:         overdueIds.includes(inv.id) ? 'overdue' : inv.status,
      client_name:    clientMap[inv.client_id]?.name || '',
      client_company: clientMap[inv.client_id]?.company_name || '',
    }))

    setInvoices(enriched)
    setLoading(false)
  }, [user, clients])

  const loadRecurring = useCallback(async () => {
    if (!user) return
    const { data } = await supabase
      .from('recurring_invoices')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    setRecurring(data ?? [])
  }, [user])

  useEffect(() => { load() }, [load])

  // Open a specific invoice when navigated here with state.openId (e.g. from estimate conversion)
  useEffect(() => {
    const openId = location.state?.openId
    if (!openId || loading) return
    Promise.all([
      supabase.from('invoices').select('*').eq('id', openId).single(),
      supabase.from('invoice_items').select('*').eq('invoice_id', openId),
    ]).then(([{ data: invData }, { data: itemsData }]) => {
      if (invData) { setEditing({ ...invData, items: itemsData ?? [] }); setView('form') }
    })
  }, [location.state?.openId, loading])

  // ── Regular invoice handlers ──────────────────────────────────────────────

  function openNew() { setEditing(null); setView('form') }

  async function openEdit(inv) {
    const [{ data: invData }, { data: itemsData }] = await Promise.all([
      supabase.from('invoices').select('*').eq('id', inv.id).single(),
      supabase.from('invoice_items').select('*').eq('invoice_id', inv.id),
    ])
    if (invData) { setEditing({ ...invData, items: itemsData ?? [] }); setView('form') }
  }

  function handleBack() { setView('list'); setEditing(null) }

  async function handleSaved(savedInv) {
    await load()
    setToast({ message: 'Invoice saved.', type: 'success' })
    const [{ data: invData }, { data: itemsData }] = await Promise.all([
      supabase.from('invoices').select('*').eq('id', savedInv.id).single(),
      supabase.from('invoice_items').select('*').eq('invoice_id', savedInv.id),
    ])
    if (invData) setEditing({ ...invData, items: itemsData ?? [] })
  }

  function handleDeleted() {
    load()
    setToast({ message: 'Invoice deleted.', type: 'success' })
    setView('list')
    setEditing(null)
  }

  function openReminder(inv) { setReminderInvoice(inv) }
  function closeReminder()   { setReminderInvoice(null) }
  function handleReminderSent() { setToast({ message: 'Reminder sent successfully.', type: 'success' }) }

  // ── Mobile list-action: mark as paid ─────────────────────────────────────
  async function confirmMarkPaidFromList(paymentMethod, paymentDate) {
    const inv = markPaidListInv
    setMarkPaidListInv(null)
    if (!inv) return
    const payDate = paymentDate || todayStr()
    const { error } = await supabase
      .from('invoices')
      .update({ status: 'paid', payment_method: paymentMethod, paid_at: new Date().toISOString(), amount_paid: inv.total, payment_date: payDate, previous_status: inv.status })
      .eq('id', inv.id).eq('user_id', user.id)
    if (error) { setToast({ message: error.message, type: 'error' }) }
    else { await load(); setToast({ message: 'Invoice marked as paid.', type: 'success' }) }
  }

  // Called from the "Mark Invoice as Paid" thank-you-email modal (mobile list
  // flow). Marks the invoice as paid (unchanged logic above), then optionally
  // sends a payment confirmation email via the user's configured SMTP/relay.
  async function handleConfirmMarkPaidWithEmailFromList({ sendEmail: shouldSend, to, subject, message, paymentDate }) {
    const inv = markPaidListInv
    const paymentMethod = pendingMarkPaidMethod
    setShowMarkPaidEmailModalList(false)
    setPendingMarkPaidMethod(null)
    await confirmMarkPaidFromList(paymentMethod, paymentDate)

    if (!shouldSend || !inv) return

    setSendingPaymentEmailList(true)
    try {
      const client = clients.find(c => c.id === inv.client_id)
      const businessName  = settings?.business_name || ''
      const businessEmail = settings?.email || settings?.smtp_user || ''
      const smtp = {
        host:      settings?.smtp_host      || '',
        port:      settings?.smtp_port      || '587',
        user:      settings?.smtp_user      || '',
        password:  settings?.smtp_password  || '',
        from_name: settings?.smtp_from_name || businessName || '',
      }
      if (!to || !smtp.host || !smtp.user || !smtp.password) return

      const html = generatePaymentConfirmationEmail({
        businessName,
        businessEmail,
        businessPhone: settings?.phone    || '',
        logoUrl:       settings?.logo_url || settings?.logo_path || '',
        primaryColor:  settings?.primary_color || '#14b8a6',
        clientName:    client?.company_name || client?.name || '',
        invoiceNumber: inv.invoice_number,
        amount:        inv.total,
        customMessage: message,
      })

      // Build a PDF of the now-paid invoice (with PAID watermark) to attach
      let pdfBuffer
      try {
        const { data: itemsData } = await supabase
          .from('invoice_items')
          .select('*')
          .eq('invoice_id', inv.id)

        const pdfData = {
          ...inv,
          amount_paid:    inv.total,
          status:         'paid',
          payment_date:   paymentDate || todayStr(),
          client_name:    client?.name || '',
          client_company: client?.company_name || '',
          client_email:   client?.email || '',
          client_phone:   client?.phone || '',
          client_address: client?.address || '',
          items:          itemsData ?? [],
        }
        pdfBuffer = await buildPdfBuffer(pdfData, settings, 'INVOICE')
      } catch (_) {
        pdfBuffer = undefined
      }

      await sendEmail({
        to,
        subject,
        message: message + PLAIN_TEXT_FOOTER,
        html,
        smtpHost:      smtp.host,
        smtpPort:      parseInt(smtp.port || '587', 10) || 587,
        smtpUser:      smtp.user,
        smtpPassword:  smtp.password,
        smtpFromName:  smtp.from_name,
        smtpFromEmail: smtp.user,
        pdfBuffer,
        fileName: `Invoice-${inv.invoice_number || 'paid'}.pdf`,
      })
    } catch (_) {
      // Non-fatal — the invoice has already been marked as paid.
    } finally {
      setSendingPaymentEmailList(false)
    }
  }

  // ── Mobile list-action: delete ────────────────────────────────────────────
  async function handleDeleteFromList() {
    const inv = deleteListConfirmInv
    if (!inv) return
    setDeletingFromList(true)
    const { error } = await supabase.from('invoices').delete().eq('id', inv.id).eq('user_id', user.id)
    setDeletingFromList(false)
    setDeleteListConfirmInv(null)
    if (error) { setToast({ message: error.message, type: 'error' }) }
    else { await load(); setToast({ message: 'Invoice deleted.', type: 'success' }) }
  }

  // ── Recurring invoice handlers ────────────────────────────────────────────

  function openRecurringList() {
    loadRecurring()
    setView('recurring')
  }

  function openNewRecurring() {
    setEditingRecurring(null)
    setView('recurring-form')
  }

  function openEditRecurring(rec) {
    setEditingRecurring(rec)
    setView('recurring-form')
  }

  async function handleRecurringSaved(data) {
    await loadRecurring()
    const msg = data?._firstInvoiceCreated
      ? 'Recurring invoice set up. Your first invoice has been created and is ready to send.'
      : 'Recurring invoice saved.'
    setToast({ message: msg, type: 'success' })
    setView('recurring')
    setEditingRecurring(null)
  }

  async function handleRecurringPauseResume(rec) {
    const newActive = !rec.is_active
    const { error } = await supabase
      .from('recurring_invoices')
      .update({ is_active: newActive })
      .eq('id', rec.id)
      .eq('user_id', user.id)
    if (!error) {
      setRecurring(prev => prev.map(r => r.id === rec.id ? { ...r, is_active: newActive } : r))
      setToast({ message: newActive ? 'Recurring invoice resumed.' : 'Recurring invoice paused.', type: 'success' })
    } else {
      setToast({ message: error.message, type: 'error' })
    }
  }

  async function handleRecurringDelete(id) {
    const { error } = await supabase
      .from('recurring_invoices')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)
    if (!error) {
      setRecurring(prev => prev.filter(r => r.id !== id))
      setToast({ message: 'Recurring invoice deleted.', type: 'success' })
    } else {
      setToast({ message: error.message, type: 'error' })
    }
  }

  if (loading && view === 'list') {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8', fontSize: 14 }}>Loading…</div>
  }

  return (
    <>
      <style>{`@keyframes fadeSlideUp { from { opacity: 0; transform: translateX(-50%) translateY(12px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }`}</style>

      {view === 'list' && (
        <ListView
          invoices={invoices}
          onNew={openNew}
          onRecurring={openRecurringList}
          onSelect={openEdit}
          onOpenReminder={openReminder}
          onMarkPaid={inv => setMarkPaidListInv(inv)}
          onDelete={inv  => setDeleteListConfirmInv(inv)}
          isReadOnly={isReadOnly}
        />
      )}

      {view === 'form' && (
        <InvoiceForm
          invoice={editing}
          clients={clients}
          catalog={catalog}
          settings={settings}
          onBack={handleBack}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
          isReadOnly={isReadOnly}
        />
      )}

      {view === 'recurring' && (
        <RecurringList
          recurring={recurring}
          clients={clients}
          onNew={openNewRecurring}
          onEdit={openEditRecurring}
          onPauseResume={handleRecurringPauseResume}
          onDelete={handleRecurringDelete}
          onBack={() => setView('list')}
          isReadOnly={isReadOnly}
        />
      )}

      {view === 'recurring-form' && (
        <RecurringForm
          recurringInvoice={editingRecurring}
          clients={clients}
          catalog={catalog}
          settings={settings}
          onBack={() => { setView('recurring'); setEditingRecurring(null) }}
          onSaved={handleRecurringSaved}
          isReadOnly={isReadOnly}
        />
      )}

      {reminderInvoice && (
        <ReminderModal
          invoice={reminderInvoice}
          clients={clients}
          settings={settings}
          onClose={closeReminder}
          onReminderSent={() => { closeReminder(); handleReminderSent() }}
        />
      )}

      {/* ── Mobile: PaymentMethodModal triggered from list card ── */}
      {markPaidListInv && !showMarkPaidEmailModalList && (
        <PaymentMethodModal
          methods={(() => {
            const raw = settings?.payment_methods
            if (raw) { try { const p = JSON.parse(raw); if (Array.isArray(p) && p.length) return p } catch (_) {} }
            return ['Cash', 'EFT / Bank Transfer', 'Credit Card', 'Debit Card']
          })()}
          defaultMethod={settings?.default_payment_method || ''}
          onConfirm={(method) => { setPendingMarkPaidMethod(method); setShowMarkPaidEmailModalList(true) }}
          onCancel={() => setMarkPaidListInv(null)}
        />
      )}

      {/* ── Mobile: Mark as Paid thank-you-email modal ── */}
      {markPaidListInv && showMarkPaidEmailModalList && (
        <MarkAsPaidEmailModal
          invoiceNumber={markPaidListInv.invoice_number}
          amount={markPaidListInv.total}
          clientName={markPaidListInv.client_company || markPaidListInv.client_name || ''}
          clientEmail={clients.find(c => c.id === markPaidListInv.client_id)?.email || ''}
          businessName={settings?.business_name || ''}
          saving={sendingPaymentEmailList}
          onConfirm={handleConfirmMarkPaidWithEmailFromList}
          onCancel={() => { setShowMarkPaidEmailModalList(false); setPendingMarkPaidMethod(null); setMarkPaidListInv(null) }}
        />
      )}

      {/* ── Mobile: Delete confirmation triggered from list card ── */}
      {deleteListConfirmInv && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 28, width: 340, maxWidth: '92vw', boxShadow: '0 20px 60px rgba(0,0,0,0.18)' }}>
            <h3 style={{ margin: '0 0 10px', fontSize: 17, fontWeight: 700, color: '#0f172a' }}>Delete Invoice?</h3>
            <p style={{ color: '#64748b', fontSize: 14, marginBottom: 22 }}>
              Delete <strong>{deleteListConfirmInv.invoice_number}</strong>? This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setDeleteListConfirmInv(null)}
                style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={handleDeleteFromList} disabled={deletingFromList}
                style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: '#ef4444', color: '#fff', fontWeight: 600, fontSize: 14, cursor: deletingFromList ? 'not-allowed' : 'pointer', opacity: deletingFromList ? 0.7 : 1 }}>
                {deletingFromList ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}
    </>
  )
}
