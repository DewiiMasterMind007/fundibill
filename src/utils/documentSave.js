const KINDS = {
  estimate: {
    table: 'estimates', itemsTable: 'estimate_items', fk: 'estimate_id',
    rpc: 'save_estimate_with_items', idArg: 'p_estimate_id', noun: 'quote',
  },
  invoice: {
    table: 'invoices', itemsTable: 'invoice_items', fk: 'invoice_id',
    rpc: 'save_invoice_with_items', idArg: 'p_invoice_id', noun: 'invoice',
  },
}

const TOLERANCE = 0.01

export const INTEGRITY_MESSAGE =
  "This document's line items don't match its total — some lines may be missing. Check it before sending."

export function normalizeItems(lineItems) {
  return (lineItems || [])
    .filter(li => (li.item_name || '').trim())
    .map(li => {
      const quantity = Number(li.quantity) || 1
      const unit_price = Number(li.unit_price) || 0
      return {
        item_name: li.item_name,
        description: li.description || null,
        quantity,
        unit_price,
        line_total: quantity * unit_price,
      }
    })
}

export function findUnnamedPricedLines(lineItems) {
  return (lineItems || []).filter(li =>
    !(li.item_name || '').trim() &&
    ((Number(li.unit_price) || 0) > 0 || (li.description || '').trim())
  )
}

export function computeTotals(items, { vatEnabled, discountsOn, discountType, discountValue }) {
  const gross = items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0), 0)
  const dv = discountsOn ? (Number(discountValue) || 0) : 0
  const discountAmt = discountsOn ? (discountType === 'percent' ? gross * (dv / 100) : dv) : 0
  const total = Math.max(0, gross - discountAmt)
  const subtotal = vatEnabled ? total / 1.15 : total
  return { gross, total, subtotal, vatAmount: vatEnabled ? total - subtotal : 0 }
}

// Compares a stored header against its stored lines. Same formula the database
// functions use to verify a save (see add_atomic_document_save.sql).
export function checkIntegrity(header, items) {
  if (!header) return { ok: true }
  const list = items || []
  const storedTotal = Number(header.total) || 0
  const storedSubtotal = Number(header.subtotal) || 0
  if (list.length === 0) {
    return storedTotal > TOLERANCE
      ? { ok: false, reason: 'no-items', message: INTEGRITY_MESSAGE, storedTotal, itemsTotal: 0, itemCount: 0 }
      : { ok: true }
  }
  const gross = list.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0), 0)
  const dv = Number(header.discount_value) || 0
  const disc = dv > 0 ? (header.discount_type === 'percent' ? gross * dv / 100 : dv) : 0
  const expTotal = Math.max(0, gross - disc)
  const expSubtotal = header.vat_enabled ? expTotal / 1.15 : expTotal
  if (Math.abs(storedTotal - expTotal) > TOLERANCE || Math.abs(storedSubtotal - expSubtotal) > TOLERANCE) {
    return { ok: false, reason: 'mismatch', message: INTEGRITY_MESSAGE, storedTotal, itemsTotal: expTotal, itemCount: list.length }
  }
  return { ok: true }
}

export async function loadDocument(supabase, kind, id) {
  const k = KINDS[kind]
  const { data: header, error: hErr } = await supabase.from(k.table).select('*').eq('id', id).single()
  if (hErr) throw new Error(`Could not load the ${k.noun}: ${hErr.message}`)

  let res = await supabase.from(k.itemsTable).select('*').eq(k.fk, id)
    .order('sort_order', { ascending: true, nullsFirst: false })
  if (res.error && /sort_order/i.test(res.error.message || '')) {
    res = await supabase.from(k.itemsTable).select('*').eq(k.fk, id)
  }
  if (res.error) throw new Error(`Could not load the ${k.noun} line items: ${res.error.message}`)
  return { header, items: res.data ?? [] }
}

function friendlyRpcError(kind, error) {
  const noun = KINDS[kind].noun
  const msg = error?.message || 'Unknown error'
  if (/Could not find the function|schema cache|does not exist/i.test(msg) && /save_(estimate|invoice)_with_items/.test(msg)) {
    return `Your ${noun} could not be saved: the database update for safe saving has not been applied yet. Contact support.`
  }
  const code = (msg.match(/^(\w+_\w+):/) || [])[1]
  if (code === 'ITEM_COUNT_MISMATCH' || code === 'TOTAL_MISMATCH') {
    return `Your ${noun} could not be fully saved and nothing has been changed. ${msg.replace(/^\w+:\s*/, '')}`
  }
  return `Your ${noun} could not be saved: ${msg.replace(/^\w+_\w+:\s*/, '')}`
}

// Saves header + all lines in ONE database transaction, then re-reads what was
// stored and verifies it. Throws on any failure; never returns a half-saved result.
export async function saveDocument(supabase, kind, { id, userId, header, items }) {
  const k = KINDS[kind]
  if (!items || items.length === 0) throw new Error(`Add at least one line item before saving the ${k.noun}.`)

  const { data: savedId, error } = await supabase.rpc(k.rpc, {
    [k.idArg]: id || null,
    p_header: header,
    p_items: items,
    p_user_id: userId || null,
  })
  if (error) throw new Error(friendlyRpcError(kind, error))
  if (!savedId) throw new Error(`Your ${k.noun} could not be saved: no id was returned.`)

  const stored = await loadDocument(supabase, kind, savedId)
  if (stored.items.length !== items.length || !checkIntegrity(stored.header, stored.items).ok) {
    throw new Error(`Your ${k.noun} could not be fully saved (${stored.items.length} of ${items.length} lines were stored). Nothing has been sent.`)
  }
  return { id: savedId, ...stored }
}
