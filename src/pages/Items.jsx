import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useTrialStatus } from '../context/TrialContext'
import { useAppData } from '../context/AppDataContext'
import HelpButton from '../components/HelpButton'

const READONLY_MSG = 'Your trial has ended. Upgrade to continue.'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatZAR(amount) {
  const n = parseFloat(amount)
  if (isNaN(n)) return 'R\u00a00,00'
  const [int, dec = '00'] = n.toFixed(2).split('.')
  return `R\u00a0${int.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0')},${dec}`
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ search, onAdd }) {
  if (search) {
    return (
      <div style={{ padding: '64px 24px', textAlign: 'center' }}>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1"
          strokeWidth="1.5" strokeLinecap="round" style={{ marginBottom: 12 }}>
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <p style={{ fontSize: 15, fontWeight: 600, color: '#475569', marginBottom: 4 }}>
          No items match "{search}"
        </p>
        <p style={{ fontSize: 13, color: '#94a3b8' }}>Try a different search term.</p>
      </div>
    )
  }
  return (
    <div style={{ padding: '64px 24px', textAlign: 'center' }}>
      <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#e2e8f0"
        strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"
        style={{ marginBottom: 16 }}>
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
        <line x1="6" y1="8" x2="10" y2="8" />
        <line x1="6" y1="11" x2="14" y2="11" />
      </svg>
      <p style={{ fontSize: 15, fontWeight: 600, color: '#475569', marginBottom: 6 }}>
        No items yet
      </p>
      <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 20, lineHeight: 1.6 }}>
        Build your catalog of products and services.<br />
        They'll be available as suggestions when creating invoices.
      </p>
      <button onClick={onAdd} style={{
        background: '#14b8a6', color: '#fff', border: 'none',
        borderRadius: 8, padding: '10px 20px',
        fontSize: 14, fontWeight: 600, cursor: 'pointer',
      }}>
        + Add First Item
      </button>
    </div>
  )
}

// ─── Item modal ───────────────────────────────────────────────────────────────

const INPUT_BASE = {
  width: '100%', boxSizing: 'border-box',
  border: '1.5px solid #e2e8f0', borderRadius: 8,
  padding: '9px 12px', fontSize: 14, color: '#0f172a',
  background: '#f8fafc', outline: 'none', fontFamily: 'inherit',
  transition: 'border-color 0.15s, background 0.15s',
}

function Field({ label, required, error, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
        {label}
        {required && <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span>}
      </label>
      {children}
      {error && (
        <p style={{ fontSize: 12, color: '#ef4444', marginTop: 5 }}>{error}</p>
      )}
    </div>
  )
}

