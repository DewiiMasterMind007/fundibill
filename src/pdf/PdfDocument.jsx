import React from 'react'
import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer'

// Banking details on the PDF come from one of two sources:
// 1. invoice/estimate.banking_details_snapshot (JSONB) -- a plain object,
//    already parsed by supabase-js, saved at the time the document was
//    created/edited (see the multiple-banking-accounts feature).
// 2. Fallback for documents saved before that feature existed (snapshot is
//    NULL): profiles.banking_details, a JSON *string* of
//    { bank_name, account_number, branch_code }. Older accounts may still
//    have a free-text string saved there -- fall back to showing it as-is.
function formatBankingDetails(snapshot, profileBankingRaw, businessName) {
  let parsed = null
  if (snapshot && typeof snapshot === 'object') {
    parsed = snapshot
  } else if (profileBankingRaw) {
    try {
      const p = JSON.parse(profileBankingRaw)
      if (p && typeof p === 'object') parsed = p
    } catch (_) {
      return typeof profileBankingRaw === 'string' ? profileBankingRaw : ''
    }
  }
  if (!parsed) return ''

  const lines = []
  if (parsed.account_name && parsed.account_name !== businessName) lines.push(`Account Name: ${parsed.account_name}`)
  if (parsed.bank_name)      lines.push(`Bank: ${parsed.bank_name}`)
  if (parsed.account_number) lines.push(`Account: ${parsed.account_number}`)
  if (parsed.branch_code)    lines.push(`Branch: ${parsed.branch_code}`)
  if (parsed.account_type)   lines.push(`Type: ${parsed.account_type}`)
  return lines.join('\n')
}

// ── ZAR currency ──────────────────────────────────────────────────────────────
const fmtZAR = (n) => {
  const num = Number(n) || 0
  const [int, dec] = num.toFixed(2).split('.')
  return `R ${int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')},${dec}`
}

// ── Palette ───────────────────────────────────────────────────────────────────
const C = {
  teal:   '#14b8a6',
  dark:   '#0f172a',
  slate:  '#475569',
  muted:  '#64748b',
  light:  '#f8fafc',
  border: '#e2e8f0',
  white:  '#ffffff',
  green:  '#16a34a',
}

// ── Page geometry (pt) ────────────────────────────────────────────────────────
// A4, 34pt margins on the sides and top. The bottom keeps 40pt free for the only
// fixed elements ("Continues on page N" and "Page X of Y"). Everything else is
// laid out in normal flow, so nothing can run underneath anything else.
const MARGIN        = 34
const BOTTOM_RESERVE = 40
const LONG_PAYMENT_LIST = 8   // above this, Payment History flows after the totals block
const LONG_TERMS_LINES  = 30  // above this (estimated 8pt lines), Terms flow across pages instead of staying in the closing block

