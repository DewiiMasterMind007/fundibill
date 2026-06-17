/**
 * src/lib/whatsapp.js
 *
 * Shared helpers for the "Send via WhatsApp" button on invoices and estimates.
 * Reuses the same PDF blob already generated for email sending — no new PDF
 * logic is introduced here.
 */

/**
 * Strip spaces, dashes and brackets from a South African phone number and
 * normalise a leading "0" to the "27" country code, e.g. "083 555 1234" -> "27835551234".
 */
export function formatPhoneForWhatsApp(phone) {
  if (!phone) return ''
  let digits = String(phone).replace(/[\s\-()]/g, '')
  digits = digits.replace(/[^\d+]/g, '')
  if (digits.startsWith('+')) digits = digits.slice(1)
  if (digits.startsWith('0')) digits = '27' + digits.slice(1)
  return digits
}

export function buildInvoiceWhatsAppMessage({ clientName, invoiceNumber, amount, dueDate, businessName, template }) {
  if (template) {
    return template
      .replace(/{clientName}/g,    clientName)
      .replace(/{invoiceNumber}/g, invoiceNumber)
      .replace(/{amount}/g,        amount)
      .replace(/{dueDate}/g,       dueDate)
      .replace(/{businessName}/g,  businessName)
  }
  return `Hi ${clientName}, please find invoice ${invoiceNumber} for ${amount} attached. Due date: ${dueDate}. Thank you for your business, ${businessName}.`
}

export function buildEstimateWhatsAppMessage({ clientName, estimateNumber, amount, expiryDate, businessName, template }) {
  if (template) {
    return template
      .replace(/{clientName}/g,    clientName)
      .replace(/{estimateNumber}/g, estimateNumber)
      .replace(/{amount}/g,         amount)
      .replace(/{expiryDate}/g,     expiryDate)
      .replace(/{businessName}/g,   businessName)
  }
  return `Hi ${clientName}, please find estimate ${estimateNumber} for ${amount} attached. Valid until: ${expiryDate}. Please don't hesitate to contact us. Kind regards, ${businessName}.`
}

/**
 * Download a PDF blob — via the Electron save dialog when available,
 * otherwise via a normal browser/PWA download link.
 * Returns true if the file was actually written/downloaded.
 */
async function downloadPdfBlob(blob, filename) {
  if (window.db?.pdf?.save) {
    const buffer = await blob.arrayBuffer()
    const res = await window.db.pdf.save(buffer, filename)
    if (res?.success === false && !res?.canceled) {
      throw new Error(res?.error || 'Failed to save PDF.')
    }
    return !!res?.success
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return true
}

/**
 * Share a PDF + message via the Web Share API (mobile PWA) when supported,
 * falling back to downloading the PDF and opening WhatsApp Web with a
 * pre-filled message (desktop Electron / desktop browser).
 *
 * Returns:
 *  - { status: 'shared' }    — Web Share API used successfully
 *  - { status: 'cancelled' } — user dismissed the share sheet
 *  - { status: 'fallback', downloaded } — desktop download + WhatsApp Web flow
 *
 * Throws an Error with a user-facing message on failure.
 */
export async function sendPdfViaWhatsApp({ blob, filename, message, phone, title }) {
  const pdfFile = new File([blob], filename, { type: 'application/pdf' })

  if (navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
    try {
      await navigator.share({ title, text: message, files: [pdfFile] })
      return { status: 'shared' }
    } catch (e) {
      if (e?.name === 'AbortError') return { status: 'cancelled' }
      throw e
    }
  }

  const downloaded = await downloadPdfBlob(blob, filename)

  const waPhone = formatPhoneForWhatsApp(phone)
  const url = `https://wa.me/${waPhone}?text=${encodeURIComponent(message)}`
  let win
  try {
    win = window.open(url, '_blank')
  } catch {
    win = null
  }
  if (!win) {
    throw new Error('Could not open WhatsApp. Please check your browser settings.')
  }

  return { status: 'fallback', downloaded }
}
