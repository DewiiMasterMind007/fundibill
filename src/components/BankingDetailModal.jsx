import { useState, useEffect, useRef } from 'react'
import useIsMobile from '../hooks/useIsMobile'

const ACCOUNT_TYPES = ['Cheque', 'Savings', 'Transmission', 'Credit']

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
      position: 'fixed', inset: 0, zIndex: 500,
      background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(3px)',
      display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center',
      padding: isMobile ? 0 : 24,
    }}>
      <div style={{
        background: '#fff', borderRadius: isMobile ? '20px 20px 0 0' : 14,
        width: '100%', maxWidth: isMobile ? 'none' : 480,
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

export default function BankingDetailModal({ bankingDetail, onSave, onClose }) {
  const isEdit = !!bankingDetail

  const [form, setForm] = useState({
    account_name:   bankingDetail?.account_name   ?? '',
    bank_name:      bankingDetail?.bank_name      ?? '',
    account_number: bankingDetail?.account_number ?? '',
    branch_code:    bankingDetail?.branch_code    ?? '',
    account_type:   bankingDetail?.account_type   || 'Cheque',
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
    if (!form.account_name.trim())   e.account_name   = 'Account name is required.'
    if (!form.bank_name.trim())      e.bank_name      = 'Bank name is required.'
    if (!form.account_number.trim()) e.account_number = 'Account number is required.'
    return e
  }

  async function handleSave() {
    const e = validate()
    if (Object.keys(e).length) { setErrors(e); return }
    setSaving(true)
    await onSave({
      account_name:   form.account_name.trim(),
      bank_name:      form.bank_name.trim(),
      account_number: form.account_number.trim(),
      branch_code:    form.branch_code.trim() || null,
      account_type:   form.account_type || null,
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
            {isEdit ? 'Edit Banking Account' : 'Add Banking Account'}
          </h2>
          <p style={{ fontSize: 13, color: '#94a3b8', margin: '2px 0 0' }}>
            {isEdit ? 'Update this banking account.' : 'Save a banking account to use on invoices and quotes.'}
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
        <Field label="Account Name" required error={errors.account_name}>
          <input
            ref={nameRef}
            value={form.account_name}
            onChange={setField('account_name')}
            placeholder="e.g. FNB Business Account"
            style={{ ...INPUT_BASE, borderColor: errors.account_name ? '#ef4444' : undefined, background: errors.account_name ? '#fff5f5' : undefined }}
            onFocus={e => { e.target.style.borderColor = '#14b8a6'; e.target.style.background = '#fff' }}
            onBlur={e  => { e.target.style.borderColor = errors.account_name ? '#ef4444' : '#e2e8f0'; e.target.style.background = errors.account_name ? '#fff5f5' : '#f8fafc' }}
          />
        </Field>

        <Field label="Bank Name" required error={errors.bank_name}>
          <input
            value={form.bank_name}
            onChange={setField('bank_name')}
            placeholder="e.g. First National Bank"
            style={{ ...INPUT_BASE, borderColor: errors.bank_name ? '#ef4444' : undefined, background: errors.bank_name ? '#fff5f5' : undefined }}
            onFocus={e => { e.target.style.borderColor = '#14b8a6'; e.target.style.background = '#fff' }}
            onBlur={e  => { e.target.style.borderColor = errors.bank_name ? '#ef4444' : '#e2e8f0'; e.target.style.background = errors.bank_name ? '#fff5f5' : '#f8fafc' }}
          />
        </Field>

        <Field label="Account Number" required error={errors.account_number}>
          <input
            value={form.account_number}
            onChange={setField('account_number')}
            placeholder="e.g. 62012345678"
            style={{ ...INPUT_BASE, borderColor: errors.account_number ? '#ef4444' : undefined, background: errors.account_number ? '#fff5f5' : undefined }}
            onFocus={e => { e.target.style.borderColor = '#14b8a6'; e.target.style.background = '#fff' }}
            onBlur={e  => { e.target.style.borderColor = errors.account_number ? '#ef4444' : '#e2e8f0'; e.target.style.background = errors.account_number ? '#fff5f5' : '#f8fafc' }}
          />
        </Field>

        <Field label="Branch Code">
          <input
            value={form.branch_code}
            onChange={setField('branch_code')}
            placeholder="e.g. 250655"
            style={INPUT_BASE}
            onFocus={e => { e.target.style.borderColor = '#14b8a6'; e.target.style.background = '#fff' }}
            onBlur={e  => { e.target.style.borderColor = '#e2e8f0'; e.target.style.background = '#f8fafc' }}
          />
        </Field>

        <Field label="Account Type">
          <select
            value={form.account_type}
            onChange={setField('account_type')}
            style={{ ...INPUT_BASE, cursor: 'pointer' }}
            onFocus={e => { e.target.style.borderColor = '#14b8a6'; e.target.style.background = '#fff' }}
            onBlur={e  => { e.target.style.borderColor = '#e2e8f0'; e.target.style.background = '#f8fafc' }}
          >
            {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
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
          {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Account'}
        </button>
      </div>
    </ModalShell>
  )
}