// ── Styles ────────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
    page: {
    paddingHorizontal: MARGIN,
    paddingTop: MARGIN,
    paddingBottom: BOTTOM_RESERVE,
    backgroundColor: C.white,
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: C.dark,
  },

  // ── Header
  header:      { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  headerLeft:  { flex: 1, maxWidth: 290 },
  logo:        { width: 72, height: 72, objectFit: 'contain', marginBottom: 8 },
  bizName:     { fontSize: 15, fontFamily: 'Helvetica-Bold', color: C.dark, marginBottom: 4 },
  bizDetail:   { fontSize: 9,  color: C.muted, marginBottom: 2 },
  headerRight: { alignItems: 'flex-end', minWidth: 200 },
  docLabel:    { fontSize: 32, fontFamily: 'Helvetica-Bold', color: C.teal, marginBottom: 10 },
  metaRow:     { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 4, alignItems: 'center' },
  metaLabel:   { fontSize: 9,  color: C.muted, textAlign: 'right', marginRight: 8, minWidth: 65 },
  metaVal:     { fontSize: 9,  fontFamily: 'Helvetica-Bold', color: C.dark, textAlign: 'right', minWidth: 95 },

  // ── Divider
  divider:  { borderBottomWidth: 0.75, borderBottomColor: C.teal, marginBottom: 14 },
  thinLine: { borderBottomWidth: 0.5,  borderBottomColor: C.border, marginVertical: 4 },

  // ── Bill To
  billToSection: { marginBottom: 16 },
  sectionLabel:  { fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.teal,
                   textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 6 },
  clientName:    { fontSize: 12, fontFamily: 'Helvetica-Bold', color: C.dark, marginBottom: 3 },
  clientDetail:  { fontSize: 9,  color: C.muted, marginBottom: 2 },

  // ── Line items table
  tableHeader:  { flexDirection: 'row', backgroundColor: C.teal,
                  paddingVertical: 7, paddingHorizontal: 8, borderRadius: 3 },
  thCell:       { color: C.white, fontSize: 9, fontFamily: 'Helvetica-Bold' },
  tableRow:     { flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 8,
                  borderBottomWidth: 0.5, borderBottomColor: C.border },
  tableRowAlt:  { backgroundColor: C.light },
  colDesc:      { flex: 1 },
  colQty:       { width: 36, textAlign: 'right' },
  colRate:      { width: 76, textAlign: 'right' },
  colAmount:    { width: 76, textAlign: 'right' },
  itemName:     { fontSize: 9,  fontFamily: 'Helvetica-Bold', color: C.dark, marginBottom: 2 },
  itemDesc:     { fontSize: 8,  color: C.muted },
  cellNum:      { fontSize: 9,  color: C.dark, textAlign: 'right' },

  // ── Totals
  totalsOuter: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10, marginBottom: 16 },
  totalsBlock: { width: 250 },
  totRow:      { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  totLabel:    { fontSize: 9,  color: C.muted },
  totVal:      { fontSize: 9,  color: C.dark, fontFamily: 'Helvetica-Bold' },
  totDivider:  { borderBottomWidth: 0.75, borderBottomColor: C.border, marginVertical: 5 },
  totalRow:    { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  totalLabel:  { fontSize: 11, fontFamily: 'Helvetica-Bold', color: C.dark },
  totalVal:    { fontSize: 11, fontFamily: 'Helvetica-Bold', color: C.dark },
  balRow:      { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, marginTop: 2 },
  balLabel:    { fontSize: 11, fontFamily: 'Helvetica-Bold', color: C.teal },
  balVal:      { fontSize: 11, fontFamily: 'Helvetica-Bold', color: C.teal },

  // ── Payment History (partial payments) ──
  paymentsSection:     { marginBottom: 16 },
  paymentsHeading:     { fontSize: 11, fontFamily: 'Helvetica-Bold', color: C.dark, marginBottom: 6 },
  paymentsTableHeader: { flexDirection: 'row', backgroundColor: C.light,
                         paddingVertical: 6, paddingHorizontal: 8, borderRadius: 3 },
  paymentsHCell:       { fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.muted,
                         textTransform: 'uppercase', letterSpacing: 0.6 },
  paymentsRow:         { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 8,
                         borderBottomWidth: 0.5, borderBottomColor: C.border },
  paymentsCell:        { fontSize: 9, color: C.slate },
  paymentsCellNum:      { fontSize: 9, color: C.dark, fontFamily: 'Helvetica-Bold', textAlign: 'right' },
  paymentsColDate:     { width: 70 },
  paymentsColMethod:   { width: 90 },
  paymentsColNote:     { flex: 1 },
  paymentsColAmount:   { width: 76, textAlign: 'right' },
  paymentsSummaryRow:  { flexDirection: 'row', justifyContent: 'space-between',
                         paddingVertical: 3, paddingHorizontal: 8, marginTop: 4 },
  paidInFullText:      { fontSize: 12, fontFamily: 'Helvetica-Bold', color: C.green,
                         letterSpacing: 0.5 },

  // ── Compact header (continuation pages)
  compactHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
                   paddingBottom: 6, marginBottom: 8, borderBottomWidth: 0.75, borderBottomColor: C.teal },
  compactBiz:    { fontSize: 11, fontFamily: 'Helvetica-Bold', color: C.dark },
  compactDoc:    { fontSize: 9, color: C.muted },

  // ── Closing block (totals, notes, banking, reference) and terms
  closing:       { flexGrow: 1 },
  closingBottom: { marginTop: 8 },
  bankSection:   { marginTop: 8, paddingTop: 10, borderTopWidth: 0.75, borderTopColor: C.border },
  termsSection:  { marginTop: 8, paddingTop: 10, borderTopWidth: 0.75, borderTopColor: C.border },
  footSecLabel:  { fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.teal,
                   textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
  footText:      { fontSize: 8, color: C.slate, lineHeight: 1.5 },
  refText:       { fontSize: 9, color: C.muted, fontFamily: 'Helvetica-Oblique',
                   marginTop: 10, textAlign: 'center' },
  notesWrap:     { marginTop: 8, alignItems: 'center' },
  notesLabel:    { fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.dark,
                   textAlign: 'center', marginBottom: 2 },
  notesText:     { fontSize: 9, color: C.slate, textAlign: 'center',
                   lineHeight: 1.55, maxWidth: 420 },

  // ── PAID stamp
  paidOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                 alignItems: 'center', justifyContent: 'center', opacity: 0.13 },
  paidStamp:   { transform: 'rotate(-45deg)' },
  paidText:    { fontSize: 130, fontFamily: 'Helvetica-Bold', color: C.green, letterSpacing: 10 },
})

