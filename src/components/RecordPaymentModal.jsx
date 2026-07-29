import { useState, useEffect } from 'react'
import { recordPayment, deletePayment, getPayments, getBalanceDue } from '../utils/payments'

const PAYMENT_METHODS = ['Cash', 'EFT', 'Credit Card', 'Debit Card', 'Cheque', 'Other']

const fmt = (n) => {
  const num = Number(n) || 0
  return 'R ' + num.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const todayStr = () => new Date().toISOString().slice(0, 10)

/**
 * RecordPaymentModal — record a partial or full payment against an invoice.
 * Shows live payment history for the invoice and lets the user delete a
 * previously recorded payment (recalculating the invoice balance).
 *
 * Props:
 *   invoice            Full invoice object (needs id, user_id, invoice_number, total, amount_paid)
 *   onClose            () => void
 *   onPaymentRecorded  (updatedInvoice) => void — called after any record/delete
 *   supabase           Supabase client instance
 */
export default function RecordPaymentModal({ invoice, onClose, onPaymentRecorded, supabase }) {
  const [currentInvoice, setCurrentInvoice] = useState(invoice)
  const [payments, setPayments] = useState([])
  const [loadingPayments, setLoadingPayments] = useState(true)

  const balanceDue = getBalanceDue(currentInvoice)

  const [amount, setAmount] = useState(() => (balanceDue > 0 ? balanceDue.toFixed(2) : ''))
  const [paymentDate, setPaymentDate] = useState(todayStr())
  const [paymentMethod, setPaymentMethod] = useState('EFT')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)

  // Load payment history on mount
  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoadingPayments(true)
      try {
        const data = await getPayments(supabase, invoice.id)
        if (!cancelled) setPayments(data)
      } catch (e) {
        if (!cancelled) setError(e.message || 'Failed to load payment history.')
      }
      if (!cancelled) setLoadingPayments(false)
    }
    load()
    return () => { cancelled = true }
  }, [invoice.id, supabase])

  // Escape key closes modal
  useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape' && !saving) onClose() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [saving, onClose])

  async function handleRecordPayment() {
    setError('')
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) {
      setError('Enter an amount greater than 0.')
      return
    }
    if (amt > balanceDue + 0.001) {
      setError(`Amount cannot exceed the outstanding balance of ${fmt(balanceDue)}`)
      return
    }

    setSaving(true)
    try {
      const updatedInvoice = await recordPayment(supabase, {
        invoiceId:     currentInvoice.id,
        userId:        currentInvoice.user_id,
        amount:        amt,
        paymentDate,
        paymentMethod,
        note:          note.trim() || null,
      })
      setCurrentInvoice(updatedInvoice)
      onPaymentRecorded(updatedInvoice)

      if (updatedInvoice.status === 'paid') {
        // Nothing left to pay — close and let the parent handle the
        // fully-paid follow-up (e.g. the payment-confirmation email modal).
        onClose()
        return
      }

      const freshPayments = await getPayments(supabase, currentInvoice.id)
      setPayments(freshPayments)
      const newBalance = getBalanceDue(updatedInvoice)
      setAmount(newBalance > 0 ? newBalance.toFixed(2) : '')
      setNote('')
    } catch (e) {
      setError(e.message || 'Failed to record payment.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeletePayment(payment) {
    setError('')
    setDeletingId(payment.id)
    try {
      const updatedInvoice = await deletePayment(supabase, {
        paymentId: payment.id,
        invoiceId: currentInvoice.id,
        userId:    currentInvoice.user_id,
      })
      setCurrentInvoice(updatedInvoice)
      setPayments(prev => prev.filter(p => p.id !== payment.id))
      onPaymentRecorded(updatedInvoice)
      const newBalance = getBalanceDue(updatedInvoice)
      setAmount(newBalance > 0 ? newBalance.toFixed(2) : '')
    } catch (e) {
      setError(e.message || 'Failed to delete payment.')
    } finally {
      setDeletingId(null)
      setConfirmDeleteId(null)
    }
  }

  const confirmDeletePayment = payments.find(p => p.id === confirmDeleteId) || null

  // ── Styles ──────────────────────────────────────────────────────────────────
  const INPUT = {
    width:        '100%',
    padding:      '9px 12px',
    borderRadius: 8,
    border:       '1.5px solid #e2e8f0',
    background:   '#f8fafc',
    color:        '#0f172a',
    fontSize:     14,
    outline:      'none',
    boxSizing:    'border-box',
    fontFamily:   'inherit',
  }

  return (
    <div
      style={{
        position:   'fixed', inset: 0, zIndex: 8000,
        background: 'rgba(15,23,42,0.55)',
        display:    'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onMouseDown={e => { if (e.target === e.currentTarget && !saving) onClose() }}
    >
      <div style={{
        background:   '#fff',
        borderRadius: 16,
        width:        560,
        maxWidth:     '95vw',
        maxHeight:    '90vh',
        overflowY:    'auto',
        boxShadow:    '0 24px 64px rgba(0,0,0,0.22)',
      }}>
        {/* Header */}
        <div style={{
          padding:      '18px 24px',
          borderBottom: '1px solid #f1f5f9',
          display:      'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          position:     'sticky', top: 0, background: '#fff', zIndex: 2,
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#14b8a6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="1" x2="12" y2="23"/>
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
              </svg>
              <span style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>Record Payment</span>
            </div>
            <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>
              Invoice {currentInvoice.invoice_number} — Balance due: <strong style={{ color: balanceDue > 0 ? '#b45309' : '#15803d' }}>{fmt(balanceDue)}</strong>
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            style={{ background: 'none', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', color: '#94a3b8', fontSize: 20, lineHeight: 1, padding: '0 2px' }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '24px 24px 20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Amount</label>
              <input
                type="number" min="0" step="0.01"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                style={INPUT}
                disabled={saving || balanceDue <= 0}
              />
              <p style={{ fontSize: 12, color: '#94a3b8', margin: '5px 0 0' }}>
                Invoice total: {fmt(currentInvoice.total)} | Already paid: {fmt(currentInvoice.amount_paid || 0)} | Balance: {fmt(balanceDue)}
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Payment Date</label>
                <input
                  type="date"
                  value={paymentDate}
                  onChange={e => setPaymentDate(e.target.value)}
                  style={INPUT}
                  disabled={saving}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Payment Method</label>
                <select
                  value={paymentMethod}
                  onChange={e => setPaymentMethod(e.target.value)}
                  style={{ ...INPUT, cursor: 'pointer' }}
                  disabled={saving}
                >
                  {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Note (optional)</label>
              <input
                type="text"
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="e.g. Deposit payment"
                style={INPUT}
                disabled={saving}
              />
            </div>

            {error && (
              <div style={{ fontSize: 13, color: '#dc2626', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 7, padding: '8px 12px' }}>
                {error}
              </div>
            )}
          </div>

          {/* Payment history */}
          {(loadingPayments || payments.length > 0) && (
            <div style={{ marginTop: 28 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', margin: '0 0 10px' }}>Payment History</h3>

              {confirmDeletePayment && (
                <div style={{
                  background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8,
                  padding: '10px 14px', marginBottom: 10, fontSize: 13, color: '#7f1d1d',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap',
                }}>
                  <span>Delete this payment of {fmt(confirmDeletePayment.amount)}? The invoice balance will be updated.</span>
                  <span style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <button
                      onClick={() => setConfirmDeleteId(null)}
                      style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleDeletePayment(confirmDeletePayment)}
                      disabled={deletingId === confirmDeletePayment.id}
                      style={{ padding: '5px 12px', borderRadius: 6, border: 'none', background: '#dc2626', color: '#fff', fontWeight: 600, fontSize: 12, cursor: deletingId === confirmDeletePayment.id ? 'wait' : 'pointer' }}
                    >
                      {deletingId === confirmDeletePayment.id ? 'Deleting…' : 'Delete'}
                    </button>
                  </span>
                </div>
              )}

              {loadingPayments ? (
                <p style={{ fontSize: 13, color: '#94a3b8' }}>Loading…</p>
              ) : (
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '100px 90px 1fr 90px 32px', padding: '8px 12px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                    {['Date', 'Method', 'Note', 'Amount', ''].map(h => (
                      <span key={h} style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
                    ))}
                  </div>
                  {payments.map(p => (
                    <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '100px 90px 1fr 90px 32px', padding: '9px 12px', alignItems: 'center', borderBottom: '1px solid #f8fafc', fontSize: 13 }}>
                      <span style={{ color: '#475569' }}>{p.payment_date}</span>
                      <span style={{ color: '#475569' }}>{p.payment_method || '—'}</span>
                      <span style={{ color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8 }}>{p.note || '—'}</span>
                      <span style={{ fontWeight: 600, color: '#0f172a' }}>{fmt(p.amount)}</span>
                      <button
                        onClick={() => setConfirmDeleteId(p.id)}
                        disabled={deletingId === p.id}
                        title="Delete payment"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', padding: 4, display: 'flex' }}
                        onMouseEnter={e => { e.currentTarget.style.color = '#dc2626' }}
                        onMouseLeave={e => { e.currentTarget.style.color = '#cbd5e1' }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding:      '14px 24px 20px',
          borderTop:    '1px solid #f1f5f9',
          display:      'flex', justifyContent: 'flex-end', gap: 10,
        }}>
          <button
            onClick={onClose}
            disabled={saving}
            style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 600, fontSize: 14, cursor: saving ? 'not-allowed' : 'pointer' }}
          >
            Cancel
          </button>
          <button
            onClick={handleRecordPayment}
            disabled={saving || balanceDue <= 0}
            style={{
              padding: '9px 22px', borderRadius: 8, border: 'none',
              background: (saving || balanceDue <= 0) ? '#94a3b8' : '#14b8a6',
              color: '#fff', fontWeight: 600, fontSize: 14,
              cursor: (saving || balanceDue <= 0) ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 7,
            }}
          >
            {saving && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: 'paymentSpin 0.8s linear infinite' }}>
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
              </svg>
            )}
            {saving ? 'Recording…' : 'Record Payment'}
          </button>
        </div>
      </div>

      <style>{`@keyframes paymentSpin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
