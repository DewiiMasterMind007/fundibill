import jsPDF, { GState } from 'jspdf'
import 'jspdf-autotable'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtMoney = (n) => {
  const num = Number(n) || 0
  return 'R\u00a0' + num.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function hexToRgb(hex = '#14b8a6') {
  const h = (hex || '#14b8a6').replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

// ─── Core builder ─────────────────────────────────────────────────────────────

function buildPdf(data, settings, docType) {
  const doc  = new jsPDF({ unit: 'mm', format: 'a4' })
  const PW   = doc.internal.pageSize.width   // 210 mm
  const PH   = doc.internal.pageSize.height  // 297 mm
  const L    = 15          // left margin
  const R    = PW - 15     // right margin x
  const tw   = R - L       // text width
  const accent = hexToRgb(settings?.accent_color || '#14b8a6')

  const isInvoice = docType === 'INVOICE'
  const isPaid    = data.status === 'paid'

  // ── Header ──────────────────────────────────────────────────────────────────

  let y = 18

  // Business name (left)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.setTextColor(15, 23, 42)
  doc.text(settings?.business_name || 'Your Business', L, y)

  // Doc type label (right), large & coloured
  doc.setFontSize(26)
  doc.setTextColor(...accent)
  doc.text(docType, R, y, { align: 'right' })

  y += 6

  // Business contact lines (left)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(100, 116, 139)

  const bizLines = [
    settings?.business_address,
    settings?.email,
    settings?.phone,
    settings?.vat_number ? `VAT: ${settings.vat_number}` : null,
  ].filter(Boolean)

  let leftY = y
  for (const line of bizLines) {
    doc.text(line, L, leftY)
    leftY += 4.5
  }

  // Invoice/Estimate meta (right)
  const numLabel      = isInvoice ? 'Invoice #' : 'Estimate #'
  const numValue      = isInvoice ? data.invoice_number : data.estimate_number
  const secDateLabel  = isInvoice ? 'Due Date' : 'Expiry Date'
  const secDateValue  = isInvoice ? data.due_date : data.expiry_date

  let rightY = y
  for (const [label, value] of [
    [numLabel, numValue || '—'],
    ['Issue Date', data.issue_date || '—'],
    [secDateLabel, secDateValue || '—'],
  ]) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(100, 116, 139)
    doc.text(`${label}:`, R - 32, rightY, { align: 'right' })
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(15, 23, 42)
    doc.text(value, R, rightY, { align: 'right' })
    rightY += 5
  }

  y = Math.max(leftY, rightY) + 5

  // ── Accent divider ───────────────────────────────────────────────────────────

  doc.setDrawColor(...accent)
  doc.setLineWidth(0.6)
  doc.line(L, y, R, y)
  y += 7

  // ── Bill To ──────────────────────────────────────────────────────────────────

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...accent)
  doc.text('BILL TO', L, y)
  y += 5

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(15, 23, 42)
  doc.text(data.client_name || '—', L, y)
  y += 5

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(71, 85, 105)

  for (const line of [data.client_company, data.client_email, data.client_phone, data.client_address].filter(Boolean)) {
    doc.text(line, L, y)
    y += 4.5
  }

  y += 5

  // ── Line items table ─────────────────────────────────────────────────────────

  const tableRows = (data.items || []).map(item => [
    item.item_name,
    item.description || '',
    String(item.quantity),
    fmtMoney(item.unit_price),
    fmtMoney(item.line_total),
  ])

  // Payment Applied row for paid invoices
  if (isPaid) {
    const amtPaid = Number(data.amount_paid) || Number(data.total) || 0
    tableRows.push([
      'Payment Applied',
      data.paid_date ? `Paid on ${data.paid_date}` : 'Payment received',
      '',
      '',
      `-${fmtMoney(amtPaid)}`,
    ])
  }

  const paymentRowIdx = isPaid ? tableRows.length - 1 : -1

  doc.autoTable({
    startY: y,
    margin: { left: L, right: PW - R },
    head: [['Item', 'Description', 'Qty', 'Unit Price', 'Total']],
    body: tableRows,
    headStyles: {
      fillColor: accent,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9,
    },
    bodyStyles: {
      fontSize: 9,
      textColor: [30, 41, 59],
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 38 },
      2: { halign: 'right', cellWidth: 14 },
      3: { halign: 'right', cellWidth: 28 },
      4: { halign: 'right', cellWidth: 28, fontStyle: 'bold' },
    },
    didParseCell(hook) {
      if (hook.section === 'body' && hook.row.index === paymentRowIdx) {
        hook.cell.styles.textColor  = [220, 38, 38]
        hook.cell.styles.fontStyle  = 'bold'
        hook.cell.styles.fillColor  = [255, 242, 242]
      }
    },
  })

  y = doc.lastAutoTable.finalY + 6

  // ── Totals ────────────────────────────────────────────────────────────────────

  const totR   = R
  const totLab = totR - 36

  const drawTotalRow = (label, value, bold = false, color = [30, 41, 59]) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setFontSize(9)
    doc.setTextColor(100, 116, 139)
    doc.text(label, totLab, y, { align: 'right' })
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setTextColor(...color)
    doc.text(value, totR, y, { align: 'right' })
    y += 5
  }

  if (Number(data.vat_enabled)) {
    drawTotalRow('Subtotal', fmtMoney(data.subtotal))
    drawTotalRow(`VAT (${data.vat_rate || 15}%)`, fmtMoney(data.vat_amount))
    doc.setDrawColor(226, 232, 240)
    doc.setLineWidth(0.3)
    doc.line(totLab - 12, y - 2, totR, y - 2)
  }

  drawTotalRow('Total', fmtMoney(data.total), true)

  if (isPaid) {
    drawTotalRow('Balance Due', fmtMoney(0), true, [22, 163, 74])
  }

  y += 5

  // ── Notes ─────────────────────────────────────────────────────────────────────

  if (data.notes) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...accent)
    doc.text('NOTES', L, y)
    y += 4.5
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(71, 85, 105)
    const lines = doc.splitTextToSize(data.notes, tw)
    doc.text(lines, L, y)
    y += lines.length * 4.5 + 6
  }

  // ── Banking details ───────────────────────────────────────────────────────────

  if (settings?.banking_details) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...accent)
    doc.text('BANKING DETAILS', L, y)
    y += 4.5
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(71, 85, 105)
    const lines = doc.splitTextToSize(settings.banking_details, tw)
    doc.text(lines, L, y)
    y += lines.length * 4.5 + 6
  }

  // ── Terms & Conditions ────────────────────────────────────────────────────────

  if (settings?.terms_conditions) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...accent)
    doc.text('TERMS & CONDITIONS', L, y)
    y += 4.5
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(71, 85, 105)
    const lines = doc.splitTextToSize(settings.terms_conditions, tw)
    doc.text(lines, L, y)
  }

  // ── PAID watermark (drawn last so it appears over content) ────────────────────

  if (isPaid) {
    doc.saveGraphicsState()
    doc.setGState(new GState({ opacity: 0.13 }))
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(100)
    doc.setTextColor(22, 163, 74)
    doc.text('PAID', PW / 2, PH / 2, {
      align:    'center',
      angle:    45,
      baseline: 'middle',
    })
    doc.restoreGraphicsState()
  }

  return doc
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function downloadInvoicePdf(invoice, settings) {
  const doc = buildPdf(invoice, settings, 'INVOICE')
  doc.save(`Invoice-${invoice.invoice_number}.pdf`)
}

export function downloadEstimatePdf(estimate, settings) {
  const doc = buildPdf(estimate, settings, 'ESTIMATE')
  doc.save(`Estimate-${estimate.estimate_number}.pdf`)
}
