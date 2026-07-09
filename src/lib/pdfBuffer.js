import React from 'react'

/**
 * src/lib/pdfBuffer.js
 *
 * Shared helper for building a PDF ArrayBuffer from an invoice/estimate data
 * object using the branded @react-pdf/renderer document. Used wherever a PDF
 * needs to be attached to an outgoing email (Send by Email, payment
 * confirmation emails, etc.).
 *
 * settings may use logo_path (Settings form state) or logo_url (raw DB row).
 */
export async function buildPdfBuffer(data, settings, docType) {
  // logo_url is either a data: URL (legacy accounts, pre-Storage-upload) or
  // an https:// URL (Supabase Storage, current). @react-pdf/renderer's
  // <Image> component accepts both directly — no file-system read needed.
  // (The old window.db.pdf.getLogoBase64 IPC call only worked for local
  // filesystem paths and silently failed on remote URLs.)
  let settingsWithLogo = settings || {}
  const logoSrc = settings?.logo_path || settings?.logo_url || ''
  if (logoSrc) {
    settingsWithLogo = { ...settings, _logoSrc: logoSrc }
  }

  const [{ pdf }, { PdfDocument }] = await Promise.all([
    import('@react-pdf/renderer'),
    import('../pdf/PdfDocument'),
  ])

  const element = React.createElement(PdfDocument, { data, settings: settingsWithLogo, docType })

  try {
    const blob = await pdf(element).toBlob()
    console.log('[PDF] blob generated, size:', blob.size)
    return blob.arrayBuffer()
  } catch (err) {
    console.error('[PDF] generation failed:', err)
    throw new Error('PDF generation failed: ' + err.message)
  }
}
