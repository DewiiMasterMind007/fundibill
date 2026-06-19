import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useTrialStatus } from '../context/TrialContext'
import useIsMobile from '../hooks/useIsMobile'
import HelpButton from '../components/HelpButton'

const READONLY_MSG = 'Your trial has ended. Upgrade to continue.'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n) => {
  const num = Number(n) || 0
  return 'R ' + num.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const todayStr = () => new Date().toISOString().slice(0, 10)

const DEFAULT_CATEGORIES = [
  'Office Supplies', 'Rent', 'Utilities', 'Software & Subscriptions',
  'Travel', 'Marketing', 'Equipment', 'Professional Services',
  'Meals & Entertainment', 'Other',
]

function parseCategories(raw) {
  if (!raw) return DEFAULT_CATEGORIES
  try { const p = JSON.parse(raw); if (Array.isArray(p) && p.length) return p } catch (_) {}
  return DEFAULT_CATEGORIES
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ message, type = 'success', onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2800)
    return () => clearTimeout(t)
  }, [onDone])
  return (
    <div style={{
      position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
      background: type === 'error' ? '#ef4444' : '#10b981',
      color: '#fff', padding: '11px 22px', borderRadius: 10,
      fontWeight: 600, fontSize: 14, boxShadow: '0 4px 20px rgba(0,0,0,0.18)',
      zIndex: 9999, animation: 'fadeSlideUp 0.25s ease',
    }}>{message}</div>
  )
}

// ─── Expense Form (slide-in panel) ────────────────────────────────────────────

const EMPTY = { date: '', description: '', category: '', amount: '', notes: '' }

const INPUT_S = {
  width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: 14,
  border: '1.5px solid #e2e8f0', background: '#f8fafc', color: '#0f172a',
  outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
  transition: 'border-color 0.15s',
}

