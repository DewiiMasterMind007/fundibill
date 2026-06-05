import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { PdfPreviewModal } from '../pdf/PdfPreviewModal'
import { SendEmailModal } from '../components/SendEmailModal'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useTrialStatus } from '../context/TrialContext'
import { useAppData } from '../context/AppDataContext'
import HelpButton from '../components/HelpButton'

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
    if (estimate) setForm(p => ({ ...p, status: estimate.status }))
  }, [estimate?.status])

  // VAT-inclusive: unit_price is the price the client pays (VAT already inside)
  const grossTotal = lineItems.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0), 0)
  const subtotal   = form.vat_enabled ? grossTotal / 1.15 : grossTotal
  const vatAmount  = form.vat_enabled ? grossTotal - subtotal : 0
  const total      = grossTotal

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

      // Mark estimate as converted
      await supabase
        .from('estimates')
        .update({ status: 'converted' })
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
      {/* Header bar */}
      <div style={{
        background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '14px 28px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button
            onClick={onBack}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center', gap: 5, fontSize: 14, fontWeight: 600 }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            Back
          </button>
          <span style={{ color: '#e2e8f0', fontWeight: 300 }}>|</span>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: 0 }}>
            {isNew ? 'New Estimate' : `Estimate ${form.estimate_number}`}
          </h2>
          {!isNew && <StatusBadge status={form.status} />}
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {errors._global && <span style={{ color: '#ef4444', fontSize: 13 }}>{errors._global}</span>}

          {isReadOnly && (
            <span style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', background: '#f1f5f9', borderRadius: 6, padding: '4px 10px' }}>
              View only
            </span>
          )}

          {!isNew && (
            <button
              onClick={() => setPdfOpen(true)}
              style={{ padding: '9px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#475569', fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              Preview PDF
            </button>
          )}

          {/* Send by Email — only for saved estimates, not read-only */}
          {!isNew && !isReadOnly && (
            <button
              onClick={() => setShowEmailModal(true)}
              style={{ padding: '9px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#475569', fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                <polyline points="22,6 12,13 2,6"/>
              </svg>
              Send by Email
            </button>
          )}

          {/* Write actions — hidden in read-only mode */}
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
            <button
              onClick={() => setConfirmDelete(true)}
              style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #fecaca', background: '#fff', color: '#dc2626', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '28px 40px' }}>
        <div style={{ maxWidth: 860, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Client + Dates card */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 24 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Details</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
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
                <input
                  value={form.estimate_number}
                  onChange={e => setField('estimate_number', e.target.value)}
                  style={inputStyle(false)}
                />
              </div>
              <div />
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 6 }}>Issue Date *</label>
                <input type="date" value={form.issue_date} onChange={e => setField('issue_date', e.target.value)} style={inputStyle(!!errors.issue_date)} />
                {errors.issue_date && <p style={{ color: '#ef4444', fontSize: 12, marginTop: 4 }}>{errors.issue_date}</p>}
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 6 }}>Due Date *</label>
                <input type="date" value={form.expiry_date} onChange={e => setField('expiry_date', e.target.value)} style={inputStyle(!!errors.expiry_date)} />
                {errors.expiry_date && <p style={{ color: '#ef4444', fontSize: 12, marginTop: 4 }}>{errors.expiry_date}</p>}
              </div>
            </div>
          </div>

          {/* Line Items */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Line Items</h3>
              {errors.items && <span style={{ color: '#ef4444', fontSize: 12 }}>{errors.items}</span>}
            </div>

            {/* Column headers */}
            <div style={{
              display: 'grid', gridTemplateColumns: '2fr 2fr 80px 110px 24px',
              gap: 8, padding: '8px 20px', background: '#f8fafc',
              borderBottom: '1px solid #f1f5f9',
            }}>
              {['Item', 'Description', 'Qty', 'Unit Price', ''].map(h => (
                <span key={h} style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
              ))}
            </div>

            {/* Rows */}
            {lineItems.map(li => (
              <div key={li._key} style={{
                display: 'grid', gridTemplateColumns: '2fr 2fr 80px 110px 24px',
                gap: 8, padding: '8px 20px', borderBottom: '1px solid #f9fafb', alignItems: 'start',
              }}>
                <AutocompleteInput
                  value={li.item_name}
                  onChange={(val, item) => {
                    if (item) selectCatalogItem(li._key, item)
                    else updateLine(li._key, 'item_name', val)
                  }}
                  catalog={catalog}
                  placeholder="Item name"
                />
                <textarea
                  value={li.description}
                  onChange={e => updateLine(li._key, 'description', e.target.value)}
                  onBlur={e => handleDescriptionBlur(li._key, e.target.value)}
                  placeholder="Description"
                  rows={2}
                  style={{ padding: '7px 10px', borderRadius: 7, fontSize: 13, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#0f172a', outline: 'none', width: '100%', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.4 }}
                />
                <input
                  type="number" min="0" step="1"
                  value={li.quantity}
                  onChange={e => updateLine(li._key, 'quantity', e.target.value)}
                  style={{ padding: '7px 8px', borderRadius: 7, fontSize: 13, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#0f172a', outline: 'none', width: '100%', boxSizing: 'border-box', textAlign: 'right', marginTop: 1 }}
                />
                <input
                  type="number" min="0" step="0.01"
                  value={li.unit_price}
                  onChange={e => updateLine(li._key, 'unit_price', e.target.value)}
                  placeholder="0.00"
                  style={{ padding: '7px 8px', borderRadius: 7, fontSize: 13, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#0f172a', outline: 'none', width: '100%', boxSizing: 'border-box', textAlign: 'right', marginTop: 1 }}
                />
                <button
                  onClick={() => removeLine(li._key)}
                  disabled={lineItems.length === 1}
                  style={{ background: 'none', border: 'none', cursor: lineItems.length === 1 ? 'default' : 'pointer', color: '#94a3b8', padding: 0, display: 'flex', alignItems: 'center', marginTop: 6 }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              </div>
            ))}

            <div style={{ padding: '12px 20px', borderTop: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <button
                onClick={addLine}
                style={{ background: 'none', border: 'none', color: '#14b8a6', fontWeight: 600, fontSize: 13, cursor: 'pointer', padding: 0 }}
              >
                + Add Line
              </button>

              {/* Totals */}
              <div style={{ minWidth: 280 }}>
                {form.vat_enabled && (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13, color: '#64748b' }}>
                      <span>Subtotal (ex-VAT)</span>
                      <span>{fmt(subtotal)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: '#64748b', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={form.vat_enabled}
                          onChange={e => setField('vat_enabled', e.target.checked)}
                          style={{ accentColor: '#14b8a6', width: 14, height: 14 }}
                        />
                        VAT (15%)
                      </label>
                      <span style={{ fontSize: 13, color: '#64748b' }}>{fmt(vatAmount)}</span>
                    </div>
                  </>
                )}
                {!form.vat_enabled && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: '#64748b', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={form.vat_enabled}
                        onChange={e => setField('vat_enabled', e.target.checked)}
                        style={{ accentColor: '#14b8a6', width: 14, height: 14 }}
                      />
                      VAT (15%)
                    </label>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: '2px solid #e2e8f0', fontSize: 15, fontWeight: 700, color: '#0f172a' }}>
                  <span>Total</span>
                  <span>{fmt(total)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 24 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Notes</h3>
            <textarea
              value={form.notes}
              onChange={e => setField('notes', e.target.value)}
              placeholder="Any additional notes for the client…"
              rows={4}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 8, fontSize: 14,
                border: '1px solid #e2e8f0', background: '#f8fafc', color: '#0f172a',
                outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit',
              }}
            />
          </div>

        </div>
      </div>

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
            />
          </>
        )
      })()}
    </div>
  )
}

// ─── List View ────────────────────────────────────────────────────────────────

const STATUS_TABS = ['all', 'draft', 'sent', 'approved', 'rejected', 'converted']

function ListView({ estimates, onNew, onSelect, isReadOnly }) {
  const [tab, setTab] = useState('all')

  const filtered = tab === 'all' ? estimates : estimates.filter(e => e.status === tab)

  const tabStyle = (active) => ({
    padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: 'pointer',
    border: 'none', background: active ? '#14b8a6' : 'transparent',
    color: active ? '#fff' : '#64748b',
  })

  return (
    <div style={{ padding: 32, height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexShrink: 0 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>Estimates</h1>
          <p style={{ color: '#64748b', fontSize: 14, margin: 0 }}>Create and send estimates to your clients.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={isReadOnly ? undefined : onNew}
            disabled={isReadOnly}
            title={isReadOnly ? READONLY_MSG : undefined}
            style={{ background: '#14b8a6', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontSize: 14, fontWeight: 600, cursor: isReadOnly ? 'not-allowed' : 'pointer', opacity: isReadOnly ? 0.45 : 1 }}
          >
            + New Estimate
          </button>
          <HelpButton page="estimates" />
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexShrink: 0 }}>
        {STATUS_TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={tabStyle(tab === t)}>
            {t === 'all' ? 'All' : STATUS_META[t]?.label || t}
          </button>
        ))}
      </div>

      {/* Table */}
      <div style={{
        background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)', overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{
          display: 'grid', gridTemplateColumns: '140px 1fr 120px 120px 120px 110px',
          padding: '12px 20px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', flexShrink: 0,
        }}>
          {['Estimate #', 'Client', 'Issue Date', 'Expiry Date', 'Total', 'Status'].map(h => (
            <span key={h} style={{ fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
          ))}
        </div>

        {/* Rows */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filtered.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '56px 0', color: '#94a3b8' }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 12 }}>
                <path d="M9 11l3 3L22 4" />
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
              <p style={{ fontSize: 14, margin: 0 }}>{tab === 'all' ? 'No estimates yet' : `No ${tab} estimates`}</p>
              {tab === 'all' && <p style={{ fontSize: 12, marginTop: 4 }}>Click "New Estimate" to create one.</p>}
            </div>
          ) : (
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
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Estimates() {
  const trialStatus = useTrialStatus()
  const isReadOnly  = trialStatus?.isReadOnly ?? false
  const { user } = useAuth()

  // Shared data from global cache
  const { clients, catalog, profile: settings, refreshClients } = useAppData()

  const [view, setView] = useState('list')
  const [editing, setEditing] = useState(null)
  const [estimates, setEstimates] = useState([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)

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
        ? <ListView estimates={estimates} onNew={openNew} onSelect={openEdit} isReadOnly={isReadOnly} />
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
      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}
    </>
  )
}
