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
  let settingsWithLogo = settings || {}
  const logoSrc = settings?.logo_path || settings?.logo_url || ''
  if (logoSrc) {
    if (logoSrc.startsWith('data:')) {
      settingsWithLogo = { ...settings, _logoSrc: logoSrc }
    } else {
      const res = await window.db?.pdf?.getLogoBase64(logoSrc)
      if (res?.success) settingsWithLogo = { ...settings, _logoSrc: res.data }
    }
  }

  const [{ pdf }, { PdfDocument }] = await Promise.all([
    import('@react-pdf/renderer'),
    import('../pdf/PdfDocument'),
  ])

  const element = React.createElement(PdfDocument, { data, settings: settingsWithLogo, docType })
  const blob    = await pdf(element).toBlob()
  return blob.arrayBuffer()
}
