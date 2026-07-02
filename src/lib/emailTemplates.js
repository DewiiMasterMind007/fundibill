/**
 * src/lib/emailTemplates.js
 *
 * Generates branded HTML email bodies for invoice and estimate sending.
 * All styling is inline — email clients strip <style> tags.
 * Layout uses a max-width 600px centred table for broad client compatibility.
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Escape characters that are unsafe inside HTML text nodes / attribute values. */
function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Convert plain-text newlines to <br /> tags (after HTML-escaping). */
function nl2br(str) {
  return esc(str).replace(/\n/g, '<br />')
}

/** Format a raw number as South African currency: R&nbsp;1&nbsp;234,56 */
function fmtAmount(n) {
  const num = Number(n) || 0
  // en-ZA locale: thousands sep = space, decimal sep = comma
  return 'R ' + num.toLocaleString('en-ZA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

// ─── Branded footer (plain-text version) ─────────────────────────────────────

/**
 * Append this to the plain-text body of every outgoing email so that clients
 * that display only the text part still see the FundiBill attribution.
 */
export const PLAIN_TEXT_FOOTER =
  '\n\n---\nSent by FundiBill - SA Built Invoicing Software | fundibill.online'

// ─── Message template placeholders ────────────────────────────────────────────

/**
 * Fill a user-configured message template (profiles.email_invoice_message /
 * email_quote_message / email_overdue_message) with real values.
 * Mirrors the placeholder syntax used by the WhatsApp templates in whatsapp.js.
 *
 * @param {string} template  Raw template text, e.g. from the profile row.
 * @returns {string}  Empty string if no template was supplied.
 */
export function fillMessageTemplate(template, {
  clientName    = '',
  invoiceNumber = '',
  quoteNumber   = '',
  amount        = '',
  dueDate       = '',
  expiryDate    = '',
  businessName  = '',
} = {}) {
  if (!template) return ''
  return template
    .replaceAll('{clientName}',    clientName)
    .replaceAll('{invoiceNumber}', invoiceNumber)
    .replaceAll('{quoteNumber}',   quoteNumber)
    .replaceAll('{amount}',        amount)
    .replaceAll('{dueDate}',       dueDate)
    .replaceAll('{expiryDate}',    expiryDate)
    .replaceAll('{businessName}',  businessName)
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/**
 * Renders a summary info box (Invoice/Estimate details).
 * rows = [ [label, value], ... ]  — last row gets the primary colour treatment.
 */
function summaryBox(rows, primaryColor) {
  const rowHtml = rows.map(([label, value], i) => {
    const isLast   = i === rows.length - 1
    const border   = isLast ? '' : 'border-bottom:1px solid #e2e8f0;'
    const valColor = isLast ? primaryColor : '#0f172a'
    return `
      <tr>
        <td style="padding:12px 20px;${border}">
          <span style="font-size:11px;color:#94a3b8;font-family:Arial,Helvetica,sans-serif;text-transform:uppercase;letter-spacing:0.06em;display:block;margin-bottom:3px;">${esc(label)}</span>
          <span style="font-size:16px;font-weight:700;color:${esc(valColor)};font-family:Arial,Helvetica,sans-serif;">${esc(value)}</span>
        </td>
      </tr>`
  }).join('')

  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin:24px 0 20px;">
      ${rowHtml}
    </table>`
}

/**
 * Closing signature block.
 */
function signature(businessName, businessEmail, businessPhone) {
  return `
    <p style="font-size:13px;color:#64748b;font-family:Arial,Helvetica,sans-serif;margin:20px 0 4px;">Kind regards,</p>
    <p style="font-size:15px;font-weight:700;color:#0f172a;font-family:Arial,Helvetica,sans-serif;margin:0 0 4px;">${esc(businessName)}</p>
    ${businessEmail ? `<p style="font-size:13px;color:#64748b;font-family:Arial,Helvetica,sans-serif;margin:0 0 2px;">${esc(businessEmail)}</p>` : ''}
    ${businessPhone ? `<p style="font-size:13px;color:#64748b;font-family:Arial,Helvetica,sans-serif;margin:0;">${esc(businessPhone)}</p>` : ''}`
}

// ─── Base template ────────────────────────────────────────────────────────────

/**
 * Wraps the body content in the shared outer chrome:
 * coloured header → white content area → grey footer.
 */
function baseTemplate({ primaryColor, logoUrl, businessName, bodyHtml }) {
  const safeColor = esc(primaryColor || '#14b8a6')
  const safeName  = esc(businessName || '')

  // base64 data: URIs are stripped by Gmail, Outlook, and most email clients for
  // security. They also bloat the IPC payload. Only use the logo if it's an
  // accessible https:// URL; otherwise show the business name as text.
  const emailLogoUrl = (logoUrl && logoUrl.startsWith('http')) ? logoUrl : ''

  const headerInner = emailLogoUrl
    ? `<img src="${esc(emailLogoUrl)}" alt="${safeName}" style="max-height:52px;max-width:180px;display:block;" />`
    : `<span style="color:#ffffff;font-size:22px;font-weight:700;font-family:Arial,Helvetica,sans-serif;">${safeName}</span>`

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>${safeName}</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">

  <!--[if mso]><table role="presentation" width="100%"><tr><td><![endif]-->
  <table width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background-color:#f1f5f9;min-width:100%;">
    <tr>
      <td align="center" style="padding:32px 16px;">

        <table width="600" cellpadding="0" cellspacing="0" border="0"
               style="max-width:600px;width:100%;">

          <!-- ── Header ───────────────────────────────────────────────── -->
          <tr>
            <td style="background-color:${safeColor};
                        border-radius:10px 10px 0 0;
                        padding:24px 32px;">
              ${headerInner}
            </td>
          </tr>

          <!-- ── Body ─────────────────────────────────────────────────── -->
          <tr>
            <td style="background-color:#ffffff;
                        padding:32px 32px 28px;
                        border-left:1px solid #e2e8f0;
                        border-right:1px solid #e2e8f0;">
              ${bodyHtml}
            </td>
          </tr>

          <!-- ── Footer ───────────────────────────────────────────────── -->
          <tr>
            <td style="background-color:#f8fafc;
                        border:1px solid #e2e8f0;
                        border-top:none;
                        border-radius:0 0 10px 10px;
                        padding:18px 32px;
                        text-align:center;">
              <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#64748b;
                          font-family:Arial,Helvetica,sans-serif;">
                Sent by <strong style="color:#475569;">FundiBill</strong>
                &mdash; SA Built Invoicing Software
              </p>
              <p style="margin:0;font-size:12px;color:#94a3b8;
                          font-family:Arial,Helvetica,sans-serif;">
                <a href="https://fundibill.online"
                   style="color:#14b8a6;text-decoration:none;">fundibill.online</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
  <!--[if mso]></td></tr></table><![endif]-->

</body>
</html>`
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generate a branded HTML email body for an invoice.
 *
 * @param {object} data
 *   businessName    string
 *   businessEmail   string
 *   businessPhone   string
 *   logoUrl         string   base64 data-URL or https:// URL (or empty)
 *   primaryColor    string   hex colour from profile (default #14b8a6)
 *   clientName      string
 *   documentNumber  string   e.g. "INV-0001"
 *   amount          number   raw total (will be formatted)
 *   dueDate         string   ISO date string e.g. "2025-06-30"
 *   customMessage   string   the editable body text from the modal
 * @returns {string}  Full HTML document as a string
 */
export function generateInvoiceEmail({
  businessName  = '',
  businessEmail = '',
  businessPhone = '',
  logoUrl       = '',
  primaryColor  = '#14b8a6',
  clientName    = '',
  documentNumber = '',
  amount        = 0,
  dueDate       = '',
  customMessage = '',
}) {
  console.log('[emailTemplates] generateInvoiceEmail called', {
    businessName, documentNumber, clientName, amount, dueDate,
    hasLogo: !!logoUrl, logoIsDataUrl: logoUrl?.startsWith('data:'),
    primaryColor,
  })

  const color = primaryColor || '#14b8a6'

  const bodyHtml = `
    <p style="font-size:15px;color:#0f172a;font-family:Arial,Helvetica,sans-serif;margin:0 0 20px;font-weight:600;">
      Dear ${esc(clientName || 'Valued Client')},
    </p>
    <p style="font-size:14px;color:#334155;font-family:Arial,Helvetica,sans-serif;margin:0;line-height:1.7;">
      ${nl2br(customMessage)}
    </p>
    ${summaryBox([
      ['Invoice Number', documentNumber || '—'],
      ['Due Date',       dueDate        || '—'],
      ['Amount Due',     fmtAmount(amount)   ],
    ], color)}
    ${signature(businessName, businessEmail, businessPhone)}`

  const html = baseTemplate({ primaryColor: color, logoUrl, businessName, bodyHtml })
  console.log('[emailTemplates] generateInvoiceEmail done, html length:', html.length)
  return html
}

/**
 * Generate a branded HTML email body for an estimate.
 *
 * @param {object} data  (same shape as generateInvoiceEmail, expiryDate instead of dueDate)
 * @returns {string}
 */
export function generateEstimateEmail({
  businessName   = '',
  businessEmail  = '',
  businessPhone  = '',
  logoUrl        = '',
  primaryColor   = '#14b8a6',
  clientName     = '',
  documentNumber = '',
  amount         = 0,
  expiryDate     = '',
  customMessage  = '',
}) {
  console.log('[emailTemplates] generateEstimateEmail called', {
    businessName, documentNumber, clientName, amount, expiryDate,
    hasLogo: !!logoUrl, logoIsDataUrl: logoUrl?.startsWith('data:'),
    primaryColor,
  })

  const color = primaryColor || '#14b8a6'

  const bodyHtml = `
    <p style="font-size:15px;color:#0f172a;font-family:Arial,Helvetica,sans-serif;margin:0 0 20px;font-weight:600;">
      Dear ${esc(clientName || 'Valued Client')},
    </p>
    <p style="font-size:14px;color:#334155;font-family:Arial,Helvetica,sans-serif;margin:0;line-height:1.7;">
      ${nl2br(customMessage)}
    </p>
    ${summaryBox([
      ['Estimate Number', documentNumber || '—'],
      ['Expiry Date',     expiryDate     || '—'],
      ['Amount',         fmtAmount(amount)    ],
    ], color)}
    ${signature(businessName, businessEmail, businessPhone)}`

  const html = baseTemplate({ primaryColor: color, logoUrl, businessName, bodyHtml })
  console.log('[emailTemplates] generateEstimateEmail done, html length:', html.length)
  return html
}

/**
 * Generate a branded HTML email body for a manual payment reminder.
 *
 * @param {object} data
 *   businessName    string
 *   businessEmail   string
 *   businessPhone   string
 *   logoUrl         string
 *   primaryColor    string
 *   clientName      string
 *   invoiceNumber   string
 *   amount          number   raw total
 *   issueDate       string   ISO date
 *   dueDate         string   ISO date
 *   customMessage   string   the editable body text from the modal
 * @returns {string}  Full HTML document
 */
export function generateReminderEmail({
  businessName  = '',
  businessEmail = '',
  businessPhone = '',
  logoUrl       = '',
  primaryColor  = '#14b8a6',
  clientName    = '',
  invoiceNumber = '',
  amount        = 0,
  issueDate     = '',
  dueDate       = '',
  customMessage = '',
}) {
  const color = primaryColor || '#14b8a6'

  const bodyHtml = `
    <p style="font-size:15px;color:#0f172a;font-family:Arial,Helvetica,sans-serif;margin:0 0 20px;font-weight:600;">
      Dear ${esc(clientName || 'Valued Client')},
    </p>
    <p style="font-size:14px;color:#334155;font-family:Arial,Helvetica,sans-serif;margin:0;line-height:1.7;">
      ${nl2br(customMessage)}
    </p>
    ${summaryBox([
      ['Invoice Number', invoiceNumber || '—'],
      ['Issue Date',     issueDate     || '—'],
      ['Due Date',       dueDate       || '—'],
      ['Amount Due',     fmtAmount(amount)  ],
    ], color)}
    ${signature(businessName, businessEmail, businessPhone)}`

  return baseTemplate({ primaryColor: color, logoUrl, businessName, bodyHtml })
}

/**
 * Generate a branded HTML email body for a payment confirmation
 * ("thank you") email, sent when an invoice is marked as paid.
 *
 * @param {object} data
 *   businessName    string
 *   businessEmail   string
 *   businessPhone   string
 *   logoUrl         string
 *   primaryColor    string
 *   clientName      string
 *   invoiceNumber   string   e.g. "INV-0001"
 *   amount          number   raw amount paid (will be formatted)
 *   customMessage   string   the editable body text from the modal
 * @returns {string}  Full HTML document
 */
export function generatePaymentConfirmationEmail({
  businessName  = '',
  businessEmail = '',
  businessPhone = '',
  logoUrl       = '',
  primaryColor  = '#14b8a6',
  clientName    = '',
  invoiceNumber = '',
  amount        = 0,
  customMessage = '',
}) {
  const color = primaryColor || '#14b8a6'

  // The default customMessage already includes its own "Dear ..." greeting
  // and "Kind regards, ..." sign-off (see MarkAsPaidEmailModal), so — unlike
  // the other templates — we render it as-is without an extra greeting or
  // signature block to avoid duplication.
  const bodyHtml = `
    <p style="font-size:14px;color:#334155;font-family:Arial,Helvetica,sans-serif;margin:0;line-height:1.7;">
      ${nl2br(customMessage)}
    </p>
    ${summaryBox([
      ['Invoice Number', invoiceNumber || '—'],
      ['Amount Paid',    fmtAmount(amount)   ],
    ], color)}`

  return baseTemplate({ primaryColor: color, logoUrl, businessName, bodyHtml })
}

/**
 * Generate a branded HTML test email for the Settings → Send Test Email button.
 *
 * @param {object} opts
 *   businessName   string  (shown in the header and footer)
 *   primaryColor   string  (hex colour, default #14b8a6)
 * @returns {string}  Full HTML document
 */
export function generateTestEmail({
  businessName = '',
  primaryColor = '#14b8a6',
} = {}) {
  const bodyHtml = `
    <p style="font-size:15px;color:#0f172a;font-family:Arial,Helvetica,sans-serif;margin:0 0 16px;font-weight:600;">
      Email Configuration Test
    </p>
    <p style="font-size:14px;color:#334155;font-family:Arial,Helvetica,sans-serif;margin:0;line-height:1.7;">
      This is a test email from FundiBill. Your email settings are configured correctly.
    </p>`

  return baseTemplate({ primaryColor, logoUrl: '', businessName, bodyHtml })
}
