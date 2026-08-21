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

  // With a real logo, the logo itself becomes the full-width header banner
  // (matches how Zoho Invoice and similar tools render branded emails) —
  // no coloured bar around it. Without one, fall back to the coloured bar
  // + business name text so the header never looks empty.
  const header = emailLogoUrl
    ? `<img src="${esc(emailLogoUrl)}" alt="${safeName}" width="600" style="display:block;width:100%;max-width:600px;height:auto;border-radius:10px 10px 0 0;" />`
    : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
         <tr>
           <td style="background-color:${safeColor};border-radius:10px 10px 0 0;padding:24px 32px;">
             <span style="color:#ffffff;font-size:22px;font-weight:700;font-family:Arial,Helvetica,sans-serif;">${safeName}</span>
           </td>
         </tr>
       </table>`

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
            <td style="padding:0;border-radius:10px 10px 0 0;overflow:hidden;">
              ${header}
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
      ['Quote Number',    documentNumber || '—'],
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
 * Branded as FundiBill itself (logo, name), not the user's own business —
 * this is a FundiBill system message confirming the user's email settings
 * work, not something sent to their client.
 *
 * @returns {string}  Full HTML document
 */
export function generateTestEmail() {
  const FUNDIBILL_LOGO_URL = 'https://www.fundibill.online/wp-content/uploads/2026/06/FundiBill-Logo.png'

  const bodyHtml = `
    <p style="font-size:15px;color:#0f172a;font-family:Arial,Helvetica,sans-serif;margin:0 0 16px;font-weight:600;">
      Email configuration test
    </p>
    <p style="font-size:14px;color:#334155;font-family:Arial,Helvetica,sans-serif;margin:0 0 16px;line-height:1.7;">
      This is a test email from FundiBill. Your email settings are configured correctly.
    </p>
    <p style="font-size:14px;color:#334155;font-family:Arial,Helvetica,sans-serif;margin:0;line-height:1.7;">
      You can now send your invoices and quotes directly to your clients from the app.
    </p>`

  return baseTemplate({ primaryColor: '#14b8a6', logoUrl: FUNDIBILL_LOGO_URL, businessName: 'FundiBill', bodyHtml })
}

/**
 * Generate the one-time welcome email sent after a new user confirms their
 * email address (see supabase/functions/send-welcome-email). Unlike the
 * other templates above, this has its own fully custom layout (white header,
 * edge-to-edge hero image, dark footer) rather than using baseTemplate() —
 * the brand design spec for this email doesn't match the invoice/estimate
 * chrome, so it's a self-contained document.
 *
 * All URLs (logo, hero image, white footer logo, Google review, Facebook,
 * Instagram) are set below — keep them in sync with the mirrored copy in
 * supabase/functions/send-welcome-email/index.ts if any of them change.
 *
 * @returns {string}  Full HTML document as a string
 */
export function generateWelcomeEmail() {
  const LOGO_URL          = 'https://www.fundibill.online/wp-content/uploads/2026/06/FundiBill-Logo.png'
  const LOGO_URL_WHITE    = 'https://www.fundibill.online/wp-content/uploads/2026/06/FundiAI-Logo-1.png'
  const HERO_IMAGE_URL    = 'https://www.fundibill.online/wp-content/uploads/2026/07/FundiBill-Welcome-Email-Header.png'
  const GOOGLE_REVIEW_URL = 'https://g.page/r/CW6EkPEWdnCREBM/review'
  const FACEBOOK_URL      = 'https://www.facebook.com/fundibill'
  const INSTAGRAM_URL     = 'https://www.instagram.com/fundibillza'
  const APP_URL           = 'https://app.fundibill.online'

  const FONT = 'Arial,Helvetica,sans-serif'
  const BODY_TEXT = `font-size:16px;color:#444444;font-family:${FONT};line-height:1.6;margin:0 0 16px;`
  const STEP_TITLE = `font-size:16px;color:#1a1a2e;font-family:${FONT};font-weight:700;margin:0 0 6px;`
  const STEP_BODY  = `font-size:15px;color:#444444;font-family:${FONT};line-height:1.6;margin:0;`

  // Each step: a number circle (left, 36px) + title/body (right), 24px gap between rows.
  function step(number, title, bodyHtml) {
    return `
      <tr>
        <td width="36" valign="top" style="padding-bottom:24px;">
          <table cellpadding="0" cellspacing="0" border="0" role="presentation">
            <tr>
              <td width="36" height="36" align="center" valign="middle"
                  style="width:36px;height:36px;border-radius:50%;background-color:#1a1a2e;color:#ffffff;font-family:${FONT};font-weight:700;font-size:16px;">
                ${number}
              </td>
            </tr>
          </table>
        </td>
        <td valign="top" style="padding:0 0 24px 16px;">
          <p style="${STEP_TITLE}">${esc(title)}</p>
          ${bodyHtml}
        </td>
      </tr>`
  }

  const step1Body = `
    <p style="${STEP_BODY}">Head over to Settings and add:</p>
    <p style="${STEP_BODY}margin-top:6px;">
      • Your business name<br />
      • Logo<br />
      • Contact details<br />
      • Banking details<br />
      • VAT number (if applicable)
    </p>
    <p style="${STEP_BODY}margin-top:6px;">This information is automatically added to every invoice you send.</p>`

  const step2Body = `
    <p style="${STEP_BODY}">Click on Clients. Save their details once and never type them out again.</p>`

  const step3Body = `
    <p style="${STEP_BODY}">Under Items, add the things you sell or the services you provide. Once they're saved, you can select them on your invoices with just a click.</p>
    <p style="font-size:13px;color:#94a3b8;font-family:${FONT};font-style:italic;line-height:1.5;margin:8px 0 0;">
      Adding a service/product straight on your invoices/quotes, it will automatically save on your item list for quicker use.
    </p>`

  const step4Body = `
    <p style="${STEP_BODY}">
      • Click New Invoice.<br />
      • Choose your customer.<br />
      • Add your products or services.<br />
      • Click Generate PDF or Send it on Email / WhatsApp
    </p>
    <p style="${STEP_BODY}margin-top:6px;">Seriously... that's it.</p>`

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>Welcome to FundiBill</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:${FONT};">

  <!--[if mso]><table role="presentation" width="100%"><tr><td><![endif]-->
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f4;min-width:100%;">
    <tr>
      <td align="center" style="padding:24px 16px;">

        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;">

          <!-- ── Section 1: Header ───────────────────────────────────────── -->
          <tr>
            <td align="center" style="background-color:#ffffff;padding:20px 0;">
              <img src="${LOGO_URL}" alt="FundiBill" width="120" style="display:block;width:120px;height:auto;" />
            </td>
          </tr>

          <!-- ── Section 2: Hero image ───────────────────────────────────── -->
          <tr>
            <td style="padding:0;line-height:0;font-size:0;">
              <img src="${HERO_IMAGE_URL}" alt="Thanks for signing up!" width="600" style="display:block;width:100%;max-width:600px;height:auto;" />
            </td>
          </tr>

          <!-- ── Section 3: Body ─────────────────────────────────────────── -->
          <tr>
            <td style="background-color:#ffffff;padding:40px;">

              <h1 style="font-size:32px;font-weight:700;color:#1a1a2e;font-family:${FONT};margin:0 0 16px;">Hi there!</h1>

              <p style="${BODY_TEXT}">Firstly... thank you for signing up.</p>

              <p style="${BODY_TEXT}">You've just taken the first step towards spending less time chasing paperwork and more time doing what actually makes you money. Whether you're a plumber, electrician, freelancer, consultant, or side-hustler extraordinaire - we built FundiBill to make invoicing ridiculously simple and pretty damn affordable.</p>

              <p style="${BODY_TEXT}margin-bottom:32px;">No accounting degree required. 😎</p>

              <h2 style="font-size:18px;font-weight:700;color:#1a1a2e;font-family:${FONT};text-align:center;margin:0 0 32px;">Let's Get You Started</h2>

              <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
                ${step(1, 'Complete your Business Profile', step1Body)}
                ${step(2, 'Add Your Clients', step2Body)}
                ${step(3, 'Create Your Services or Products', step3Body)}
                ${step(4, 'Create Your First Invoice', step4Body)}
              </table>

              <!-- CTA button — text-align:center wrapper is the email-safe way to
                   centre a block-level button (auto margins on <a> are unreliable
                   across clients), giving the same visual result as the spec. -->
              <div style="text-align:center;margin:40px 0 0;">
                <a href="${APP_URL}" style="display:inline-block;background-color:#7bc142;color:#ffffff;font-weight:700;font-size:16px;font-family:${FONT};padding:16px 48px;border-radius:8px;text-decoration:none;">Start Now</a>
              </div>

              <!-- ── Support section ── -->
              <div style="margin-top:40px;padding-top:24px;border-top:1px solid #eeeeee;">
                <p style="font-size:16px;font-weight:700;color:#1a1a2e;font-family:${FONT};margin:0 0 8px;">Need a hand?</p>
                <p style="${BODY_TEXT}">We're real people who genuinely want to help. If you ever get stuck, have a question, or think of a feature that would make FundiBill even better. We read every message.</p>
                <p style="${BODY_TEXT}margin-bottom:0;">
                  Please reach out to us on
                  <a href="mailto:info@fundibill.online" style="color:#7bc142;text-decoration:none;font-weight:700;">info@fundibill.online</a>
                </p>
              </div>

              <!-- ── Favour section ── -->
              <div style="margin-top:32px;">
                <p style="font-size:16px;font-weight:700;color:#1a1a2e;font-family:${FONT};margin:0 0 8px;">A small favour?</p>
                <p style="${BODY_TEXT}">If FundiBill saves you time (and we're confident it will), we'd really appreciate it if you told another business owner about us. Word of mouth helps small South African businesses like ours grow.</p>
                <p style="${BODY_TEXT}margin-bottom:8px;">Tell us what you think:</p>
                <a href="${GOOGLE_REVIEW_URL}" style="color:#7bc142;font-weight:700;font-family:${FONT};font-size:15px;text-decoration:underline;">Review on Google</a>
              </div>

              <!-- ── Sign-off ── -->
              <div style="margin-top:32px;">
                <p style="${BODY_TEXT}margin-bottom:0;">Thank you for supporting local.</p>
                <p style="${BODY_TEXT}margin-bottom:0;">We're excited to be part of your business journey.</p>
                <p style="${BODY_TEXT}margin-top:16px;margin-bottom:0;">Happy invoicing!</p>
                <p style="${BODY_TEXT}margin-bottom:0;">The FundiBill Team</p>
              </div>

            </td>
          </tr>

          <!-- ── Section 4: Footer ───────────────────────────────────────── -->
          <tr>
            <td style="background-color:#1a1a2e;padding:40px;">
              <img src="${LOGO_URL_WHITE}" alt="FundiBill" width="100" style="display:block;width:100px;height:auto;margin:0 0 16px;" />

              <p style="font-size:18px;font-weight:700;color:#ffffff;font-family:${FONT};text-align:left;margin:0 0 8px;">
                Invoices made <span style="color:#7bc142;">easy</span> and <span style="color:#4ecdc4;">affordable.</span>
              </p>

              <p style="color:#cccccc;font-size:14px;font-family:${FONT};margin:0 0 8px;">Follow our journey</p>

              <p style="color:#cccccc;font-size:14px;font-family:${FONT};margin:0;">
                <a href="${FACEBOOK_URL}" style="color:#cccccc;text-decoration:underline;">Facebook</a>
                &nbsp;|&nbsp;
                <a href="${INSTAGRAM_URL}" style="color:#cccccc;text-decoration:underline;">Instagram</a>
              </p>

              <div style="border-top:1px solid #333333;margin:24px 0;"></div>

              <p style="color:#888888;font-size:12px;font-family:${FONT};margin:0 0 4px;">You received this email since you created a FundiBill account.</p>
              <p style="color:#888888;font-size:12px;font-family:${FONT};margin:0 0 4px;">© FundiBill. Cape Town, South Africa</p>
              <p style="color:#7bc142;font-size:12px;font-family:${FONT};margin:0;">Powered by Fundi AI Pty Ltd</p>
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
