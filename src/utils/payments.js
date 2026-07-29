/**
 * src/utils/payments.js
 *
 * Partial-payments feature — recording, deleting, and reading payments
 * against an invoice, plus keeping invoices.amount_paid/status in sync.
 *
 * The `payments` table only tracks payments recorded within FundiBill going
 * forward. Existing amount_paid values on older invoices (migrated from
 * Zoho) have no corresponding payments rows — see CLAUDE.md.
 */

// Recompute amount_paid from the payments table and update the invoice's
// amount_paid/status (and payment_date, once fully paid) to match. Shared by
// recordPayment() and deletePayment() since both need identical recalculation.
async function recalculateInvoiceFromPayments(supabase, invoiceId) {
  const { data: paymentsData, error: paymentsError } = await supabase
    .from('payments')
    .select('amount, payment_date')
    .eq('invoice_id', invoiceId)
  if (paymentsError) throw paymentsError

  const amountPaid = (paymentsData ?? []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0)

  const { data: invoiceRow, error: invoiceError } = await supabase
    .from('invoices')
    .select('total, payment_date')
    .eq('id', invoiceId)
    .single()
  if (invoiceError) throw invoiceError

  const total = Number(invoiceRow?.total) || 0

  let status
  const updatePayload = { amount_paid: amountPaid }

  if (total > 0 && amountPaid >= total) {
    status = 'paid'
    // Use the most recent payment's date as the paid-on date.
    const dates = (paymentsData ?? []).map(p => p.payment_date).filter(Boolean).sort()
    updatePayload.payment_date = dates.length ? dates[dates.length - 1] : invoiceRow?.payment_date
  } else if (amountPaid > 0) {
    status = 'partial'
  } else {
    status = 'sent'
  }
  updatePayload.status = status

  const { data: updatedInvoice, error: updateError } = await supabase
    .from('invoices')
    .update(updatePayload)
    .eq('id', invoiceId)
    .select('*')
    .single()
  if (updateError) throw updateError

  return updatedInvoice
}

/**
 * Record a new payment against an invoice, then recalculate and return the
 * updated invoice row (amount_paid + status kept in sync).
 *
 * @param {object} supabase  Supabase client instance
 * @param {object} opts
 *   invoiceId      string
 *   userId         string
 *   amount         number
 *   paymentDate    string  ISO date, e.g. "2026-07-29"
 *   paymentMethod  string|null
 *   note           string|null
 * @returns {Promise<object>}  The updated invoice row
 */
export async function recordPayment(supabase, { invoiceId, userId, amount, paymentDate, paymentMethod, note }) {
  const { error: insertError } = await supabase
    .from('payments')
    .insert({
      invoice_id:     invoiceId,
      user_id:        userId,
      amount,
      payment_date:   paymentDate,
      payment_method: paymentMethod || null,
      note:           note || null,
    })
  if (insertError) throw insertError

  return recalculateInvoiceFromPayments(supabase, invoiceId)
}

/**
 * Delete a payment, then recalculate and return the updated invoice row.
 *
 * @param {object} supabase  Supabase client instance
 * @param {object} opts
 *   paymentId  string
 *   invoiceId  string
 *   userId     string
 * @returns {Promise<object>}  The updated invoice row
 */
export async function deletePayment(supabase, { paymentId, invoiceId, userId }) {
  const { error: deleteError } = await supabase
    .from('payments')
    .delete()
    .eq('id', paymentId)
    .eq('user_id', userId)
  if (deleteError) throw deleteError

  return recalculateInvoiceFromPayments(supabase, invoiceId)
}

/**
 * Fetch all payments for an invoice, oldest first.
 *
 * @param {object} supabase   Supabase client instance
 * @param {string} invoiceId
 * @returns {Promise<Array>}
 */
export async function getPayments(supabase, invoiceId) {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('invoice_id', invoiceId)
    .order('payment_date', { ascending: true })
  if (error) throw error
  return data ?? []
}

/**
 * Outstanding balance for an invoice — never negative.
 *
 * @param {object} invoice  Needs .total and .amount_paid
 * @returns {number}
 */
export function getBalanceDue(invoice) {
  const balance = (Number(invoice?.total) || 0) - (Number(invoice?.amount_paid) || 0)
  return balance > 0 ? balance : 0
}