function ExpensePanel({ expense, categories, userId, onClose, onSaved, isMobile }) {
  const isNew = !expense
  const [form, setForm] = useState(() => expense
    ? { date: expense.date, description: expense.description, category: expense.category || '', amount: expense.amount, notes: expense.notes || '' }
    : { ...EMPTY, date: todayStr() }
  )
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const firstRef = useRef(null)

  useEffect(() => { setTimeout(() => firstRef.current?.focus(), 60) }, [])

  function setField(k, v) {
    setForm(p => ({ ...p, [k]: v }))
    if (errors[k]) setErrors(p => ({ ...p, [k]: '' }))
  }

  function validate() {
    const e = {}
    if (!form.description.trim()) e.description = 'Description is required.'
    if (!form.date) e.date = 'Date is required.'
    if (!form.amount || isNaN(Number(form.amount)) || Number(form.amount) <= 0) e.amount = 'Enter a valid amount.'
    return e
  }

  async function handleSave() {
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setSaving(true)
    const payload = {
      date: form.date,
      description: form.description.trim(),
      category: form.category.trim() || null,
      amount: Number(form.amount),
      notes: form.notes.trim() || null,
    }
    try {
      let error
      if (isNew) {
        ;({ error } = await supabase.from('expenses').insert({ ...payload, user_id: userId }))
      } else {
        ;({ error } = await supabase.from('expenses').update(payload).eq('id', expense.id))
      }
      setSaving(false)
      if (error) setErrors({ _global: error.message })
      else onSaved()
    } catch (e) {
      setSaving(false)
      setErrors({ _global: e.message })
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(15,23,42,0.3)', backdropFilter: 'blur(2px)' }} />

      {/* Panel */}
      <div style={{ position: 'fixed', top: 0, right: 0, width: isMobile ? '100%' : 440, height: '100%', background: '#fff', boxShadow: '-4px 0 32px rgba(0,0,0,0.1)', zIndex: 50, display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ padding: isMobile ? '16px 20px' : '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: '#0f172a', margin: 0 }}>{isNew ? 'New Expense' : 'Edit Expense'}</h2>
            <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{isNew ? 'Record a new business expense' : 'Update expense details'}</p>
          </div>
          <button onClick={onClose} style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: 18, lineHeight: 1 }}>×</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? 20 : 24 }}>
          {errors._global && (
            <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#dc2626' }}>
              ⚠ {errors._global}
            </div>
          )}

          {/* Date */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 5 }}>Date <span style={{ color: '#ef4444' }}>*</span></label>
            <input ref={firstRef} type="date" value={form.date} onChange={e => setField('date', e.target.value)}
              style={{
                padding: '6px 10px', borderRadius: 7, fontSize: 13,
                border: `1.5px solid ${errors.date ? '#fca5a5' : '#e2e8f0'}`,
                background: '#fff', color: '#0f172a', outline: 'none', cursor: 'pointer',
                minWidth: 0, maxWidth: '100%', boxSizing: 'border-box', width: '100%',
              }}
              onFocus={e => { e.target.style.borderColor = '#14b8a6' }}
              onBlur={e => { e.target.style.borderColor = errors.date ? '#fca5a5' : '#e2e8f0' }} />
            {errors.date && <p style={{ margin: '4px 0 0', fontSize: 12, color: '#ef4444' }}>⚠ {errors.date}</p>}
          </div>

          {/* Description */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 5 }}>Description <span style={{ color: '#ef4444' }}>*</span></label>
            <input value={form.description} onChange={e => setField('description', e.target.value)} placeholder="e.g. Office supplies from Makro"
              style={{ ...INPUT_S, borderColor: errors.description ? '#fca5a5' : '#e2e8f0' }}
              onFocus={e => { e.target.style.borderColor = '#14b8a6' }}
              onBlur={e => { e.target.style.borderColor = errors.description ? '#fca5a5' : '#e2e8f0' }} />
            {errors.description && <p style={{ margin: '4px 0 0', fontSize: 12, color: '#ef4444' }}>⚠ {errors.description}</p>}
          </div>

          {/* Amount */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 5 }}>Amount (R) <span style={{ color: '#ef4444' }}>*</span></label>
            <input type="number" min="0" step="0.01" value={form.amount} onChange={e => setField('amount', e.target.value)} placeholder="0.00"
              style={{ ...INPUT_S, borderColor: errors.amount ? '#fca5a5' : '#e2e8f0' }}
              onFocus={e => { e.target.style.borderColor = '#14b8a6' }}
              onBlur={e => { e.target.style.borderColor = errors.amount ? '#fca5a5' : '#e2e8f0' }} />
            {errors.amount && <p style={{ margin: '4px 0 0', fontSize: 12, color: '#ef4444' }}>⚠ {errors.amount}</p>}
          </div>

          {/* Category */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 5 }}>Category</label>
            <select value={form.category} onChange={e => setField('category', e.target.value)}
              style={{ ...INPUT_S, appearance: 'none', cursor: 'pointer' }}
              onFocus={e => { e.target.style.borderColor = '#14b8a6' }}
              onBlur={e => { e.target.style.borderColor = '#e2e8f0' }}>
              <option value="">— Select category —</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Notes */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 5 }}>Notes</label>
            <textarea value={form.notes} onChange={e => setField('notes', e.target.value)} placeholder="Additional notes (optional)" rows={3}
              style={{ ...INPUT_S, resize: 'vertical', lineHeight: 1.5 }}
              onFocus={e => { e.target.style.borderColor = '#14b8a6' }}
              onBlur={e => { e.target.style.borderColor = '#e2e8f0' }} />
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: isMobile ? '16px 20px calc(16px + 64px)' : '16px 24px',
          borderTop: '1px solid #f1f5f9', display: 'flex', gap: 10, flexShrink: 0,
        }}>
          <button onClick={onClose} style={{ flex: 1, background: '#f8fafc', border: '1.5px solid #e2e8f0', color: '#374151', borderRadius: 8, padding: '10px 0', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{ flex: 2, background: saving ? '#5eead4' : '#14b8a6', border: 'none', color: '#fff', borderRadius: 8, padding: '10px 0', fontSize: 14, fontWeight: 600, cursor: saving ? 'wait' : 'pointer', boxShadow: saving ? 'none' : '0 2px 6px rgba(20,184,166,0.3)' }}>
            {saving ? 'Saving…' : isNew ? 'Add Expense' : 'Save Changes'}
          </button>
        </div>
      </div>
    </>
  )
}

// ─── Delete confirmation ──────────────────────────────────────────────────────

function DeleteModal({ description, onConfirm, onCancel }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 14, padding: '28px 32px', maxWidth: 400, width: '90%', boxShadow: '0 24px 64px rgba(0,0,0,0.2)', border: '1px solid #e2e8f0' }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/></svg>
        </div>
        <h3 style={{ fontSize: 17, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>Delete Expense?</h3>
        <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.65, marginBottom: 24 }}>
          <strong style={{ color: '#374151' }}>{description}</strong> will be permanently deleted.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0', color: '#374151', borderRadius: 8, padding: '9px 18px', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>Cancel</button>
          <button onClick={onConfirm} style={{ background: '#dc2626', border: 'none', color: '#fff', borderRadius: 8, padding: '9px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Delete</button>
        </div>
      </div>
    </div>
  )
}

// ─── Category badge ───────────────────────────────────────────────────────────