function ItemModal({ item, onSave, onDelete, onClose, isReadOnly }) {
  const isEdit = !!item

  const [form, setForm]     = useState({
    name:        item?.name        ?? '',
    description: item?.description ?? '',
    unit_price:  item?.unit_price  != null ? String(item.unit_price) : '',
  })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const nameRef = useRef(null)
  useEffect(() => { setTimeout(() => nameRef.current?.focus(), 40) }, [])

  function setField(field) {
    return e => {
      setForm(f => ({ ...f, [field]: e.target.value }))
      if (errors[field]) setErrors(er => ({ ...er, [field]: null }))
    }
  }

  function validate() {
    const e = {}
    if (!form.name.trim()) e.name = 'Item name is required.'
    const p = parseFloat(form.unit_price)
    if (form.unit_price === '' || isNaN(p)) e.unit_price = 'Enter a valid price.'
    else if (p < 0) e.unit_price = 'Price cannot be negative.'
    return e
  }

  async function handleSave() {
    const e = validate()
    if (Object.keys(e).length) { setErrors(e); return }
    setSaving(true)
    await onSave({
      name:        form.name.trim(),
      description: form.description.trim() || null,
      unit_price:  parseFloat(parseFloat(form.unit_price).toFixed(2)),
    })
    setSaving(false)
  }

  // ── Delete confirmation inside the modal ──────────────────────────────────
  if (confirmingDelete) {
    return (
      <ModalShell onClose={onClose}>
        <div style={{ padding: '32px 28px', textAlign: 'center' }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%',
            background: '#fef2f2', border: '2px solid #fee2e2',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
              stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
              <path d="M10 11v6M14 11v6M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
            </svg>
          </div>
          <h3 style={{ fontSize: 17, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>
            Delete item?
          </h3>
          <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.6, marginBottom: 24 }}>
            <strong style={{ color: '#0f172a' }}>{item.name}</strong> will be permanently
            removed from your catalog. This cannot be undone.
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setConfirmingDelete(false)} style={{
              flex: 1, padding: '10px 0', borderRadius: 8,
              border: '1.5px solid #e2e8f0', background: '#fff',
              fontSize: 14, fontWeight: 600, color: '#64748b', cursor: 'pointer',
            }}>
              Cancel
            </button>
            <button onClick={onDelete} style={{
              flex: 1, padding: '10px 0', borderRadius: 8,
              border: 'none', background: '#ef4444',
              fontSize: 14, fontWeight: 600, color: '#fff', cursor: 'pointer',
            }}>
              Delete
            </button>
          </div>
        </div>
      </ModalShell>
    )
  }

  // ── Main form ─────────────────────────────────────────────────────────────
  return (
    <ModalShell onClose={onClose}>
      {/* Header */}
      <div style={{
        padding: '20px 24px 16px',
        borderBottom: '1px solid #f1f5f9',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: '#0f172a' }}>
            {isEdit ? 'Edit Item' : 'Add New Item'}
          </h2>
          <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 2 }}>
            {isEdit ? 'Update the item details below.' : 'Add a product or service to your catalog.'}
          </p>
        </div>
        <button onClick={onClose} style={{
          background: '#f1f5f9', border: 'none', borderRadius: 8,
          width: 32, height: 32, display: 'flex', alignItems: 'center',
          justifyContent: 'center', cursor: 'pointer', color: '#64748b', flexShrink: 0,
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Body */}
      <div style={{ padding: '20px 24px' }}>
        <Field label="Item Name" required error={errors.name}>
          <input
            ref={nameRef}
            value={form.name}
            onChange={setField('name')}
            placeholder="e.g. Web Design, Consulting Hour"
            style={{
              ...INPUT_BASE,
              borderColor: errors.name ? '#ef4444' : undefined,
              background: errors.name ? '#fff5f5' : undefined,
            }}
            onFocus={e => { e.target.style.borderColor = '#14b8a6'; e.target.style.background = '#fff' }}
            onBlur={e  => { e.target.style.borderColor = errors.name ? '#ef4444' : '#e2e8f0'; e.target.style.background = errors.name ? '#fff5f5' : '#f8fafc' }}
          />
        </Field>

        <Field label="Description" error={errors.description}>
          <textarea
            value={form.description}
            onChange={setField('description')}
            placeholder="Optional — appears on invoices and estimates."
            rows={3}
            style={{ ...INPUT_BASE, resize: 'vertical', lineHeight: 1.6 }}
            onFocus={e => { e.target.style.borderColor = '#14b8a6'; e.target.style.background = '#fff' }}
            onBlur={e  => { e.target.style.borderColor = '#e2e8f0'; e.target.style.background = '#f8fafc' }}
          />
        </Field>

        <Field label="Unit Price (ZAR)" required error={errors.unit_price}>
          <div style={{ position: 'relative' }}>
            <span style={{
              position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
              fontSize: 14, fontWeight: 500, color: '#94a3b8', pointerEvents: 'none',
            }}>R</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.unit_price}
              onChange={setField('unit_price')}
              placeholder="0.00"
              style={{
                ...INPUT_BASE,
                paddingLeft: 28,
                borderColor: errors.unit_price ? '#ef4444' : undefined,
                background: errors.unit_price ? '#fff5f5' : undefined,
              }}
              onFocus={e => { e.target.style.borderColor = '#14b8a6'; e.target.style.background = '#fff' }}
              onBlur={e  => { e.target.style.borderColor = errors.unit_price ? '#ef4444' : '#e2e8f0'; e.target.style.background = errors.unit_price ? '#fff5f5' : '#f8fafc' }}
            />
          </div>
        </Field>
      </div>

      {/* Footer */}
      <div style={{
        padding: '12px 24px 20px',
        borderTop: '1px solid #f1f5f9',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        {isEdit && !isReadOnly && (
          <button onClick={() => setConfirmingDelete(true)} style={{
            padding: '9px 14px', borderRadius: 8,
            border: '1.5px solid #fca5a5', background: '#fff',
            fontSize: 13, fontWeight: 600, color: '#ef4444', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
              <path d="M10 11v6M14 11v6M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
            </svg>
            Delete
          </button>
        )}
        <div style={{ flex: 1 }} />
        <button onClick={onClose} style={{
          padding: '9px 18px', borderRadius: 8,
          border: '1.5px solid #e2e8f0', background: '#fff',
          fontSize: 14, fontWeight: 600, color: '#64748b', cursor: 'pointer',
        }}>
          {isReadOnly ? 'Close' : 'Cancel'}
        </button>
        {!isReadOnly && (
          <button onClick={handleSave} disabled={saving} style={{
            padding: '9px 22px', borderRadius: 8,
            border: 'none',
            background: saving ? '#99f6e4' : '#14b8a6',
            fontSize: 14, fontWeight: 600, color: '#fff',
            cursor: saving ? 'default' : 'pointer',
            transition: 'background 0.15s',
            minWidth: 110,
          }}>
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Item'}
          </button>
        )}
      </div>
    </ModalShell>
  )
}

function ModalShell({ children, onClose }) {
  // Close on backdrop click
  function handleBackdrop(e) {
    if (e.target === e.currentTarget) onClose()
  }
  // Close on Escape
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      onClick={handleBackdrop}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div style={{
        background: '#fff', borderRadius: 14, width: '100%', maxWidth: 480,
        boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
        maxHeight: 'calc(100vh - 48px)', overflowY: 'auto',
      }}>
        {children}
      </div>
    </div>
  )
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ message }) {
  return (
    <div style={{
      position: 'fixed', bottom: 28, right: 32, zIndex: 200,
      background: '#0f172a', color: '#fff',
      padding: '10px 18px', borderRadius: 8,
      fontSize: 13, fontWeight: 500,
      display: 'flex', alignItems: 'center', gap: 8,
      boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
      animation: 'fadeSlideUp 0.2s ease',
      pointerEvents: 'none',
    }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
        stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
      {message}
      <style>{`@keyframes fadeSlideUp { from { opacity:0; transform:translateY(6px) } to { opacity:1; transform:translateY(0) } }`}</style>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Items() {
  const trialStatus = useTrialStatus()
  const isReadOnly  = trialStatus?.isReadOnly ?? false
  const { user } = useAuth()

  // catalog from global cache; refreshCatalog() re-fetches after writes
  const { catalog: items, loaded: appLoaded, refreshCatalog } = useAppData()

  const [loading,  setLoading]  = useState(!appLoaded)
  const [opError,  setOpError]  = useState('')
  const [search,   setSearch]   = useState('')

  const [modal, setModal]     = useState(null)
  const [toast, setToast]     = useState(null)
  const toastTimer            = useRef(null)

  useEffect(() => { if (appLoaded) setLoading(false) }, [appLoaded])

  // ── Toast ────────────────────────────────────────────────────────────────

  function showToast(msg) {
    clearTimeout(toastTimer.current)
    setToast(msg)
    toastTimer.current = setTimeout(() => setToast(null), 2600)
  }

  // ── Save ─────────────────────────────────────────────────────────────────

  async function handleSave(payload) {
    const isEdit = modal && typeof modal === 'object'
    let error

    if (isEdit) {
      ;({ error } = await supabase
        .from('items')
        .update(payload)
        .eq('id', modal.id)
        .eq('user_id', user.id))
    } else {
      ;({ error } = await supabase
        .from('items')
        .insert({ ...payload, user_id: user.id }))
    }

    if (error) {
      setOpError(error.message)
    } else {
      await refreshCatalog()
      setModal(null)
      showToast(isEdit ? 'Item updated' : 'Item added')
    }
  }

  // ── Delete ───────────────────────────────────────────────────────────────

  async function handleDelete() {
    if (!modal || typeof modal !== 'object') return
    const { error } = await supabase
      .from('items')
      .delete()
      .eq('id', modal.id)
      .eq('user_id', user.id)
    if (error) {
      setOpError(error.message)
    } else {
      await refreshCatalog()
      setModal(null)
      showToast('Item deleted')
    }
  }

  // ── Filter ───────────────────────────────────────────────────────────────

  const q        = search.trim().toLowerCase()
  const filtered = q
    ? items.filter(it =>
        it.name.toLowerCase().includes(q) ||
        (it.description ?? '').toLowerCase().includes(q)
      )
    : items

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: 32, height: '100%', display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        marginBottom: 24, flexShrink: 0,
      }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>Items</h1>
          <p style={{ fontSize: 14, color: '#64748b' }}>
            {loading ? 'Loading…' : `${items.length} item${items.length !== 1 ? 's' : ''} in your catalog`}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={isReadOnly ? undefined : () => setModal(false)}
            disabled={isReadOnly}
            title={isReadOnly ? READONLY_MSG : undefined}
            style={{
              background: '#14b8a6', color: '#fff', border: 'none',
              borderRadius: 8, padding: '10px 18px',
              fontSize: 14, fontWeight: 600, cursor: isReadOnly ? 'not-allowed' : 'pointer',
              opacity: isReadOnly ? 0.45 : 1,
              display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
              boxShadow: isReadOnly ? 'none' : '0 2px 8px rgba(20,184,166,0.3)',
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add New Item
          </button>
          <HelpButton page="items" />
        </div>
      </div>

      {/* Search */}
      {items.length > 0 && (
        <div style={{ position: 'relative', maxWidth: 360, marginBottom: 16, flexShrink: 0 }}>
          <svg style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
            width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search items…"
            style={{
              ...INPUT_BASE,
              paddingLeft: 34, paddingRight: search ? 30 : 12,
              background: '#fff',
            }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{
              position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 2,
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
      )}

      {/* Error banner */}
      {opError && (
        <div style={{
          background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8,
          padding: '10px 14px', marginBottom: 16, flexShrink: 0,
          fontSize: 13, color: '#dc2626',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <span>⚠ {opError}</span>
          <button onClick={() => setOpError('')} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
        </div>
      )}

      {/* Table */}
      <div style={{
        background: '#fff', borderRadius: 12,
        border: '1px solid #e2e8f0',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        overflow: 'hidden', flex: 1,
      }}>
        {/* Column headers */}
        <div style={{
          display: 'grid', gridTemplateColumns: '2fr 3fr 140px',
          padding: '11px 20px',
          background: '#f8fafc',
          borderBottom: '1px solid #f1f5f9',
        }}>
          {['Item Name', 'Description', 'Unit Price'].map(h => (
            <span key={h} style={{
              fontSize: 11, fontWeight: 700, color: '#64748b',
              textTransform: 'uppercase', letterSpacing: '0.06em',
            }}>{h}</span>
          ))}
        </div>

        {/* Rows */}
        {loading ? (
          <div style={{ padding: '56px 0', textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
            Loading…
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState search={search} onAdd={() => setModal(false)} />
        ) : (
          filtered.map((item, idx) => (
            <div
              key={item.id}
              onClick={isReadOnly ? undefined : () => setModal(item)}
              style={{
                display: 'grid', gridTemplateColumns: '2fr 3fr 140px',
                padding: '14px 20px', alignItems: 'center',
                borderBottom: idx < filtered.length - 1 ? '1px solid #f8fafc' : 'none',
                cursor: 'pointer', transition: 'background 0.1s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
              onMouseLeave={e => e.currentTarget.style.background = ''}
            >
              {/* Name */}
              <p style={{
                fontSize: 14, fontWeight: 600, color: '#0f172a',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                paddingRight: 16,
              }}>
                {item.name}
              </p>

              {/* Description */}
              <p style={{
                fontSize: 13, color: '#64748b',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                paddingRight: 16,
              }}>
                {item.description || <span style={{ color: '#cbd5e1', fontStyle: 'italic' }}>No description</span>}
              </p>

              {/* Price */}
              <p style={{
                fontSize: 14, fontWeight: 600, color: '#0f172a',
                fontVariantNumeric: 'tabular-nums',
              }}>
                {formatZAR(item.unit_price)}
              </p>
            </div>
          ))
        )}
      </div>

      {/* Modal */}
      {modal !== null && (
        <ItemModal
          item={modal || null}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => setModal(null)}
          isReadOnly={isReadOnly}
        />
      )}

      {/* Toast */}
      {toast && <Toast message={toast} />}
    </div>
  )
}