// ── Sub-components ────────────────────────────────────────────────────────────

function MetaRow({ label, value }) {
  return (
    <View style={S.metaRow}>
      <Text style={S.metaLabel}>{label}</Text>
      <Text style={S.metaVal}>{value || '—'}</Text>
    </View>
  )
}

function TotRow({ label, value }) {
  return (
    <View style={S.totRow}>
      <Text style={S.totLabel}>{label}</Text>
      <Text style={S.totVal}>{value}</Text>
    </View>
  )
}

// ── Main document ─────────────────────────────────────────────────────────────

export function PdfDocument({ data, settings, docType }) {
  const isInvoice    = docType === 'INVOICE'
  const isPaid       = data.status === 'paid'
  const docNumber    = isInvoice ? data.invoice_number  : data.estimate_number
  const secDateLabel = 'Due Date'
  const secDate      = isInvoice ? data.due_date        : data.expiry_date
  const amountPaid   = Number(data.amount_paid) || 0
  const total        = Number(data.total)        || 0
  const balanceDue   = Math.max(0, total - amountPaid)
  const grossTotal   = (data.items || []).reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0), 0)
  const discountValue = Number(data.discount_value) || 0
  const discountAmt  = discountValue > 0
    ? (data.discount_type === 'percent' ? grossTotal * (discountValue / 100) : discountValue)
    : 0
  const logoSrc      = settings?._logoSrc || null
  // show_banking_details defaults to true for documents saved before this
  // toggle existed — only an explicit false hides the section. This check
  // happens before the legacy profiles.banking_details fallback so hiding
  // the section can never be defeated by that fallback kicking in.
  const bankingText  = data.show_banking_details === false
    ? ''
    : formatBankingDetails(data.banking_details_snapshot, settings?.banking_details, settings?.business_name)

  // Dynamic colour overrides driven by the user's primary_color setting
  const primary = settings?.primary_color || C.teal
  const D = {
    docLabel:      { color: primary },
    divider:       { borderBottomColor: primary },
    sectionLabel:  { color: primary },
    tableHeader:   { backgroundColor: primary },
    balLabel:      { color: primary },
    balVal:        { color: primary },
    footSecLabel:  { color: primary },
  }

  const showPaymentDate = isInvoice && isPaid && !!data.payment_date
  const docWord = isInvoice ? 'Invoice' : 'Quote'
  const items = data.items || []
  const payments = Array.isArray(data.payments) ? data.payments : []
  const longPayments = payments.length > LONG_PAYMENT_LIST

  const renderRow = (item, i) => (
    <View
      key={item.id || i}
      wrap={false}
      style={[S.tableRow, i % 2 === 1 && S.tableRowAlt]}
    >
      <View style={S.colDesc}>
        <Text style={S.itemName}>{item.item_name}</Text>
        {item.description
          ? item.description.split('\n').map((line, idx) => (
              <Text key={idx} style={S.itemDesc}>{line}</Text>
            ))
          : null}
      </View>
      <Text style={[S.cellNum, S.colQty]}>{item.quantity}</Text>
      <Text style={[S.cellNum, S.colRate]}>{fmtZAR(item.unit_price)}</Text>
      <Text style={[S.cellNum, S.colAmount]}>{fmtZAR(item.line_total || (Number(item.quantity) * Number(item.unit_price)))}</Text>
    </View>
  )

  const columnHeader = (
    <View style={[S.tableHeader, D.tableHeader]}>
      <Text style={[S.thCell, S.colDesc]}>Item Description</Text>
      <Text style={[S.thCell, S.colQty]}>Qty</Text>
      <Text style={[S.thCell, S.colRate]}>Rate</Text>
      <Text style={[S.thCell, S.colAmount]}>Amount</Text>
    </View>
  )

  const paymentHistory = payments.length > 0 && (
    <View style={S.paymentsSection}>
      <Text style={S.paymentsHeading}>Payment History</Text>

      <View style={S.paymentsTableHeader}>
        <Text style={[S.paymentsHCell, S.paymentsColDate]}>Date</Text>
        <Text style={[S.paymentsHCell, S.paymentsColMethod]}>Method</Text>
        <Text style={[S.paymentsHCell, S.paymentsColNote]}>Note</Text>
        <Text style={[S.paymentsHCell, S.paymentsColAmount]}>Amount</Text>
      </View>

      {payments.map((p, idx) => (
        <View key={p.id || idx} wrap={false} style={S.paymentsRow}>
          <Text style={[S.paymentsCell, S.paymentsColDate]}>{p.payment_date || '—'}</Text>
          <Text style={[S.paymentsCell, S.paymentsColMethod]}>{p.payment_method || '—'}</Text>
          <Text style={[S.paymentsCell, S.paymentsColNote]}>{p.note || '—'}</Text>
          <Text style={[S.paymentsCellNum, S.paymentsColAmount]}>{fmtZAR(p.amount)}</Text>
        </View>
      ))}

      <View style={S.paymentsSummaryRow}>
        <Text style={S.totLabel}>Total Paid</Text>
        <Text style={S.totVal}>{fmtZAR(amountPaid)}</Text>
      </View>

      {balanceDue === 0 ? (
        <View style={S.paymentsSummaryRow}>
          <Text style={S.paidInFullText}>PAID IN FULL</Text>
        </View>
      ) : (
        <View style={S.paymentsSummaryRow}>
          <Text style={[S.balLabel, D.balLabel]}>Balance Due</Text>
          <Text style={[S.balVal,   D.balVal]}>{fmtZAR(balanceDue)}</Text>
        </View>
      )}
    </View>
  )

  const totals = (
    <View style={S.totalsOuter}>
      <View style={S.totalsBlock}>
        {discountAmt > 0 && (
          <TotRow
            label={data.discount_type === 'percent' ? `Discount (${discountValue}%)` : 'Discount'}
            value={`-${fmtZAR(discountAmt)}`}
          />
        )}
        {Number(data.vat_enabled) ? (
          <>
            <TotRow label="Subtotal" value={fmtZAR(data.subtotal)} />
            <TotRow label={`VAT (${data.vat_rate || 15}%)`} value={fmtZAR(data.vat_amount)} />
            <View style={S.totDivider} />
          </>
        ) : null}

        <View style={S.totalRow}>
          <Text style={S.totalLabel}>Total</Text>
          <Text style={S.totalVal}>{fmtZAR(total)}</Text>
        </View>

        {amountPaid > 0 && (
          <>
            <TotRow label="Amount Paid" value={`-${fmtZAR(amountPaid)}`} />
            <View style={S.totDivider} />
          </>
        )}

        {(amountPaid > 0 || isInvoice) && (
          <View style={S.balRow}>
            <Text style={[S.balLabel, D.balLabel]}>Balance Due</Text>
            <Text style={[S.balVal,   D.balVal]}>{fmtZAR(balanceDue)}</Text>
          </View>
        )}
      </View>
    </View>
  )

  // Notes, banking and the payment reference form the lower half of the closing
  // block. Any further payment-related line (e.g. a pay-online link) belongs here,
  // directly under the banking details.
  const closingBottom = (
    <View style={S.closingBottom}>
      {data.notes ? (
        <View style={S.notesWrap}>
          <Text style={[S.notesLabel, { color: primary }]}>Notes</Text>
          <Text style={S.notesText}>{data.notes}</Text>
        </View>
      ) : null}

      {!!bankingText && (
        <View style={S.bankSection}>
          <Text style={[S.footSecLabel, D.footSecLabel]}>Banking Details</Text>
          <Text style={S.footText}>{bankingText}</Text>
        </View>
      )}

      <Text style={S.refText}>
        Please use {docNumber} as your payment reference.
      </Text>
    </View>
  )

  // The last line row travels WITH the closing block (one unbreakable group), so the
  // totals and banking can never land alone on a page, and every continuation page
  // always has at least one line item under its column header. flexGrow lets the
  // group fill the remaining page so banking sits at the bottom of a one-page document.
  const termsLineEstimate = (settings?.terms || '').split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / 120)), 0)
  const termsInGroup = termsLineEstimate <= LONG_TERMS_LINES
  const termsBlock = !!settings?.terms && (
    <View style={S.termsSection}>
      <Text style={[S.footSecLabel, D.footSecLabel]}>Terms & Conditions</Text>
      <Text style={S.footText}>{settings.terms}</Text>
    </View>
  )

  const lastItem = items.length > 0 ? items[items.length - 1] : null
  const closingGroup = (
    <View wrap={false} style={S.closing}>
      {lastItem && renderRow(lastItem, items.length - 1)}
      {totals}
      {!longPayments && paymentHistory}
      <View style={{ flexGrow: 1 }} />
      {closingBottom}
      {termsInGroup && termsBlock}
    </View>
  )

  return (
    <Document>
      <Page size="A4" style={S.page}>

        {/* Continuation pages only: compact header + repeated column header. Renders
            nothing on page 1, where the full header below is part of the normal flow. */}
        <View
          fixed
          render={({ pageNumber }) => pageNumber > 1 ? (
            <View>
              <View style={[S.compactHeader, D.divider]}>
                <Text style={S.compactBiz}>{settings?.business_name || 'Your Business'}</Text>
                <Text style={S.compactDoc}>{docWord} {docNumber || ''} · continued</Text>
              </View>
            </View>
          ) : null}
        />

        {/* "Continues on page N" — non-final pages only */}
        <Text
          fixed
          style={{ position: 'absolute', bottom: 16, left: MARGIN, right: MARGIN,
                   fontSize: 8, color: C.muted, fontFamily: 'Helvetica-Oblique', textAlign: 'center' }}
          render={({ pageNumber, totalPages }) =>
            totalPages > 1 && pageNumber < totalPages ? `── Continues on page ${pageNumber + 1} ──` : ''
          }
        />

        {/* Page X of Y — multi-page documents only */}
        <Text
          fixed
          style={{ position: 'absolute', bottom: 16, right: MARGIN, fontSize: 8, color: C.muted }}
          render={({ pageNumber, totalPages }) =>
            totalPages > 1 ? `Page ${pageNumber} of ${totalPages}` : ''
          }
        />

        {/* ── Full header (page 1) ── */}
        <View style={S.header}>
          <View style={S.headerLeft}>
            {!!logoSrc && <Image src={logoSrc} style={S.logo} />}
            <Text style={S.bizName}>{settings?.business_name || 'Your Business'}</Text>
            {!!settings?.business_address && (
              <Text style={S.bizDetail}>{settings.business_address}</Text>
            )}
            {!!settings?.email && (
              <Text style={S.bizDetail}>{settings.email}</Text>
            )}
            {!!settings?.phone && (
              <Text style={S.bizDetail}>{settings.phone}</Text>
            )}
            {!!settings?.vat_number && (
              <Text style={S.bizDetail}>VAT: {settings.vat_number}</Text>
            )}
          </View>

          <View style={S.headerRight}>
            <Text style={[S.docLabel, D.docLabel]}>{isInvoice ? 'INVOICE' : 'QUOTE'}</Text>
            <MetaRow label={isInvoice ? 'Invoice #' : 'Quote #'} value={docNumber} />
            <MetaRow label="Issue Date"    value={data.issue_date} />
            <MetaRow label={secDateLabel}  value={secDate} />
            {showPaymentDate && (
              <View style={S.metaRow}>
                <Text style={S.metaLabel}>Payment Date</Text>
                <Text style={[S.metaVal, { color: C.green }]}>{data.payment_date}</Text>
              </View>
            )}
          </View>
        </View>

        <View style={[S.divider, D.divider]} />

        {/* ── Bill To ── */}
        <View style={S.billToSection}>
          <Text style={[S.sectionLabel, D.sectionLabel]}>Bill To</Text>
          <Text style={S.clientName}>{data.client_company || data.client_name || '—'}</Text>
          {!!data.client_address && <Text style={S.clientDetail}>{data.client_address}</Text>}
          {!!data.client_email   && <Text style={S.clientDetail}>{data.client_email}</Text>}
          {!!data.client_phone   && <Text style={S.clientDetail}>{data.client_phone}</Text>}
        </View>

        {/* ── Line items + closing block. The column header is `fixed` INSIDE this View, so
            it repeats on every page the table spans (and only those). ── */}
        <View style={{ flexGrow: 1 }}>
          <View fixed>{columnHeader}</View>
          {items.slice(0, -1).map((item, i) => renderRow(item, i))}
          {closingGroup}
        </View>

        {longPayments && paymentHistory}

        {/* Very long terms flow across pages after the closing block; never clipped */}
        {!termsInGroup && termsBlock}

        {/* ── PAID watermark (diagonal stamp) ── */}
        {isPaid && (
          <View style={S.paidOverlay}>
            <View style={S.paidStamp}>
              <Text style={S.paidText}>PAID</Text>
            </View>
          </View>
        )}

      </Page>
    </Document>
  )
}
