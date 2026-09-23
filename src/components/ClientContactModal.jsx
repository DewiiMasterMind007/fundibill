import { useState, useEffect, useRef } from 'react'
import useIsMobile from '../hooks/useIsMobile'

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
      {error && <p style={{ fontSize: 12, color: '#ef4444', marginTop: 5 }}>{error}</p>}
    </div>
  )
}

function ModalShell({ children, onClose }) {
  const isMobile = useIsMobile()

  function handleBackdrop(e) { if (e.target === e.currentTarget) onClose() }
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div onClick={handleBackdrop} style={{
      position: 'fixed', inset: 0, zIndex: 600,
      background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(3px)',
      display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center',
      padding: isMobile ? 0 : 24,
    }}>
      <div style={{
        background: '#fff', borderRadius: isMobile ? '20px 20px 0 0' : 14,
        width: '100%', maxWidth: isMobile ? 'none' : 440,
        boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
        maxHeight: isMobile ? '90vh' : 'calc(100vh - 48px)',
        overflowY: 'auto',
      }}>
        {isMobile && <div style={{ width: 40, height: 4, background: '#e2e8f0', borderRadius: 2, margin: '12px auto 0' }} />}
        {children}
      </div>
    </div>
  )
}

export default function ClientContactModal({ contact, onSave, onClose }) {
  const isEdit = !!contact

  const [form, setForm] = useState({
    name:  contact?.name  ?? '',
    email: contact?.email ?? '',
    phone: contact?.phone ?? '',
    role:  contact?.role  ?? '',
  })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

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
    if (!form.email.trim()) e.email = 'Email is required.'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) e.email = 'Enter a valid email address.'
    return e
  }

  async function handleSave() {
    const e = validate()
    if (Object.keys(e).length) { setErrors(e); return }
    setSaving(true)
    await onSave({
      name:  form.name.trim()  || null,
      email: form.email.trim(),
      phone: form.phone.trim() || null,
      role:  form.role.trim()  || null,
    })
    setSaving(false)
  }

  return (
    <ModalShell onClose={onClose}>
      <div style={{
        position: 'sticky', top: 0, zIndex: 2, padding: '20px 24px 16px',
        borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', background: '#fff',
      }}>
        <div>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: '#0f172a', margin: 0 }}>
            {isEdit ? 'Edit Contact' : 'Add Contact'}
          </h2>
          <p style={{ fontSize: 13, color: '#94a3b8', margin: '2px 0 0' }}>
            {isEdit ? 'Update this contact.' : 'Additional contacts are automatically CC’d on every invoice and quote sent to this client.'}
          </p>
        </div>
        <button onClick={onClose} style={{
          background: '#f1f5f9', border: 'none', borderRadius: 8,
          width: 32, height: 32, display: 'flex', alignItems: 'center',
          justifyContent: 'center', cursor: 'pointer', color: '#64748b', flexShrink: 0,
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div style={{ padding: '20px 24px' }}>
        <Field label="Name">
          <input
            ref={nameRef}
            value={form.name}
            onChange={setField('name')}
            placeholder="e.g. Jane Smith"
            style={INPUT_BASE}
            onFocus={e => { e.target.style.borderColor = '#14b8a6'; e.target.style.background = '#fff' }}
            onBlur={e  => { e.target.style.borderColor = '#e2e8f0'; e.target.style.background = '#f8fafc' }}
          />
        </Field>

        <Field label="Email" required error={errors.email}>
          <input
            type="email"
            value={form.email}
            onChange={setField('email')}
            placeholder="jane@acme.com"
            style={{ ...INPUT_BASE, borderColor: errors.email ? '#ef4444' : undefined, background: errors.email ? '#fff5f5' : undefined }}
            onFocus={e => { e.target.style.borderColor = '#14b8a6'; e.target.style.background = '#fff' }}
            onBlur={e  => { e.target.style.borderColor = errors.email ? '#ef4444' : '#e2e8f0'; e.target.style.background = errors.email ? '#fff5f5' : '#f8fafc' }}
          />
        </Field>

        <Field label="Phone">
          <input
            value={form.phone}
            onChange={setField('phone')}
            placeholder="+27 21 000 0000  (optional)"
            style={INPUT_BASE}
            onFocus={e => { e.target.style.borderColor = '#14b8a6'; e.target.style.background = '#fff' }}
            onBlur={e  => { e.target.style.borderColor = '#e2e8f0'; e.target.style.background = '#f8fafc' }}
          />
        </Field>

        <Field label="Role">
          <input
            value={form.role}
            onChange={setField('role')}
            placeholder="e.g. Accounts Payable  (optional)"
            style={INPUT_BASE}
            onFocus={e => { e.target.style.borderColor = '#14b8a6'; e.target.style.background = '#fff' }}
            onBlur={e  => { e.target.style.borderColor = '#e2e8f0'; e.target.style.background = '#f8fafc' }}
          />
        </Field>
      </div>

      <div style={{
        position: 'sticky', bottom: 0, zIndex: 1, padding: '12px 24px 20px',
        borderTop: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 10, background: '#fff',
      }}>
        <div style={{ flex: 1 }} />
        <button onClick={onClose} style={{
          padding: '9px 18px', borderRadius: 8, border: '1.5px solid #e2e8f0', background: '#fff',
          fontSize: 14, fontWeight: 600, color: '#64748b', cursor: 'pointer', minHeight: 44,
        }}>
          Cancel
        </button>
        <button onClick={handleSave} disabled={saving} style={{
          padding: '9px 22px', borderRadius: 8, border: 'none',
          background: saving ? '#99f6e4' : '#14b8a6',
          fontSize: 14, fontWeight: 600, color: '#fff',
          cursor: saving ? 'default' : 'pointer', transition: 'background 0.15s',
          minWidth: 110, minHeight: 44,
        }}>
          {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Contact'}
        </button>
      </div>
    </ModalShell>
  )
}
