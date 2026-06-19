import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { PdfPreviewModal } from '../pdf/PdfPreviewModal'
import { SendEmailModal } from '../components/SendEmailModal'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useTrialStatus } from '../context/TrialContext'
import { useAppData } from '../context/AppDataContext'
import HelpButton from '../components/HelpButton'
import { buildPdfBuffer } from '../lib/pdfBuffer'
import { sendPdfViaWhatsApp, buildEstimateWhatsAppMessage } from '../lib/whatsapp'
import { WhatsAppButton } from '../components/WhatsAppButton'
import useIsMobile from '../hooks/useIsMobile'

const READONLY_MSG = 'Your trial has ended. Upgrade to continue.'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n) => {
  const num = Number(n) || 0
  return 'R\u00a0' + num.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const today = () => new Date().toISOString().slice(0, 10)
const addDays = (dateStr, days) => {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return ''
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

const STATUS_META = {
  draft:     { label: 'Draft',     bg: '#f1f5f9', color: '#475569' },
  sent:      { label: 'Sent',      bg: '#dbeafe', color: '#1d4ed8' },
  approved:  { label: 'Approved',  bg: '#dcfce7', color: '#15803d' },
  rejected:  { label: 'Rejected',  bg: '#fee2e2', color: '#dc2626' },
  converted: { label: 'Converted', bg: '#ede9fe', color: '#7c3aed' },
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
  const isMobile  = useIsMobile()
  const [expanded, setExpanded] = useState(false)

  function handleClick() {
    if (!isMobile || expanded) {
      onClick()
      setExpanded(false)
    } else {
      setExpanded(true)
    }
  }

  return (
    <button
      onClick={handleClick}
      title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: (!isMobile || expanded) ? 4 : 0,
        padding: '3px 9px', borderRadius: 20, fontSize: 12, fontWeight: 600,
        border: '1px solid #cbd5e1', background: expanded ? '#f1f5f9' : '#fff', color: '#64748b',
        cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
      }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
      </svg>
      {(!isMobile || expanded) && 'Undo'}
    </button>
  )
}

function RevertConfirmModal({ title = 'Revert Status?', message, confirmLabel = 'Confirm', confirmingLabel = 'Reverting…', danger = false, onConfirm, onCancel, confirming }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3200 }}>
      <div style={{ background: '#fff', borderRadius: 14, padding: 28, width: 380, maxWidth: '92vw', boxShadow: '0 20px 60px rgba(0,0,0,0.18)' }}>
        <h3 style={{ margin: '0 0 10px', fontSize: 17, fontWeight: 700, color: '#0f172a' }}>{title}</h3>
        <p style={{ color: '#64748b', fontSize: 14, marginBottom: 22 }}>{message}</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} disabled={confirming} style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 600, fontSize: 14, cursor: confirming ? 'not-allowed' : 'pointer' }}>Cancel</button>
          <button onClick={onConfirm} disabled={confirming} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: danger ? '#ef4444' : '#64748b', color: '#fff', fontWeight: 600, fontSize: 14, cursor: confirming ? 'not-allowed' : 'pointer', opacity: confirming ? 0.7 : 1 }}>
            {confirming ? confirmingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Mobile Estimate Card ─────────────────────────────────────────────────────

function MobileEstimateCard({ est, onSelect, onApprove, onDelete, isReadOnly }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    const fn = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false) }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [])

  const canApprove  = !['approved', 'converted', 'rejected'].includes(est.status)
  const canConvert  = est.status !== 'converted'

  const menuItems = [
    { label: 'View / Edit',        fn: () => { setMenuOpen(false); onSelect(est) } },
    {
      label:    'Approve Estimate',
      fn:       canApprove && !isReadOnly ? () => { setMenuOpen(false); onApprove(est) } : null,
      disabled: !canApprove || isReadOnly,
    },
    {
      label:    'Convert to Invoice',
      fn:       canConvert && !isReadOnly ? () => { setMenuOpen(false); onSelect(est) } : null,
      disabled: !canConvert || isReadOnly,
      note:     'Opens form',
    },
    { label: 'Send Estimate',   fn: () => { setMenuOpen(false); onSelect(est) } },
    { label: 'Download PDF',    fn: () => { setMenuOpen(false); onSelect(est) } },
    !isReadOnly && { label: 'Delete', fn: () => { setMenuOpen(false); onDelete(est) }, danger: true },
  ].filter(Boolean)

  return (
    <div
      onClick={() => onSelect(est)}
      style={{
        background:   '#fff',
        borderRadius: 8,
        boxShadow:    '0 1px 4px rgba(0,0,0,0.07)',
        border:       '1px solid #f1f5f9',
        padding:      16,
        marginBottom: 10,
        position:     'relative',
        cursor:       'pointer',
      }}
    >
      {/* ── Top row: estimate # + three-dot menu ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{est.estimate_number}</span>

        <div ref={menuRef} style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
          <button
            onClick={e => { e.stopPropagation(); setMenuOpen(o => !o) }}
            aria-label="More actions"
            style={{
              background:    'none', border: 'none', cursor: 'pointer',
              padding:       '4px 8px', borderRadius: 6,
              color:         '#94a3b8', fontSize: 20, lineHeight: 1, letterSpacing: 2,
            }}
          >···</button>

          {menuOpen && (
            <div style={{
              position:  'absolute', right: 0, top: '100%', zIndex: 200,
              background: '#fff', borderRadius: 10,
              boxShadow: '0 4px 24px rgba(0,0,0,0.14)',
              border:    '1px solid #e2e8f0',
              minWidth:  180, overflow: 'hidden', marginTop: 4,
            }}>
              {menuItems.map(item => (
                <button
                  key={item.label}
                  onClick={item.disabled ? undefined : item.fn}
                  style={{
                    display:    'block', width: '100%',
                    padding:    '12px 16px',
                    background: 'none', border: 'none',
                    cursor:     item.disabled ? 'default' : 'pointer',
                    textAlign:  'left',
                    fontSize:   14, fontWeight: 500,
                    color:      item.danger ? '#dc2626' : item.disabled ? '#cbd5e1' : '#0f172a',
                    fontFamily: 'inherit',
                    opacity:    item.disabled ? 0.5 : 1,
                  }}
                  onMouseEnter={e => { if (!item.disabled) e.currentTarget.style.background = item.danger ? '#fef2f2' : '#f8fafc' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
                >{item.label}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Client name ── */}
      <div style={{ fontSize: 13, color: '#64748b', marginBottom: 8 }}>
        {est.client_name || est.client_company || '—'}
      </div>

      {/* ── Amount + expiry date ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--primary, #14b8a6)' }}>{fmt(est.total)}</span>
        {est.expiry_date && (
          <span style={{ fontSize: 12, color: '#94a3b8' }}>Exp {est.expiry_date}</span>
        )}
      </div>

      {/* ── Status badge ── */}
      <StatusBadge status={est.status} />
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
    } catch (e) {
      setSaving(false)
      setError(e.message)
    }
  }

  const inp = (field) => ({
    value: form[field],
    onChange: e => setForm(p => ({ ...p, [field]: e.target.value })),
    style: {
      width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: 14,
      border: '1px solid #e2e8f0', background: '#f8fafc', color: '#0f172a',
      outline: 'none', boxSizing: 'border-box',
    },
  })

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000,
    }} onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: '#fff', borderRadius: 14, padding: 28, width: 400,
        boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
      }}>
        <h3 style={{ margin: '0 0 18px', fontSize: 17, fontWeight: 700, color: '#0f172a' }}>New Client</h3>
        {error && <p style={{ color: '#dc2626', fontSize: 13, marginBottom: 12 }}>{error}</p>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 5 }}>Name / Company *</label>
            <input {...inp('company_name')} placeholder="Client or company name" />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 5 }}>Email</label>
            <input {...inp('email')} placeholder="email@example.com" type="email" />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 5 }}>Phone</label>
            <input {...inp('phone')} placeholder="+27 ..." />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 22, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            padding: '9px 18px', borderRadius: 8, border: '1px solid #e2e8f0',
            background: '#fff', color: '#64748b', fontWeight: 600, fontSize: 14, cursor: 'pointer',
          }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{
            padding: '9px 18px', borderRadius: 8, border: 'none',
            background: '#14b8a6', color: '#fff', fontWeight: 600, fontSize: 14,
            cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
          }}>{saving ? 'Saving…' : 'Create Client'}</button>
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
    ? clients.filter(c =>
        (c.name || '').toLowerCase().includes(query.toLowerCase()) ||
        (c.company_name || '').toLowerCase().includes(query.toLowerCase())
      )
    : clients

  useEffect(() => {
    function handleClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div
        onClick={() => { setOpen(o => !o); setQuery('') }}
        style={{
          padding: '9px 12px', borderRadius: 8, border: '1px solid #e2e8f0',
          background: '#f8fafc', color: selected ? '#0f172a' : '#94a3b8',
          fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', userSelect: 'none', minHeight: 40,
        }}
      >
        <span>{selected ? (selected.company_name || selected.name) : 'Select client…'}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
      </div>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
          background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10,
          boxShadow: '0 8px 30px rgba(0,0,0,0.12)', marginTop: 4, overflow: 'hidden',
        }}>
          <div style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9' }}>
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search clients…"
              style={{
                width: '100%', padding: '7px 10px', borderRadius: 7, fontSize: 13,
                border: '1px solid #e2e8f0', background: '#f8fafc', color: '#0f172a',
                outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{ maxHeight: 220, overflowY: 'auto' }}>
            {filtered.map(c => (
              <div
                key={c.id}
                onMouseDown={() => { onChange(c.id); setOpen(false) }}
                style={{
                  padding: '10px 14px', cursor: 'pointer', fontSize: 14,
                  color: '#0f172a', background: value === c.id ? '#f0fdfa' : '#fff',
                }}
                onMouseEnter={e => e.currentTarget.style.background = value === c.id ? '#f0fdfa' : '#f8fafc'}
                onMouseLeave={e => e.currentTarget.style.background = value === c.id ? '#f0fdfa' : '#fff'}
              >
                <div style={{ fontWeight: 600 }}>{c.name}</div>
                {c.company_name && <div style={{ fontSize: 12, color: '#94a3b8' }}>{c.company_name}</div>}
              </div>
            ))}
            {filtered.length === 0 && (
              <div style={{ padding: '10px 14px', fontSize: 13, color: '#94a3b8' }}>No clients found</div>
            )}
          </div>
          <div
            onMouseDown={() => { setOpen(false); onAddNewClient() }}
            style={{
              padding: '10px 14px', borderTop: '1px solid #f1f5f9', cursor: 'pointer',
              fontSize: 13, fontWeight: 600, color: '#14b8a6',
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#f0fdfa'}
            onMouseLeave={e => e.currentTarget.style.background = '#fff'}
          >
            + Add New Client
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Autocomplete Input ───────────────────────────────────────────────────────

function AutocompleteInput({ value, onChange, catalog, placeholder }) {
  const [open, setOpen] = useState(false)
  const [focused, setFocused] = useState(false)
  const ref = useRef(null)

  const suggestions = value.trim()
    ? catalog.filter(i =>
        i.name.toLowerCase().includes(value.toLowerCase()) ||
        (i.description || '').toLowerCase().includes(value.toLowerCase())
      ).slice(0, 8)
    : []

  const showDropdown = focused && suggestions.length > 0

  useEffect(() => {
    function handleClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative', flex: 1 }}>
      <input
        value={value}
        onChange={e => onChange(e.target.value, null)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        style={{
          width: '100%', padding: '7px 10px', borderRadius: 7, fontSize: 13,
          border: '1px solid #e2e8f0', background: '#f8fafc', color: '#0f172a',
          outline: 'none', boxSizing: 'border-box',
        }}
      />
      {showDropdown && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 300,
          background: '#fff', border: '1px solid #e2e8f0', borderRadius: 9,
          boxShadow: '0 8px 24px rgba(0,0,0,0.1)', marginTop: 3, overflow: 'hidden',
        }}>
          {suggestions.map(item => (
            <div
              key={item.id}
              onMouseDown={() => onChange(item.name, item)}
              style={{ padding: '9px 12px', cursor: 'pointer', fontSize: 13, color: '#0f172a' }}
              onMouseEnter={e => e.currentTarget.style.background = '#f0fdfa'}
              onMouseLeave={e => e.currentTarget.style.background = '#fff'}
            >
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

// ─── Estimate Form ────────────────────────────────────────────────────────────

const newLineItem = () => ({ _key: Math.random().toString(36).slice(2), item_name: '', description: '', quantity: 1, unit_price: '', _catalogId: null })

function EstimateForm({ estimate, clients, catalog, settings, onBack, onSaved, onDeleted, isReadOnly }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { refreshClients, refreshCatalog } = useAppData()
  const isNew = !estimate

  const [form, setForm] = useState(() => {
    const issueDate = estimate?.issue_date || today()
    return {
      estimate_number: estimate?.estimate_number || '',
      client_id: estimate?.client_id || '',
      issue_date: issueDate,
      expiry_date: estimate?.expiry_date || addDays(issueDate, 7),
      notes: estimate?.notes || '',
      vat_enabled: estimate?.vat_enabled ?? false,
      status: estimate?.status || 'draft',
      previous_status: estimate?.previous_status || null,
    }
  })

  const [lineItems, setLineItems] = useState(() =>
    estimate?.items?.length
      ? estimate.items.map(i => ({ _key: Math.random().toString(36).slice(2), ...i }))
      : [newLineItem()]
  )

  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState({})
  const [showAddClient, setShowAddClient] = useState(false)
  const [extraClients, setExtraClients]   = useState([])
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [pdfOpen, setPdfOpen] = useState(false)
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [undoTarget, setUndoTarget] = useState(null) // 'approve' | 'convert' | null
  const [undoing, setUndoing] = useState(false)

  // Generate estimate number for new estimates
  useEffect(() => {
    if (!isNew || form.estimate_number) return
    async function genNumber() {
      const { data: existing } = await supabase
        .from('estimates').select('estimate_number').eq('user_id', user.id)
      const prefix = settings?.estimate_prefix || 'EST-'
      const start  = settings?.starting_estimate_number || 1
      const rows   = existing ?? []

      // Build a Set of all numbers already in the database so we can skip them
      const usedSet = new Set(rows.map(e => e.estimate_number))

      // Find the highest trailing number across all existing estimates
      const maxNum = rows.reduce((max, est) => {
        const match = (est.estimate_number || '').match(/(\d+)$/)
        return match ? Math.max(max, parseInt(match[1], 10)) : max
      }, 0)

      // Walk forward from max+1 until we find a number not yet in the database
      let seq = maxNum > 0 ? maxNum + 1 : start
      let candidate = `${prefix}${String(seq).padStart(4, '0')}`
      while (usedSet.has(candidate)) {
        seq++
        candidate = `${prefix}${String(seq).padStart(4, '0')}`
      }

      setForm(p => ({ ...p, estimate_number: candidate }))
    }
    genNumber()
  }, [])

  // Sync status from prop when it changes (e.g. after save refreshes parent)
  useEffect(() => {
    if (estimate) setForm(p => ({ ...p, status: estimate.status, previous_status: estimate.previous_status || null }))
  }, [estimate?.status, estimate?.previous_status])

  // VAT-inclusive: unit_price is the price the client pays (VAT already inside)
  const grossTotal = lineItems.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0), 0)
  const subtotal   = form.vat_enabled ? grossTotal / 1.15 : grossTotal
  const vatAmount  = form.vat_enabled ? grossTotal - subtotal : 0
  const total      = grossTotal

  const selectedClient = [...clients, ...extraClients].find(c => c.id === form.client_id)

  function setField(k, v) {
    setForm(p => {
      const next = { ...p, [k]: v }
      // Auto-update due date when issue date changes on new estimates
      if (k === 'issue_date' && isNew) {
        const newExpiry = addDays(v, 7)
        if (newExpiry) next.expiry_date = newExpiry
      }
      return next
    })
  }

  function updateLine(key, field, value) {
    setLineItems(prev => prev.map(li => {
      if (li._key !== key) return li
      const updated = { ...li, [field]: value }
      return updated
    }))
  }

  function selectCatalogItem(key, item) {
    setLineItems(prev => prev.map(li => {
      if (li._key !== key) return li
      return { ...li, item_name: item.name, description: item.description || '', unit_price: item.unit_price, _catalogId: item.id }
    }))
  }

  async function handleDescriptionBlur(key, value) {
    const li = lineItems.find(l => l._key === key)
    if (!li?._catalogId) return
    await supabase.from('items').update({ description: value || null }).eq('id', li._catalogId).eq('user_id', user.id)
  }

  function addLine() { setLineItems(p => [...p, newLineItem()]) }
  function removeLine(key) { setLineItems(p => p.filter(li => li._key !== key)) }

  function validate() {
    const errs = {}
    if (!form.client_id) errs.client_id = 'Select a client.'
    if (!form.issue_date) errs.issue_date = 'Required.'
    if (!form.expiry_date) errs.expiry_date = 'Required.'
    const validLines = lineItems.filter(li => li.item_name.trim())
    if (validLines.length === 0) errs.items = 'Add at least one line item.'
    return errs
  }

  async function handleSave(overrideStatus) {
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }

    // Duplicate-number guard: reject if this number already exists on a DIFFERENT estimate
    const { data: clash } = await supabase
      .from('estimates')
      .select('id')
      .eq('user_id', user.id)
      .eq('estimate_number', form.estimate_number)
      .limit(1)
    const clashId = clash?.[0]?.id
    if (clashId && clashId !== estimate?.id) {
      setErrors({ _global: `Estimate number ${form.estimate_number} is already in use. Please choose a different number.` })
      return
    }

    setSaving(true)
    setErrors({})

    const payload = {
      estimate_number: form.estimate_number,
      client_id: form.client_id || null,
      issue_date: form.issue_date,
      expiry_date: form.expiry_date,
      notes: form.notes || null,
      vat_enabled: form.vat_enabled,
      vat_rate: form.vat_enabled ? 15 : 0,
      subtotal,
      vat_amount: vatAmount,
      total,
      status: overrideStatus || form.status,
    }

    const items = lineItems
      .filter(li => li.item_name.trim())
      .map(li => ({
        item_name: li.item_name,
        description: li.description || null,
        quantity: Number(li.quantity) || 1,
        unit_price: Number(li.unit_price) || 0,
        line_total: (Number(li.quantity) || 1) * (Number(li.unit_price) || 0),
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
      let estimateId
      if (isNew) {
        const { data, error } = await supabase
          .from('estimates')
          .insert({ ...payload, user_id: user.id })
          .select()
          .single()
        if (error) throw new Error(error.message)
        estimateId = data.id
      } else {
        const { error } = await supabase
          .from('estimates')
          .update(payload)
          .eq('id', estimate.id)
          .eq('user_id', user.id)
        if (error) throw new Error(error.message)
        estimateId = estimate.id
        // Replace all line items
        const { error: delErr } = await supabase
          .from('estimate_items')
          .delete()
          .eq('estimate_id', estimateId)
        if (delErr) throw new Error(delErr.message)
      }

      if (items.length > 0) {
        const { error: itemsErr } = await supabase
          .from('estimate_items')
          .insert(items.map(i => ({ ...i, estimate_id: estimateId })))
        if (itemsErr) throw new Error(itemsErr.message)
      }

      setSaving(false)
      onSaved({ id: estimateId, ...payload })
    } catch (e) {
      setSaving(false)
      setErrors({ _global: e.message })
    }
  }

  async function handleConvert() {
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setSaving(true)
    setErrors({})

    const items = lineItems
      .filter(li => li.item_name.trim())
      .map(li => ({
        item_name: li.item_name,
        description: li.description || null,
        quantity: Number(li.quantity) || 1,
        unit_price: Number(li.unit_price) || 0,
        line_total: (Number(li.quantity) || 1) * (Number(li.unit_price) || 0),
      }))

    const estimatePayload = {
      estimate_number: form.estimate_number,
      client_id: form.client_id || null,
      issue_date: form.issue_date,
      expiry_date: form.expiry_date,
      notes: form.notes || null,
      vat_enabled: form.vat_enabled,
      vat_rate: form.vat_enabled ? 15 : 0,
      subtotal,
      vat_amount: vatAmount,
      total,
    }

    try {
      // Save / update the estimate
      let estimateId
      if (isNew) {
        const { data, error } = await supabase
          .from('estimates')
          .insert({ ...estimatePayload, status: 'draft', user_id: user.id })
          .select()
          .single()
        if (error) throw new Error(error.message)
        estimateId = data.id
      } else {
        const { error } = await supabase
          .from('estimates')
          .update(estimatePayload)
          .eq('id', estimate.id)
          .eq('user_id', user.id)
        if (error) throw new Error(error.message)
        estimateId = estimate.id
        await supabase.from('estimate_items').delete().eq('estimate_id', estimateId)
      }

      if (items.length > 0) {
        await supabase.from('estimate_items').insert(items.map(i => ({ ...i, estimate_id: estimateId })))
      }

      // Generate next invoice number from the highest existing number
      const [{ data: profile }, { data: existingInvoices }] = await Promise.all([
        supabase.from('profiles').select('invoice_prefix').eq('id', user.id).maybeSingle(),
        supabase.from('invoices').select('invoice_number').eq('user_id', user.id),
      ])
      const invPrefix = profile?.invoice_prefix || settings?.invoice_prefix || 'INV-'
      const invStart  = settings?.starting_invoice_number || 1
      const maxNum    = (existingInvoices ?? []).reduce((max, inv) => {
        const match = (inv.invoice_number || '').match(/(\d+)$/)
        return match ? Math.max(max, parseInt(match[1], 10)) : max
      }, 0)
      const invoiceNumber = `${invPrefix}${String(maxNum > 0 ? maxNum + 1 : invStart).padStart(4, '0')}`

      // Create invoice from estimate
      const { data: inv, error: invErr } = await supabase
        .from('invoices')
        .insert({
          invoice_number: invoiceNumber,
          client_id: form.client_id || null,
          issue_date: form.issue_date,
          due_date: form.expiry_date,
          notes: form.notes || null,
          vat_enabled: form.vat_enabled,
          vat_rate: form.vat_enabled ? 15 : 0,
          subtotal,
          vat_amount: vatAmount,
          total,
          status: 'draft',
          user_id: user.id,
        })
        .select()
        .single()
      if (invErr) throw new Error(invErr.message)

      if (items.length > 0) {
        await supabase.from('invoice_items').insert(items.map(i => ({ ...i, invoice_id: inv.id })))
      }

      // Mark estimate as converted, linking to the new invoice
      await supabase
        .from('estimates')
        .update({ status: 'converted', converted_invoice_id: inv.id, previous_status: form.status })
        .eq('id', estimateId)

      setSaving(false)
      navigate('/invoices')
    } catch (e) {
      setSaving(false)
      setErrors({ _global: e.message })
    }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      const { error } = await supabase
        .from('estimates')
        .delete()
        .eq('id', estimate.id)
        .eq('user_id', user.id)
      setDeleting(false)
      if (error) setErrors({ _global: error.message })
      else onDeleted()
    } catch (e) {
      setDeleting(false)
      setErrors({ _global: e.message })
    }
  }

  async function handleUndo() {
    if (!undoTarget) return
    setUndoing(true)
    try {
      if (undoTarget === 'convert') {
        const invoiceId = estimate.converted_invoice_id
        if (invoiceId) {
          await supabase.from('invoice_items').delete().eq('invoice_id', invoiceId)
          await supabase.from('invoices').delete().eq('id', invoiceId).eq('user_id', user.id)
        }
        const revertStatus = form.previous_status || 'draft'
        const { error } = await supabase
          .from('estimates')
          .update({ status: revertStatus, previous_status: null, converted_invoice_id: null })
          .eq('id', estimate.id)
          .eq('user_id', user.id)
        setUndoing(false)
        setUndoTarget(null)
        if (error) { setErrors({ _global: error.message }); return }
        onSaved({ id: estimate.id, status: revertStatus, previous_status: null, converted_invoice_id: null })
      } else {
        const { error } = await supabase
          .from('estimates')
          .update({ status: form.previous_status, previous_status: null })
          .eq('id', estimate.id)
          .eq('user_id', user.id)
        setUndoing(false)
        setUndoTarget(null)
        if (error) { setErrors({ _global: error.message }); return }
        onSaved({ id: estimate.id, status: form.previous_status, previous_status: null })
      }
    } catch (e) {
      setUndoing(false)
      setErrors({ _global: e.message })
    }
  }

  const [waLoading, setWaLoading] = useState(false)
  const [waToast, setWaToast] = useState(null)

  async function handleSendWhatsApp() {
    if (waLoading) return
    setWaToast(null)
    setWaLoading(true)
    try {
      const pdfData = {
        ...(estimate || {}),
        estimate_number: form.estimate_number,
        issue_date:      form.issue_date,
        expiry_date:     form.expiry_date,
        notes:           form.notes,
        vat_enabled:     form.vat_enabled,
        vat_rate:        form.vat_enabled ? 15 : 0,
        subtotal,
        vat_amount:      vatAmount,
        total,
        status:          form.status,
        client_name:     selectedClient?.name || '',
        client_company:  selectedClient?.company_name || '',
        client_email:    selectedClient?.email || '',
        client_phone:    selectedClient?.phone || '',
        client_address:  selectedClient?.address || '',
        items:           lineItems.filter(li => li.item_name.trim()),
      }

      let arrayBuffer
      try {
        arrayBuffer = await buildPdfBuffer(pdfData, settings, 'ESTIMATE')
      } catch {
        setWaToast({ message: 'Could not generate PDF. Please try again.', type: 'error' })
        setWaLoading(false)
        return
      }

      const blob         = new Blob([arrayBuffer], { type: 'application/pdf' })
      const filename     = `Estimate-${form.estimate_number || 'draft'}.pdf`
      const businessName = settings?.business_name || ''
      const clientName   = selectedClient?.company_name || selectedClient?.name || 'there'
      const message = buildEstimateWhatsAppMessage({
        clientName,
        estimateNumber: form.estimate_number,
        amount:         fmt(total),
        expiryDate:     form.expiry_date,
        businessName,
        template:       settings?.whatsapp_default_message || undefined,
      })

      const result = await sendPdfViaWhatsApp({
        blob, filename, message,
        phone: selectedClient?.phone,
        title: `Estimate ${form.estimate_number} from ${businessName}`,
      })

      // Mark estimate as sent when WhatsApp is initiated (draft → sent)
      if (estimate?.id && form.status === 'draft') {
        await supabase.from('estimates').update({ status: 'sent' }).eq('id', estimate.id)
        onSaved({ id: estimate.id, status: 'sent' })
        setForm(p => ({ ...p, status: 'sent' }))
      }

      if (result.status === 'fallback') {
        setWaToast({ message: 'Your PDF has been downloaded. Attach it to the WhatsApp message.', type: 'success' })
      }
    } catch (e) {
      setWaToast({ message: e.message || 'Could not open WhatsApp. Please check your browser settings.', type: 'error' })
    }
    setWaLoading(false)
  }

  const isMobile = useIsMobile()

  const btnStyle = (bg, color = '#fff') => ({
    padding: '9px 18px', borderRadius: 8, border: 'none', background: bg,
    color, fontWeight: 600, fontSize: 13, cursor: saving ? 'not-allowed' : 'pointer',
    opacity: saving ? 0.7 : 1,
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
        padding: isMobile ? '10px 16px' : '14px 28px',
        display: 'flex', flexDirection: isMobile ? 'column' : 'row',
        alignItems: isMobile ? 'stretch' : 'center',
        justifyContent: isMobile ? undefined : 'space-between',
        gap: isMobile ? 8 : 0,
        flexShrink: 0,
      }}>

        {/* ── Row 1: Back + (desktop: title & status) + action buttons ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 6 : 14, minWidth: 0, flex: isMobile ? undefined : 1 }}>
            <button
              onClick={onBack}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center', gap: 5, fontSize: 14, fontWeight: 600, flexShrink: 0 }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
              Back
            </button>
            {!isMobile && (
              <>
                <span style={{ color: '#e2e8f0', fontWeight: 300 }}>|</span>
                {isNew ? (
                  <h2 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: 0 }}>New Estimate</h2>
                ) : (
                  <h2 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    Estimate {form.estimate_number}
                  </h2>
                )}
                {!isNew && (
                  <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <StatusBadge status={form.status} />
                    {form.status === 'approved' && form.previous_status && (
                      <UndoButton title="Undo Approve" onClick={() => setUndoTarget('approve')} />
                    )}
                    {form.status === 'converted' && (
                      <>
                        <button
                          onClick={() => estimate?.converted_invoice_id && navigate('/invoices', { state: { openId: estimate.converted_invoice_id } })}
                          disabled={!estimate?.converted_invoice_id}
                          style={{ background: 'none', border: 'none', padding: 0, fontSize: 12, fontWeight: 600, color: '#7c3aed', textDecoration: 'underline', cursor: estimate?.converted_invoice_id ? 'pointer' : 'default', fontFamily: 'inherit' }}
                        >
                          Converted — view invoice
                        </button>
                        {!isReadOnly && (
                          <UndoButton title="Undo Convert to Invoice" onClick={() => setUndoTarget('convert')} />
                        )}
                      </>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Desktop: full action buttons */}
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
              {!isReadOnly && (
                <button onClick={() => handleSave()} disabled={saving} style={btnStyle('#14b8a6')}>
                  {saving ? 'Saving…' : 'Save Draft'}
                </button>
              )}
              {!isReadOnly && !isNew && form.status !== 'converted' && (
                <button onClick={handleConvert} disabled={saving} style={btnStyle('#7c3aed')}>
                  {saving ? 'Converting…' : 'Convert to Invoice'}
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

          {/* Mobile: compact icon buttons */}
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

        {/* ── Row 2 (mobile only): number pill + status + undo chips ── */}
        {isMobile && !isNew && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{
              display: 'inline-block', padding: '3px 9px', borderRadius: 6,
              fontSize: 12, fontWeight: 700, background: '#f1f5f9', color: '#475569',
              border: '1px solid #e2e8f0',
            }}>
              {form.estimate_number}
            </span>
            <StatusBadge status={form.status} />
            {form.status === 'approved' && form.previous_status && (
              <UndoButton title="Undo Approve" onClick={() => setUndoTarget('approve')} />
            )}
            {form.status === 'converted' && (
              <>
                <button
                  onClick={() => estimate?.converted_invoice_id && navigate('/invoices', { state: { openId: estimate.converted_invoice_id } })}
                  disabled={!estimate?.converted_invoice_id}
                  style={{ background: 'none', border: 'none', padding: 0, fontSize: 12, fontWeight: 600, color: '#7c3aed', textDecoration: 'underline', cursor: estimate?.converted_invoice_id ? 'pointer' : 'default', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
                >
                  view invoice
                </button>
                {!isReadOnly && (
                  <UndoButton title="Undo Convert to Invoice" onClick={() => setUndoTarget('convert')} />
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Body ── */}
      <div style={{
        flex: 1, overflowY: 'auto',
        padding: isMobile ? 16 : '28px 40px',
        /* Two-row action bar (Convert + Cancel/Save) needs more clearance than Invoices */
        paddingBottom: isMobile ? 'calc(148px + env(safe-area-inset-bottom))' : undefined,
      }}>
        <div style={{ maxWidth: 860, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: isMobile ? 14 : 20 }}>

          {/* ── Details card ── */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: isMobile ? 16 : 24 }}>
            <h3 style={{ margin: `0 0 ${isMobile ? 12 : 16}px`, fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Details</h3>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 14 : 20 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 6 }}>Client *</label>
                <ClientSelector
                  clients={[...clients, ...extraClients]}
                  value={form.client_id}
                  onChange={v => setField('client_id', v)}
                  onAddNewClient={() => setShowAddClient(true)}
                />
                {errors.client_id && <p style={{ color: '#ef4444', fontSize: 12, marginTop: 4 }}>{errors.client_id}</p>}
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 6 }}>Estimate #</label>
                <input value={form.estimate_number} onChange={e => setField('estimate_number', e.target.value)} style={inputStyle(false)} />
              </div>
              {/* Empty spacer — desktop only */}
              {!isMobile && <div />}
              {/* Dates: side by side on mobile, separate columns on desktop */}
              <div style={{ display: isMobile ? 'grid' : 'contents', gridTemplateColumns: isMobile ? '1fr 1fr' : undefined, gap: isMobile ? 10 : undefined, minWidth: 0 }}>
                <div style={{ minWidth: 0 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 6 }}>Issue Date *</label>
                  <input type="date" value={form.issue_date} onChange={e => setField('issue_date', e.target.value)} style={{ ...inputStyle(!!errors.issue_date), maxWidth: '100%' }} />
                  {errors.issue_date && <p style={{ color: '#ef4444', fontSize: 12, marginTop: 4 }}>{errors.issue_date}</p>}
                </div>
                <div style={{ minWidth: 0 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 6 }}>Expiry Date *</label>
                  <input type="date" value={form.expiry_date} onChange={e => setField('expiry_date', e.target.value)} style={{ ...inputStyle(!!errors.expiry_date), maxWidth: '100%' }} />
                  {errors.expiry_date && <p style={{ color: '#ef4444', fontSize: 12, marginTop: 4 }}>{errors.expiry_date}</p>}
                </div>
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
                    <button
                      onClick={() => removeLine(li._key)}
                      disabled={lineItems.length === 1}
                      style={{ position: 'absolute', top: 8, right: 8, background: 'none', border: 'none', cursor: lineItems.length === 1 ? 'default' : 'pointer', color: '#94a3b8', padding: 4, display: 'flex' }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>

                    <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 8 }}>Item {idx + 1}</div>

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

            <div style={{ padding: isMobile ? '12px 16px' : '12px 20px', borderTop: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: isMobile ? 'flex-end' : 'space-between' }}>
              {!isMobile && (
                <button onClick={addLine} style={{ background: 'none', border: 'none', color: '#14b8a6', fontWeight: 600, fontSize: 13, cursor: 'pointer', padding: 0 }}>
                  + Add Line
                </button>
              )}
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
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: '2px solid #e2e8f0', fontSize: 15, fontWeight: 700, color: '#0f172a' }}>
                  <span>Total</span><span>{fmt(total)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Notes ── */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: isMobile ? 16 : 24 }}>
            <h3 style={{ margin: `0 0 ${isMobile ? 10 : 12}px`, fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Notes</h3>
            <textarea
              value={form.notes}
              onChange={e => setField('notes', e.target.value)}
              placeholder="Any additional notes for the client…"
              rows={4}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, fontSize: 14, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#0f172a', outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }}
            />
          </div>

        </div>
      </div>

      {/* ── Mobile fixed bottom action bar ── */}
      {isMobile && (
        <div style={{
          position:      'fixed',
          bottom:        0, left: 0, right: 0,
          background:    '#fff',
          borderTop:     '1px solid #e2e8f0',
          padding:       '12px 16px',
          paddingBottom: 'calc(12px + env(safe-area-inset-bottom))',
          boxShadow:     '0 -2px 16px rgba(0,0,0,0.08)',
          zIndex:        110,  /* above BottomNav (100) */
        }}>
          {errors._global && <p style={{ color: '#ef4444', fontSize: 12, margin: '0 0 6px' }}>{errors._global}</p>}

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

          {/* Convert to Invoice — full-width button above the main row */}
          {!isReadOnly && !isNew && form.status !== 'converted' && (
            <button
              onClick={handleConvert}
              disabled={saving}
              style={{ display: 'block', width: '100%', padding: '11px', borderRadius: 8, border: 'none', background: '#7c3aed', color: '#fff', fontWeight: 600, fontSize: 14, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, fontFamily: 'inherit', marginBottom: 8 }}>
              {saving ? 'Converting…' : 'Convert to Invoice'}
            </button>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onBack}
              style={{ flex: 1, padding: '11px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
              Cancel
            </button>
            {!isReadOnly && (
              <button onClick={() => handleSave()} disabled={saving}
                style={{ flex: 2, padding: '11px', borderRadius: 8, border: 'none', background: '#14b8a6', color: '#fff', fontWeight: 600, fontSize: 14, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, fontFamily: 'inherit' }}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000,
        }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 28, width: 380, boxShadow: '0 20px 60px rgba(0,0,0,0.18)' }}>
            <h3 style={{ margin: '0 0 10px', fontSize: 17, fontWeight: 700, color: '#0f172a' }}>Delete Estimate?</h3>
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

      {/* Revert status confirmation modal */}
      {undoTarget === 'approve' && (
        <RevertConfirmModal
          message={`Revert this estimate back to ${STATUS_META[form.previous_status]?.label || form.previous_status}?`}
          onConfirm={handleUndo}
          onCancel={() => setUndoTarget(null)}
          confirming={undoing}
        />
      )}

      {/* Undo convert-to-invoice confirmation modal */}
      {undoTarget === 'convert' && (
        <RevertConfirmModal
          title="Delete Generated Invoice?"
          message={`This will permanently delete the invoice that was created from this estimate and revert this estimate back to ${STATUS_META[form.previous_status || 'draft']?.label || 'Draft'}. This cannot be undone.`}
          confirmLabel="Delete & Revert"
          confirmingLabel="Deleting…"
          danger
          onConfirm={handleUndo}
          onCancel={() => setUndoTarget(null)}
          confirming={undoing}
        />
      )}

      {/* WhatsApp send toast */}
      {waToast && (
        <Toast message={waToast.message} type={waToast.type} onDone={() => setWaToast(null)} />
      )}

      {/* Add Client modal */}
      {showAddClient && (
        <AddClientModal
          onClose={() => setShowAddClient(false)}
          onCreated={client => {
            setShowAddClient(false)
            setExtraClients(prev => [...prev, client])
            setField('client_id', client.id)
            refreshClients()
          }}
        />
      )}

      {/* PDF Preview + Email modals */}
      {(pdfOpen || showEmailModal) && (() => {
        const selectedClient = [...clients, ...extraClients].find(c => c.id === form.client_id)
        const pdfData = {
          ...(estimate || {}),
          estimate_number: form.estimate_number,
          issue_date: form.issue_date,
          expiry_date: form.expiry_date,
          notes: form.notes,
          vat_enabled: form.vat_enabled,
          vat_rate: form.vat_enabled ? 15 : 0,
          subtotal,
          vat_amount: vatAmount,
          total,
          status: form.status,
          client_name: selectedClient?.name || '',
          client_company: selectedClient?.company_name || '',
          client_email: selectedClient?.email || '',
          client_phone: selectedClient?.phone || '',
          client_address: selectedClient?.address || '',
          items: lineItems.filter(li => li.item_name.trim()),
        }
        return (
          <>
            <PdfPreviewModal
              isOpen={pdfOpen}
              data={pdfData}
              settings={settings}
              docType="ESTIMATE"
              onClose={() => setPdfOpen(false)}
            />
            <SendEmailModal
              isOpen={showEmailModal}
              data={pdfData}
              settings={settings}
              docType="ESTIMATE"
              clientEmail={selectedClient?.email || ''}
              onClose={() => setShowEmailModal(false)}
              onSent={async () => {
                if (estimate?.id && form.status === 'draft') {
                  await supabase.from('estimates').update({ status: 'sent' }).eq('id', estimate.id)
                  onSaved({ id: estimate.id, status: 'sent' })
                  setForm(p => ({ ...p, status: 'sent' }))
                }
              }}
            />
          </>
        )
      })()}
    </div>
  )
}

// ─── List View ────────────────────────────────────────────────────────────────

const STATUS_TABS = ['all', 'draft', 'sent', 'approved', 'rejected']

function ListView({ estimates, onNew, onSelect, onApprove, onDelete, isReadOnly }) {
  const [tab, setTab] = useState('all')
  const isMobile      = useIsMobile()

  // 'approved' tab shows both approved and converted estimates
  const filtered = tab === 'all'
    ? estimates
    : tab === 'approved'
      ? estimates.filter(e => e.status === 'approved' || e.status === 'converted')
      : estimates.filter(e => e.status === tab)

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
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
      <p style={{ fontSize: 14, margin: 0 }}>{tab === 'all' ? 'No estimates yet' : `No ${tab} estimates`}</p>
      {tab === 'all' && <p style={{ fontSize: 12, marginTop: 4 }}>
        {isMobile ? 'Tap the + button to create one.' : 'Click "New Estimate" to create one.'}
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
            <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>Estimates</h1>
            <p style={{ color: '#64748b', fontSize: 14, margin: 0 }}>Create and send estimates to your clients.</p>
          </div>
        )}

        <div style={{
          display:        'flex',
          alignItems:     'center',
          gap:            10,
          width:          isMobile ? '100%' : 'auto',
          justifyContent: isMobile ? 'flex-end' : 'flex-end',
        }}>
          {/* New Estimate button — desktop only; mobile uses FAB */}
          {!isMobile && (
            <button
              onClick={isReadOnly ? undefined : onNew}
              disabled={isReadOnly}
              title={isReadOnly ? READONLY_MSG : undefined}
              style={{ background: '#14b8a6', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontSize: 14, fontWeight: 600, cursor: isReadOnly ? 'not-allowed' : 'pointer', opacity: isReadOnly ? 0.45 : 1 }}
            >
              + New Estimate
            </button>
          )}
          <HelpButton page="estimates" />
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

      {/* ── Estimate list ── */}
      {isMobile ? (
        /* Mobile: card list */
        <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 80 }}>
          {filtered.length === 0 ? emptyState : filtered.map(est => (
            <MobileEstimateCard
              key={est.id}
              est={est}
              onSelect={onSelect}
              onApprove={onApprove}
              onDelete={onDelete}
              isReadOnly={isReadOnly}
            />
          ))}
        </div>
      ) : (
        /* Desktop: table (unchanged) */
        <div className="estimates-table" style={{
          background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)', overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column',
        }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '140px 1fr 120px 120px 120px 110px',
            padding: '12px 20px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', flexShrink: 0,
          }}>
            {['Estimate #', 'Client', 'Issue Date', 'Expiry Date', 'Total', 'Status'].map(h => (
              <span key={h} style={{ fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
            ))}
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {filtered.length === 0 ? emptyState : (
              filtered.map(est => (
                <div
                  key={est.id}
                  onClick={() => onSelect(est)}
                  style={{
                    display: 'grid', gridTemplateColumns: '140px 1fr 120px 120px 120px 110px',
                    padding: '14px 20px', borderBottom: '1px solid #f9fafb',
                    cursor: 'pointer', alignItems: 'center',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                  onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                >
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{est.estimate_number}</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{est.client_name || '—'}</div>
                    {est.client_company && <div style={{ fontSize: 12, color: '#94a3b8' }}>{est.client_company}</div>}
                  </div>
                  <span style={{ fontSize: 13, color: '#475569' }}>{est.issue_date}</span>
                  <span style={{ fontSize: 13, color: '#475569' }}>{est.expiry_date}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{fmt(est.total)}</span>
                  <StatusBadge status={est.status} />
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ── FAB — mobile only ── */}
      {isMobile && !isReadOnly && (
        <button
          onClick={onNew}
          title="New Estimate"
          style={{
            position:       'fixed',
            bottom:         80,
            right:          16,
            width:          56,
            height:         56,
            borderRadius:   '50%',
            background:     'var(--primary, #14b8a6)',
            color:          '#fff',
            border:         'none',
            boxShadow:      '0 4px 20px rgba(0,0,0,0.24)',
            cursor:         'pointer',
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            zIndex:         50,
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

export default function Estimates() {
  const trialStatus = useTrialStatus()
  const isReadOnly  = trialStatus?.isReadOnly ?? false
  const { user } = useAuth()
  const location = useLocation()

  // Shared data from global cache
  const { clients, catalog, profile: settings, refreshClients } = useAppData()

  const [view, setView] = useState('list')
  const [editing, setEditing] = useState(null)
  const [estimates, setEstimates] = useState([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)
  // Mobile list-view actions
  const [approveListEst,       setApproveListEst]       = useState(null)
  const [deleteListConfirmEst, setDeleteListConfirmEst] = useState(null)
  const [deletingFromList,     setDeletingFromList]     = useState(false)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const { data: estData } = await supabase
      .from('estimates').select('*').eq('user_id', user.id).order('created_at', { ascending: false })

    const clientMap = {}
    for (const c of clients) clientMap[c.id] = c
    const enriched = (estData ?? []).map(e => ({
      ...e,
      client_name:    clientMap[e.client_id]?.name    || '',
      client_company: clientMap[e.client_id]?.company_name || '',
    }))

    setEstimates(enriched)
    setLoading(false)
  }, [user, clients])

  useEffect(() => { load() }, [load])

  // Open a specific estimate when navigated here with state.openId
  // (e.g. from the "Undo Convert" action on an invoice)
  useEffect(() => {
    const openId = location.state?.openId
    if (!openId || loading) return
    Promise.all([
      supabase.from('estimates').select('*').eq('id', openId).single(),
      supabase.from('estimate_items').select('*').eq('estimate_id', openId),
    ]).then(([{ data: estData }, { data: itemsData }]) => {
      if (estData) {
        setEditing({ ...estData, items: itemsData ?? [] })
        setView('form')
      }
    })
  }, [location.state?.openId, loading])

  function openNew() { setEditing(null); setView('form') }

  async function openEdit(est) {
    const [{ data: estData }, { data: itemsData }] = await Promise.all([
      supabase.from('estimates').select('*').eq('id', est.id).single(),
      supabase.from('estimate_items').select('*').eq('estimate_id', est.id),
    ])
    if (estData) {
      setEditing({ ...estData, items: itemsData ?? [] })
      setView('form')
    }
  }

  function handleBack() { setView('list'); setEditing(null) }

  async function handleSaved(savedEst) {
    await load()
    setToast({ message: 'Estimate saved.', type: 'success' })
    // Re-open with full data (includes items array)
    const [{ data: estData }, { data: itemsData }] = await Promise.all([
      supabase.from('estimates').select('*').eq('id', savedEst.id).single(),
      supabase.from('estimate_items').select('*').eq('estimate_id', savedEst.id),
    ])
    if (estData) setEditing({ ...estData, items: itemsData ?? [] })
  }

  function handleDeleted() {
    load()
    setToast({ message: 'Estimate deleted.', type: 'success' })
    setView('list')
    setEditing(null)
  }

  // ── Mobile list-action: approve ───────────────────────────────────────────
  async function handleApproveFromList(est) {
    setApproveListEst(null)
    const { error } = await supabase
      .from('estimates')
      .update({ status: 'approved', previous_status: est.status })
      .eq('id', est.id)
      .eq('user_id', user.id)
    if (error) { setToast({ message: error.message, type: 'error' }) }
    else { await load(); setToast({ message: 'Estimate approved.', type: 'success' }) }
  }

  // ── Mobile list-action: delete ────────────────────────────────────────────
  async function handleDeleteFromList() {
    const est = deleteListConfirmEst
    if (!est) return
    setDeletingFromList(true)
    const { error } = await supabase.from('estimates').delete().eq('id', est.id).eq('user_id', user.id)
    setDeletingFromList(false)
    setDeleteListConfirmEst(null)
    if (error) { setToast({ message: error.message, type: 'error' }) }
    else { await load(); setToast({ message: 'Estimate deleted.', type: 'success' }) }
  }

  if (loading && view === 'list') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8', fontSize: 14 }}>
        Loading…
      </div>
    )
  }

  return (
    <>
      <style>{`@keyframes fadeSlideUp { from { opacity: 0; transform: translateX(-50%) translateY(12px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }`}</style>
      {view === 'list'
        ? <ListView
            estimates={estimates}
            onNew={openNew}
            onSelect={openEdit}
            onApprove={est => handleApproveFromList(est)}
            onDelete={est => setDeleteListConfirmEst(est)}
            isReadOnly={isReadOnly}
          />
        : <EstimateForm
            estimate={editing}
            clients={clients}
            catalog={catalog}
            settings={settings}
            onBack={handleBack}
            onSaved={handleSaved}
            onDeleted={handleDeleted}
            isReadOnly={isReadOnly}
          />
      }
      {/* ── Mobile: Delete confirmation from list card ── */}
      {deleteListConfirmEst && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 28, width: 340, maxWidth: '92vw', boxShadow: '0 20px 60px rgba(0,0,0,0.18)' }}>
            <h3 style={{ margin: '0 0 10px', fontSize: 17, fontWeight: 700, color: '#0f172a' }}>Delete Estimate?</h3>
            <p style={{ color: '#64748b', fontSize: 14, marginBottom: 22 }}>
              Delete <strong>{deleteListConfirmEst.estimate_number}</strong>? This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setDeleteListConfirmEst(null)}
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