function CategoryBadge({ category }) {
  if (!category) return <span style={{ color: '#cbd5e1', fontSize: 12 }}>—</span>
  return (
    <span style={{ background: '#f1f5f9', color: '#475569', fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 999, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
      {category}
    </span>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Expenses() {
  const { user }    = useAuth()
  const trialStatus = useTrialStatus()
  const isReadOnly  = trialStatus?.isReadOnly ?? false
  const isMobile    = useIsMobile()
  const [expenses, setExpenses]         = useState([])
  const [loading, setLoading]           = useState(true)
  const [panelOpen, setPanelOpen]       = useState(false)
  const [editingExpense, setEditing]    = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [toast, setToast]               = useState(null)
  const [search, setSearch]             = useState('')
  const [categories, setCategories]     = useState(DEFAULT_CATEGORIES)
  const [opError, setOpError]           = useState('')

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const [
      { data: expData, error: expErr },
      { data: profRows },
    ] = await Promise.all([
      supabase.from('expenses').select('*').eq('user_id', user.id).order('date', { ascending: false }),
      supabase.from('profiles').select('expense_categories').eq('id', user.id).limit(1),
    ])
    if (expErr) setOpError(expErr.message)
    else setExpenses(expData ?? [])
    setCategories(parseCategories(profRows?.[0]?.expense_categories ?? null))
    setLoading(false)
  }, [user])

  useEffect(() => { load() }, [load])

  function openAdd()           { setEditing(null); setPanelOpen(true) }
  function openEdit(exp)       { setEditing(exp);  setPanelOpen(true) }
  function closePanel()        { setPanelOpen(false); setEditing(null) }

  async function handleSaved() {
    await load()
    setToast({ message: editingExpense ? 'Expense updated.' : 'Expense added.', type: 'success' })
    closePanel()
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return
    const { error } = await supabase.from('expenses').delete().eq('id', deleteTarget.id)
    if (error) { setOpError(error.message); setDeleteTarget(null); return }
    setDeleteTarget(null)
    await load()
    setToast({ message: 'Expense deleted.', type: 'success' })
  }

  const q = search.toLowerCase()
  const visible = q
    ? expenses.filter(e =>
        e.description?.toLowerCase().includes(q) ||
        e.category?.toLowerCase().includes(q)
      )
    : expenses

  const totalVisible = visible.reduce((s, e) => s + (Number(e.amount) || 0), 0)

  return (
    <div style={{ padding: isMobile ? 16 : 32, height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
      <style>{`@keyframes fadeSlideUp { from { opacity: 0; transform: translateX(-50%) translateY(12px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }`}</style>

      {opError && (
        <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <span>⚠ {opError}</span>
          <button onClick={() => setOpError('')} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexShrink: 0 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>Expenses</h1>
          <p style={{ color: '#64748b', fontSize: 14, margin: 0 }}>
            {loading ? 'Loading…' : `${expenses.length} expense${expenses.length !== 1 ? 's' : ''} · Total: ${fmt(expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0))}`}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <HelpButton page="expenses" />
          <button
            onClick={isReadOnly ? undefined : openAdd}
            disabled={isReadOnly}
            title={isReadOnly ? READONLY_MSG : undefined}
            style={{ background: '#14b8a6', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontSize: 14, fontWeight: 600, cursor: isReadOnly ? 'not-allowed' : 'pointer', opacity: isReadOnly ? 0.45 : 1, display: 'flex', alignItems: 'center', gap: 7, boxShadow: isReadOnly ? 'none' : '0 2px 8px rgba(20,184,166,0.3)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New Expense
          </button>
        </div>
      </div>

      {/* Search bar */}
      {expenses.length > 0 && (
        <div style={{ position: 'relative', maxWidth: 380, marginBottom: 16, flexShrink: 0 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by description or category…"
            style={{ width: '100%', background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 8, color: '#0f172a', fontSize: 14, padding: '9px 12px 9px 36px', outline: 'none', boxSizing: 'border-box' }}
            onFocus={e => { e.target.style.borderColor = '#14b8a6' }}
            onBlur={e => { e.target.style.borderColor = '#e2e8f0' }} />
          {search && (
            <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 2 }}>×</button>
          )}
        </div>
      )}

      {/* Expenses list */}
      {isMobile ? (
        /* ── Mobile: card list ── */
        <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 80 }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 0', color: '#94a3b8', fontSize: 14 }}>Loading…</div>
          ) : visible.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 20px', color: '#94a3b8' }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#e2e8f0" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 16 }}>
                <rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>
              </svg>
              <p style={{ fontSize: 15, fontWeight: 700, color: '#64748b', marginBottom: 4 }}>{search ? `No results for "${search}"` : 'No expenses yet'}</p>
              <p style={{ fontSize: 13 }}>{search ? 'Try a different search term.' : 'Tap "New Expense" to add your first expense.'}</p>
            </div>
          ) : (
            <>
              {visible.map(exp => (
                <div key={exp.id}
                  onClick={isReadOnly ? undefined : () => openEdit(exp)}
                  style={{ background: '#fff', borderRadius: 10, border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', padding: '14px 16px', marginBottom: 10, cursor: isReadOnly ? 'default' : 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{exp.description}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 12, color: '#94a3b8' }}>{exp.date}</span>
                        <CategoryBadge category={exp.category} />
                      </div>
                      {exp.notes && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>{exp.notes}</div>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: '#ef4444' }}>{fmt(exp.amount)}</span>
                      {!isReadOnly && (
                        <button
                          onClick={e => { e.stopPropagation(); setDeleteTarget(exp) }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', alignItems: 'center', padding: 4, borderRadius: 6 }}
                          onMouseEnter={e => { e.currentTarget.style.color = '#dc2626' }}
                          onMouseLeave={e => { e.currentTarget.style.color = '#94a3b8' }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              <div style={{ padding: '12px 4px', display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e2e8f0', marginTop: 4 }}>
                <span style={{ fontSize: 13, color: '#64748b' }}>{search ? `${visible.length} of ${expenses.length} expenses` : `${expenses.length} expense${expenses.length !== 1 ? 's' : ''}`}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#ef4444' }}>{fmt(totalVisible)}</span>
              </div>
            </>
          )}
        </div>
      ) : (
        /* ── Desktop: table ── */
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.04)', overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 160px 130px 50px', padding: '12px 20px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', flexShrink: 0 }}>
            {['Date', 'Description', 'Category', 'Amount', ''].map(h => (
              <span key={h} style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
            ))}
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 0', color: '#94a3b8', fontSize: 14 }}>Loading…</div>
            ) : visible.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 20px', color: '#94a3b8' }}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#e2e8f0" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 16 }}>
                  <rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>
                </svg>
                <p style={{ fontSize: 15, fontWeight: 700, color: '#64748b', marginBottom: 4 }}>{search ? `No results for "${search}"` : 'No expenses yet'}</p>
                <p style={{ fontSize: 13 }}>{search ? 'Try a different search term.' : 'Click "New Expense" to add your first expense.'}</p>
              </div>
            ) : (
              <>
                {visible.map(exp => (
                  <div key={exp.id}
                    style={{ display: 'grid', gridTemplateColumns: '120px 1fr 160px 130px 50px', padding: '14px 20px', borderBottom: '1px solid #f9fafb', alignItems: 'center', cursor: isReadOnly ? 'default' : 'pointer' }}
                    onMouseEnter={e => { if (!isReadOnly) e.currentTarget.style.background = '#f8fafc' }}
                    onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                    onClick={isReadOnly ? undefined : () => openEdit(exp)}>
                    <span style={{ fontSize: 13, color: '#64748b' }}>{exp.date}</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{exp.description}</div>
                      {exp.notes && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{exp.notes}</div>}
                    </div>
                    <CategoryBadge category={exp.category} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#ef4444' }}>{fmt(exp.amount)}</span>
                    {!isReadOnly && (
                      <button
                        onClick={e => { e.stopPropagation(); setDeleteTarget(exp) }}
                        title={READONLY_MSG}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 4, borderRadius: 6 }}
                        onMouseEnter={e => { e.currentTarget.style.color = '#dc2626'; e.currentTarget.style.background = '#fee2e2' }}
                        onMouseLeave={e => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.background = 'none' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                      </button>
                    )}
                  </div>
                ))}
                <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 160px 130px 50px', padding: '12px 20px', borderTop: '2px solid #e2e8f0', background: '#f8fafc', flexShrink: 0 }}>
                  <span />
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{search ? `Showing ${visible.length} of ${expenses.length}` : `${expenses.length} expense${expenses.length !== 1 ? 's' : ''}`}</span>
                  <span />
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#ef4444' }}>{fmt(totalVisible)}</span>
                  <span />
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Slide-in panel */}
      {panelOpen && (
        <ExpensePanel
          expense={editingExpense}
          categories={categories}
          userId={user?.id}
          onClose={closePanel}
          onSaved={handleSaved}
          isMobile={isMobile}
        />
      )}

      {/* Delete modal */}
      {deleteTarget && (
        <DeleteModal
          description={deleteTarget.description}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  )
}
