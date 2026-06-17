import React from 'react'
import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer'

// Banking details: profiles.banking_details stores a JSON object
// { bank_name, account_number, branch_code }. Older accounts may still have
// a free-text string saved -- fall back to showing it as-is in that case.
function formatBankingDetails(raw) {
  if (!raw) return ''
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') {
      const lines = []
      if (parsed.bank_name)      lines.push(`Bank: ${parsed.bank_name}`)
      if (parsed.account_number) lines.push(`Account Number: ${parsed.account_number}`)
      if (parsed.branch_code)    lines.push(`Branch Code: ${parsed.branch_code}`)
      return lines.join('\n')
    }
  } catch (_) {
    // Not JSON -- legacy free-text banking details
  }
  return typeof raw === 'string' ? raw : ''
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

// ── Fixed-element heights (pt) ────────────────────────────────────────────────
// HEADER_H is computed dynamically inside the component from actual content.
// FOOTER_H stays fixed (banking + terms + ref + notes is roughly constant).
const FOOTER_H = 178   // bottom: 52 + footer content ~126 pt

// ── Styles ────────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  // page: paddingTop and paddingBottom are applied dynamically (see render)
  page: {
    paddingHorizontal: 44,
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

  // ── Footer
  footColumns:   { flexDirection: 'row', gap: 24 },
  footColLeft:   { flex: 1 },
  footColRight:  { flex: 1, alignItems: 'flex-end' },
  footSecLabel:  { fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.teal,
                   textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
  footSecLabelR: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.teal,
                   textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4, textAlign: 'right' },
  footText:      { fontSize: 8, color: C.slate, lineHeight: 1.5 },
  footTextRight: { fontSize: 8, color: C.slate, lineHeight: 1.5, textAlign: 'right' },
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
  const logoSrc      = settings?._logoSrc || null
  const bankingText  = formatBankingDetails(settings?.banking_details)

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
    footSecLabelR: { color: primary },
  }

  // ── Compute HEADER_H from real content so paddingTop is as tight as possible ──
  //
  // Left column:  logo (if any) + business name + N detail lines
  // Right column: "INVOICE/ESTIMATE" label (32pt) + 3 meta rows
  // Header height = max(left, right) + header marginBottom + divider + buffer
  //
  const LOGO_H    = 80   // logo image (72pt) + its marginBottom (8pt)
  const BIZ_NAME  = 22   // fontSize:15 ~18pt + marginBottom:4
  const LINE_H    = 13   // each bizDetail line: fontSize:9 ~11pt + marginBottom:2
  const META_ROW  = 15   // each MetaRow: fontSize:9 ~11pt + marginBottom:4
  const showPaymentDate = isInvoice && isPaid && !!data.payment_date
  const RIGHT_COL = 95 + (showPaymentDate ? META_ROW : 0)  // docLabel 48pt + MetaRows ~15pt each

  const addressLineCount = settings?.business_address
    ? settings.business_address.split('\n').filter(l => l.trim()).length
    : 0
  const detailLineCount  = addressLineCount
    + (settings?.email      ? 1 : 0)
    + (settings?.phone      ? 1 : 0)
    + (settings?.vat_number ? 1 : 0)

  const leftColH  = (logoSrc ? LOGO_H : 0) + BIZ_NAME + detailLineCount * LINE_H
  const headerRowH = Math.max(leftColH, RIGHT_COL)

  // 44pt top margin + header row height + 14pt (header marginBottom)
  //   + 1pt (divider border) + 14pt (divider marginBottom)
  // The divider's own marginBottom IS the gap below the green line, so no extra
  // buffer is needed — this makes the space above and below the line identical.
  const HEADER_H  = 44 + headerRowH + 29

  return (
    <Document>
      <Page
        size="A4"
        style={{
          ...S.page,
          paddingTop:    HEADER_H,   // reserves space for the fixed header on every page
          paddingBottom: FOOTER_H,   // reserves space for the fixed footer on every page
        }}
      >

        {/* ═══════════════════════════════════════════════════════════════════
            FIXED HEADER — absolutely positioned; repeats on every page.
            backgroundColor:white covers any flow-content that might bleed
            into the header zone on pages 2+.
        ════════════════════════════════════════════════════════════════════ */}
        <View
          fixed
          style={{
            position:        'absolute',
            top:             44,
            left:            44,
            right:           44,
            backgroundColor: C.white,
          }}
        >
          {/* Business info (left)  |  Doc type + meta (right) */}
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
              <Text style={[S.docLabel, D.docLabel]}>{docType}</Text>
              <MetaRow label={isInvoice ? 'Invoice #' : 'Estimate #'} value={docNumber} />
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

          {/* Coloured divider line */}
          <View style={[S.divider, D.divider]} />
        </View>

        {/* ═══════════════════════════════════════════════════════════════════
            PAGE NUMBER — bottom-right of every page (hidden on single-page docs)
        ════════════════════════════════════════════════════════════════════ */}
        <Text
          fixed
          style={{
            position: 'absolute',
            bottom:   30,
            right:    44,
            fontSize: 8,
            color:    C.muted,
          }}
          render={({ pageNumber, totalPages }) =>
            totalPages > 1 ? `Page ${pageNumber} / ${totalPages}` : ''
          }
        />

        {/* ═══════════════════════════════════════════════════════════════════
            "CONTINUES ON PAGE N" — centred just above the footer on all pages
            except the last.  Shows only when there is more than one page.
        ════════════════════════════════════════════════════════════════════ */}
        <Text
          fixed
          style={{
            position:   'absolute',
            bottom:     FOOTER_H + 10,
            left:       44,
            right:      44,
            fontSize:   8,
            color:      C.muted,
            fontFamily: 'Helvetica-Oblique',
            textAlign:  'center',
          }}
          render={({ pageNumber, totalPages }) =>
            totalPages > 1 && pageNumber < totalPages
              ? `── Continues on page ${pageNumber + 1} ──`
              : ''
          }
        />

        {/* ═══════════════════════════════════════════════════════════════════
            FLOW CONTENT — sits between the fixed header and fixed footer.
            Bill To appears first (only ever on page 1 naturally).
            Each item row is wrap={false} so a row is never split mid-row.
            The totals block is also wrap={false} so it moves as a whole.
        ════════════════════════════════════════════════════════════════════ */}

        {/* ── Bill To ──────────────────────────────────────────────────────── */}
        <View style={S.billToSection}>
          <Text style={[S.sectionLabel, D.sectionLabel]}>Bill To</Text>
          <Text style={S.clientName}>{data.client_company || data.client_name || '—'}</Text>
          {!!data.client_address && <Text style={S.clientDetail}>{data.client_address}</Text>}
          {!!data.client_email   && <Text style={S.clientDetail}>{data.client_email}</Text>}
          {!!data.client_phone   && <Text style={S.clientDetail}>{data.client_phone}</Text>}
        </View>

        {/* ── Line items table ─────────────────────────────────────────────── */}
        <View>
          {/* Column header row */}
          <View style={[S.tableHeader, D.tableHeader]}>
            <Text style={[S.thCell, S.colDesc]}>Item Description</Text>
            <Text style={[S.thCell, S.colQty]}>Qty</Text>
            <Text style={[S.thCell, S.colRate]}>Rate</Text>
            <Text style={[S.thCell, S.colAmount]}>Amount</Text>
          </View>

          {/* Data rows — wrap={false} keeps each row intact */}
          {(data.items || []).map((item, i) => (
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
          ))}
        </View>

        {/* ── Totals — kept together on the same page ──────────────────────── */}
        <View wrap={false} style={S.totalsOuter}>
          <View style={S.totalsBlock}>
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

        {/* ═══════════════════════════════════════════════════════════════════
            FIXED FOOTER — absolutely positioned; repeats on every page.
            backgroundColor:white ensures it covers flow content underneath.
        ════════════════════════════════════════════════════════════════════ */}
        <View
          fixed
          style={{
            position:         'absolute',
            bottom:           52,
            left:             44,
            right:            44,
            backgroundColor:  C.white,
            paddingTop:       12,
            borderTopWidth:   0.75,
            borderTopColor:   C.border,
          }}
        >
          {/* Banking Details (left) | Terms & Conditions (right) */}
          {!!(bankingText || settings?.terms) && (
            <View style={S.footColumns}>
              <View style={S.footColLeft}>
                {!!bankingText && (
                  <>
                    <Text style={[S.footSecLabel, D.footSecLabel]}>Banking Details</Text>
                    <Text style={S.footText}>{bankingText}</Text>
                  </>
                )}
              </View>
              <View style={S.footColRight}>
                {!!settings?.terms && (
                  <>
                    <Text style={[S.footSecLabelR, D.footSecLabelR]}>Terms & Conditions</Text>
                    <Text style={S.footTextRight}>{settings.terms}</Text>
                  </>
                )}
              </View>
            </View>
          )}

          {/* Payment reference — centred */}
          <Text style={S.refText}>
            Please use {docNumber} as your payment reference.
          </Text>

          {/* Notes — only when the user typed something */}
          {data.notes ? (
            <View style={S.notesWrap}>
              <Text style={[S.notesLabel, { color: primary }]}>Notes</Text>
              <Text style={S.notesText}>{data.notes}</Text>
            </View>
          ) : null}
        </View>

        {/* ═══════════════════════════════════════════════════════════════════
            PAID WATERMARK (diagonal stamp, full-page)
        ════════════════════════════════════════════════════════════════════ */}
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
