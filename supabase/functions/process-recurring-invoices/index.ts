/**
 * supabase/functions/process-recurring-invoices/index.ts
 *
 * Cron job: creates the next invoice for every due recurring_invoices
 * template (is_active = true, next_send_date <= today), advances
 * next_send_date/last_sent_date, and — when auto_send is enabled on the
 * template — automatically emails the newly-created invoice (with PDF) to
 * the client.
 *
 * This function did not exist before this feature — it is the piece
 * referenced in CLAUDE.md Known Issue #2: only the FIRST invoice for a
 * recurring schedule was ever created (by RecurringForm's save flow in
 * src/pages/Invoices.jsx). Subsequent invoices were never created by
 * anything. This cron job is that missing piece, built the same way
 * send-payment-reminders was (service-role client, same scheduling
 * pattern) — see that file for the general shape this follows.
 *
 * Three deliberate reuse decisions (avoid duplicating logic that already
 * exists and is already tested elsewhere in this codebase):
 *  - PDF generation calls the new /api/generate-invoice-pdf Vercel function,
 *    which reuses the app's real @react-pdf/renderer PdfDocument — instead
 *    of a second hand-written HTML/CSS invoice template.
 *  - Gmail sending calls the existing /api/send-gmail Vercel function
 *    (token refresh + RFC 2822 MIME building already live there) instead of
 *    reimplementing Gmail OAuth refresh + MIME construction a second time
 *    in Deno.
 *  - SMTP sending POSTs to the api.fundibill.online/send-reminder.php relay
 *    — the same one the PWA client already uses for custom-SMTP sends — NOT
 *    Deno's denomailer SMTPClient directly (unlike send-payment-reminders,
 *    which does use denomailer). Testing this function surfaced denomailer
 *    failing with a confusing "Bad resource ID" / unhandled "invalid cmd"
 *    error pair against at least one real SMTP host (a TLS/STARTTLS
 *    negotiation mismatch). See the comment on sendViaSmtp() below.
 *
 * Deploy:
 *   supabase functions deploy process-recurring-invoices --no-verify-jwt
 *
 * Schedule (run in Supabase SQL Editor — pg_cron + pg_net required):
 *
 *   SELECT cron.schedule(
 *     'process-recurring-invoices',
 *     '0 6 * * *',
 *     $$ select net.http_post(
 *       url     := 'https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/process-recurring-invoices',
 *       headers := jsonb_build_object('Authorization', 'Bearer <YOUR_SERVICE_ROLE_KEY>'),
 *       body    := '{}'::jsonb
 *     ) $$
 *   );
 *
 * Env vars (Supabase Dashboard → Edge Functions → Secrets):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — same as every other function here
 *   VITE_APP_URL                            — base URL for /api/generate-invoice-pdf and /api/send-gmail
 *   WELCOME_EMAIL_SMTP_HOST / _PORT / _USER / _PASSWORD — reused from the
 *     send-welcome-email function's own system mailbox, for the "auto-sent
 *     confirmation" email to the FundiBill *user* (not the client) — a
 *     system email, same as the welcome email, not sent via the user's own
 *     Gmail/SMTP.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Every outbound fetch in this function goes through this wrapper (real
// AbortController cancellation, not a Promise.race that just stops waiting
// while the request keeps running) so a slow/unreachable endpoint can only
// ever fail its own template, not stall the whole cron run for every other
// due template behind it.
async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function nl2br(s: unknown): string {
  return esc(s).replace(/\n/g, '<br />')
}

function fmtZAR(n: unknown): string {
  const num = Number(n) || 0
  return 'R ' + new Intl.NumberFormat('en-ZA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num)
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-ZA', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
}

function addDaysIso(dateStr: string, days: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

// Mirrors calcNextSendDate() in src/pages/Invoices.jsx
function calcNextSendDate(dateStr: string, interval: string): string {
  const d = new Date(dateStr)
  if      (interval === 'daily')   d.setDate(d.getDate() + 1)
  else if (interval === 'weekly')  d.setDate(d.getDate() + 7)
  else if (interval === 'monthly') d.setMonth(d.getMonth() + 1)
  else if (interval === 'yearly')  d.setFullYear(d.getFullYear() + 1)
  return d.toISOString().slice(0, 10)
}

// Mirrors fillMessageTemplate() in src/lib/emailTemplates.js
function fillMessageTemplate(template: string, vars: Record<string, string>): string {
  let out = template
  for (const [key, val] of Object.entries(vars)) {
    out = out.replaceAll(`{${key}}`, val)
  }
  return out
}

const DEFAULT_MESSAGE_TEMPLATE =
  'Dear {clientName},\n\nPlease find attached your invoice {invoiceNumber} for R {amount}, due on {dueDate}.\n\nThank you for your business.\n\nKind regards,\n{businessName}'

// ─── Email HTML — mirrors baseTemplate()/generateInvoiceEmail()/summaryBox()/
// signature() in src/lib/emailTemplates.js. Edge Functions run on Deno and
// can't import the Vite app's source tree, so this is hand-mirrored — same
// pattern already used by send-payment-reminders and send-welcome-email.
// Keep in sync by hand if the design in emailTemplates.js changes.

function buildInvoiceEmailHtml(d: {
  businessName: string
  businessEmail: string
  primaryColor: string
  logoUrl: string
  clientName: string
  invoiceNumber: string
  total: number
  dueDate: string
  bodyMessage: string
}): string {
  const safeColor = esc(d.primaryColor || '#14b8a6')
  const safeName  = esc(d.businessName || '')
  const emailLogoUrl = (d.logoUrl && d.logoUrl.startsWith('http')) ? d.logoUrl : ''

  const header = emailLogoUrl
    ? `<img src="${esc(emailLogoUrl)}" alt="${safeName}" width="600" style="display:block;width:100%;max-width:600px;height:auto;border-radius:10px 10px 0 0;" />`
    : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
         <tr>
           <td style="background-color:${safeColor};border-radius:10px 10px 0 0;padding:24px 32px;">
             <span style="color:#ffffff;font-size:22px;font-weight:700;font-family:Arial,Helvetica,sans-serif;">${safeName}</span>
           </td>
         </tr>
       </table>`

  const bodyHtml = `
    <p style="font-size:15px;color:#0f172a;font-family:Arial,Helvetica,sans-serif;margin:0 0 20px;font-weight:600;">
      Dear ${esc(d.clientName || 'Valued Client')},
    </p>
    <p style="font-size:14px;color:#334155;font-family:Arial,Helvetica,sans-serif;margin:0;line-height:1.7;">
      ${nl2br(d.bodyMessage)}
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin:24px 0 20px;">
      <tr>
        <td style="padding:12px 20px;border-bottom:1px solid #e2e8f0;">
          <span style="font-size:11px;color:#94a3b8;font-family:Arial,Helvetica,sans-serif;text-transform:uppercase;letter-spacing:0.06em;display:block;margin-bottom:3px;">Invoice Number</span>
          <span style="font-size:16px;font-weight:700;color:#0f172a;font-family:Arial,Helvetica,sans-serif;">${esc(d.invoiceNumber || '—')}</span>
        </td>
      </tr>
      <tr>
        <td style="padding:12px 20px;border-bottom:1px solid #e2e8f0;">
          <span style="font-size:11px;color:#94a3b8;font-family:Arial,Helvetica,sans-serif;text-transform:uppercase;letter-spacing:0.06em;display:block;margin-bottom:3px;">Due Date</span>
          <span style="font-size:16px;font-weight:700;color:#0f172a;font-family:Arial,Helvetica,sans-serif;">${esc(fmtDate(d.dueDate))}</span>
        </td>
      </tr>
      <tr>
        <td style="padding:12px 20px;">
          <span style="font-size:11px;color:#94a3b8;font-family:Arial,Helvetica,sans-serif;text-transform:uppercase;letter-spacing:0.06em;display:block;margin-bottom:3px;">Amount Due</span>
          <span style="font-size:16px;font-weight:700;color:${safeColor};font-family:Arial,Helvetica,sans-serif;">${esc(fmtZAR(d.total))}</span>
        </td>
      </tr>
    </table>
    <p style="font-size:13px;color:#64748b;font-family:Arial,Helvetica,sans-serif;margin:20px 0 4px;">Kind regards,</p>
    <p style="font-size:15px;font-weight:700;color:#0f172a;font-family:Arial,Helvetica,sans-serif;margin:0 0 4px;">${safeName}</p>
    ${d.businessEmail ? `<p style="font-size:13px;color:#64748b;font-family:Arial,Helvetica,sans-serif;margin:0;">${esc(d.businessEmail)}</p>` : ''}`

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>Invoice ${esc(d.invoiceNumber)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
  <!--[if mso]><table role="presentation" width="100%"><tr><td><![endif]-->
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f1f5f9;min-width:100%;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
          <tr><td style="padding:0;border-radius:10px 10px 0 0;overflow:hidden;">${header}</td></tr>
          <tr>
            <td style="background-color:#ffffff;padding:32px 32px 28px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="background-color:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 10px 10px;padding:18px 32px;text-align:center;">
              <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#64748b;font-family:Arial,Helvetica,sans-serif;">
                Sent by <strong style="color:#475569;">FundiBill</strong> &mdash; SA Built Invoicing Software
              </p>
              <p style="margin:0;font-size:12px;color:#94a3b8;font-family:Arial,Helvetica,sans-serif;">
                <a href="https://fundibill.online" style="color:#14b8a6;text-decoration:none;">fundibill.online</a>
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

// FundiBill-branded wrapper (logo header, not the user's own business
// header) for system notifications sent to the FundiBill user themselves —
// currently just the auto_send_cc_user "your invoice was sent" confirmation.
// Same outer shell/footer as buildInvoiceEmailHtml() above, different header.
const FUNDIBILL_LOGO_URL = 'https://www.fundibill.online/wp-content/uploads/2026/06/FundiBill-Logo.png'

function buildFundiBillNotificationEmailHtml(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>${esc(title)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
  <!--[if mso]><table role="presentation" width="100%"><tr><td><![endif]-->
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f1f5f9;min-width:100%;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
          <tr>
            <td style="padding:0;border-radius:10px 10px 0 0;overflow:hidden;">
              <img src="${FUNDIBILL_LOGO_URL}" alt="FundiBill" width="600" style="display:block;width:100%;max-width:600px;height:auto;border-radius:10px 10px 0 0;" />
            </td>
          </tr>
          <tr>
            <td style="background-color:#ffffff;padding:32px 32px 28px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="background-color:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 10px 10px;padding:18px 32px;text-align:center;">
              <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#64748b;font-family:Arial,Helvetica,sans-serif;">
                Sent by <strong style="color:#475569;">FundiBill</strong> &mdash; SA Built Invoicing Software
              </p>
              <p style="margin:0;font-size:12px;color:#94a3b8;font-family:Arial,Helvetica,sans-serif;">
                <a href="https://fundibill.online" style="color:#14b8a6;text-decoration:none;">fundibill.online</a>
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

// ─── Send helpers ─────────────────────────────────────────────────────────────

async function sendViaGmail(appUrl: string, args: {
  userId: string; to: string; subject: string; html: string
  pdfBase64: string; pdfFilename: string; fromName: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  let resp: Response
  try {
    resp = await fetchWithTimeout(`${appUrl}/api/send-gmail`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: args.userId,
        to: args.to,
        subject: args.subject,
        html: args.html,
        pdf_base64: args.pdfBase64,
        pdf_filename: args.pdfFilename,
        from_name: args.fromName,
      }),
    }, 25_000)
  } catch (err) {
    return { ok: false, error: `send-gmail request failed: ${(err as Error).message}` }
  }
  const result = await resp.json().catch(() => ({}))
  if (!resp.ok) return { ok: false, error: result?.error || 'send-gmail request failed' }
  return { ok: true }
}

// Sends via the same api.fundibill.online/send-reminder.php PHP relay the
// PWA client already uses for custom-SMTP sends (src/lib/sendEmail.js) —
// NOT denomailer's SMTPClient directly. Testing surfaced denomailer failing
// with a confusing "Bad resource ID" / unhandled "invalid cmd" error pair
// against at least one real SMTP host (TLS/STARTTLS negotiation mismatch —
// denomailer's `tls` option is implicit-TLS-at-connect-only, no automatic
// STARTTLS upgrade path was configured for non-465 ports). Rather than debug
// Deno's SMTP client against every possible mail server, route through the
// relay that's already proven to work for these exact user credentials via
// the normal in-app send flow — same contract, field-for-field.
async function sendViaSmtp(profile: Record<string, any>, args: {
  to: string; subject: string; html: string; pdfBase64: string; pdfFilename: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!profile.smtp_host || !profile.smtp_user || !profile.smtp_password) {
    return { ok: false, error: 'SMTP not configured for this user' }
  }
  try {
    const fromName = profile.smtp_from_name || profile.business_name || 'FundiBill'
    const resp = await fetchWithTimeout('https://api.fundibill.online/send-reminder.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        smtp_host: profile.smtp_host,
        smtp_port: profile.smtp_port,
        smtp_user: profile.smtp_user,
        smtp_password: profile.smtp_password,
        from_name: fromName,
        to_email: args.to,
        subject: args.subject,
        html_body: args.html,
        text_body: 'Please view this email in an HTML-capable client.',
        pdf_base64: args.pdfBase64,
        pdf_filename: args.pdfFilename,
      }),
    }, 25_000)
    const result = await resp.json().catch(() => ({}))
    if (!resp.ok || result?.success === false) {
      return { ok: false, error: result?.error || 'send-reminder.php request failed' }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

// System "noreply@fundibill.online" confirmation email to the FundiBill user
// (not the client) — reuses the same system mailbox as send-welcome-email,
// not the user's own Gmail/SMTP (this is a FundiBill notification, not
// something the client should see as coming from the business).
async function sendCcUserEmail(args: { to: string; subject: string; html: string }): Promise<void> {
  const smtpHost = Deno.env.get('WELCOME_EMAIL_SMTP_HOST')
  const smtpPort = Deno.env.get('WELCOME_EMAIL_SMTP_PORT')
  const smtpUser = Deno.env.get('WELCOME_EMAIL_SMTP_USER')
  const smtpPassword = Deno.env.get('WELCOME_EMAIL_SMTP_PASSWORD')
  if (!smtpHost || !smtpPort || !smtpUser || !smtpPassword) {
    console.error('process-recurring-invoices: missing WELCOME_EMAIL_SMTP_* secrets, skipping CC-user email')
    return
  }
  try {
    const resp = await fetchWithTimeout('https://api.fundibill.online/send-reminder.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to_email: args.to,
        subject: args.subject,
        html_body: args.html,
        from_name: 'FundiBill',
        smtp_host: smtpHost,
        smtp_port: smtpPort,
        smtp_user: smtpUser,
        smtp_password: smtpPassword,
      }),
    }, 20_000)
    const result = await resp.json().catch(() => ({}))
    if (!resp.ok || result?.success === false) {
      console.error('process-recurring-invoices: CC-user email failed', result)
    }
  } catch (err) {
    console.error('process-recurring-invoices: CC-user email failed', (err as Error).message)
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  const appUrl = (Deno.env.get('VITE_APP_URL') || '').replace(/\/$/, '')

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const today = new Date().toISOString().slice(0, 10)

    const { data: templates, error: tplError } = await supabase
      .from('recurring_invoices')
      .select('*')
      .eq('is_active', true)
      .lte('next_send_date', today)

    if (tplError) throw new Error(`recurring_invoices query failed: ${tplError.message}`)

    const results = { processed: 0, created: 0, sent: 0, errors: [] as string[] }

    for (const template of (templates ?? [])) {
      results.processed++

      try {
        // ── 1. Fetch the user's profile (numbering + email settings) ────────
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', template.user_id)
          .maybeSingle()

        if (!profile) {
          results.errors.push(`recurring ${template.id}: profile not found`)
          continue
        }

        // ── 2. Generate the next invoice number (mirrors RecurringForm) ─────
        const { data: existingInvs } = await supabase
          .from('invoices').select('invoice_number').eq('user_id', template.user_id)
        const prefix = profile.invoice_prefix || 'INV-'
        const start  = profile.starting_invoice_number || 1
        const usedSet = new Set((existingInvs ?? []).map((i: any) => i.invoice_number))
        const maxNum = (existingInvs ?? []).reduce((max: number, inv: any) => {
          const match = (inv.invoice_number || '').match(/(\d+)$/)
          return match ? Math.max(max, parseInt(match[1], 10)) : max
        }, 0)
        let seq = maxNum > 0 ? maxNum + 1 : start
        let invoiceNumber = `${prefix}${String(seq).padStart(4, '0')}`
        while (usedSet.has(invoiceNumber)) {
          seq++
          invoiceNumber = `${prefix}${String(seq).padStart(4, '0')}`
        }

        // ── 3. Totals from the template's stored line items ─────────────────
        const items = (template.items || []) as Array<{ item_name: string; description?: string; quantity: number; unit_price: number }>
        const lineItems = items.map((li) => ({
          item_name: li.item_name,
          description: li.description || null,
          quantity: Number(li.quantity) || 1,
          unit_price: Number(li.unit_price) || 0,
          line_total: (Number(li.quantity) || 1) * (Number(li.unit_price) || 0),
        }))
        const lineTotal = lineItems.reduce((s, li) => s + li.line_total, 0)
        const subtotal = template.vat_enabled ? lineTotal / 1.15 : lineTotal
        const vatAmt = template.vat_enabled ? lineTotal - subtotal : 0

        const issueDate = template.next_send_date
        const dueDate = addDaysIso(issueDate, Number(profile.payment_terms_days) || 7)

        // Banking snapshot — mirrors createBankingSnapshot() in
        // src/utils/bankingDetails.js (Deno can't import that file, same
        // reason the email HTML is hand-mirrored elsewhere in this
        // function). Uses the account picked on the recurring template
        // (RecurringForm's Banking Details selector); falls back to
        // whichever account is currently the user's default if the
        // template has none set (new template created before this field
        // existed, or the picked account was since deleted — the
        // banking_detail_id FK is ON DELETE SET NULL for that reason).
        let bankingSnapshot: Record<string, unknown> | null = null
        {
          const { data: bankingRows } = await supabase
            .from('banking_details')
            .select('*')
            .eq('user_id', template.user_id)
          const chosen = template.banking_detail_id
            ? (bankingRows ?? []).find((b: any) => b.id === template.banking_detail_id)
            : null
          const fallback = (bankingRows ?? []).find((b: any) => b.is_default) || (bankingRows ?? [])[0]
          const banking = chosen || fallback
          if (banking) {
            bankingSnapshot = {
              account_name: banking.account_name ?? null,
              bank_name: banking.bank_name ?? null,
              account_number: banking.account_number ?? null,
              branch_code: banking.branch_code ?? null,
              account_type: banking.account_type ?? null,
            }
          }
        }

        // ── 4. Insert the invoice ────────────────────────────────────────────
        const { data: invoice, error: invErr } = await supabase
          .from('invoices')
          .insert({
            invoice_number: invoiceNumber,
            client_id: template.client_id || null,
            issue_date: issueDate,
            due_date: dueDate,
            notes: template.notes || null,
            vat_enabled: template.vat_enabled,
            vat_rate: template.vat_enabled ? 15 : 0,
            subtotal,
            vat_amount: vatAmt,
            total: lineTotal,
            amount_paid: 0,
            status: 'draft',
            from_recurring: true,
            notification_dismissed: false,
            banking_details_snapshot: bankingSnapshot,
            user_id: template.user_id,
          })
          .select()
          .single()

        if (invErr) throw new Error(`invoice insert failed: ${invErr.message}`)

        if (lineItems.length > 0) {
          const { error: itemsErr } = await supabase
            .from('invoice_items')
            .insert(lineItems.map((li) => ({ ...li, invoice_id: invoice.id })))
          if (itemsErr) throw new Error(`invoice_items insert failed: ${itemsErr.message}`)
        }

        // ── 5. Advance the template's schedule ───────────────────────────────
        const nextSendDate = calcNextSendDate(issueDate, template.interval)
        await supabase
          .from('recurring_invoices')
          .update({ next_send_date: nextSendDate, last_sent_date: issueDate })
          .eq('id', template.id)

        results.created++

        // ── 6. Auto-send (STEP A) ────────────────────────────────────────────
        if (!template.auto_send) {
          continue // existing in-app notification banner still applies — see RecurringNotifContext.jsx
        }

        // STEP B — client
        const { data: client } = template.client_id
          ? await supabase.from('clients').select('name, company_name, email').eq('id', template.client_id).maybeSingle()
          : { data: null }

        const clientName = client?.company_name || client?.name || 'Valued Client'
        const clientEmail = client?.email?.trim() || ''

        if (!clientEmail) {
          await supabase.from('invoices').update({ auto_send_error: 'Client has no email address' }).eq('id', invoice.id)
          results.errors.push(`${invoiceNumber}: client has no email address`)
          continue
        }

        // STEP C — PDF
        if (!appUrl) {
          await supabase.from('invoices').update({ auto_sent: false, auto_send_error: 'VITE_APP_URL not configured' }).eq('id', invoice.id)
          results.errors.push(`${invoiceNumber}: VITE_APP_URL not configured`)
          continue
        }

        let pdfBase64 = ''
        let pdfFilename = `Invoice-${invoiceNumber}.pdf`
        try {
          const pdfResp = await fetchWithTimeout(`${appUrl}/api/generate-invoice-pdf`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ invoice_id: invoice.id, user_id: template.user_id }),
          }, 25_000)
          const pdfResult = await pdfResp.json().catch(() => ({}))
          if (!pdfResp.ok || !pdfResult?.success) {
            throw new Error(pdfResult?.error || 'PDF generation request failed')
          }
          pdfBase64 = pdfResult.pdf_base64
          pdfFilename = pdfResult.filename || pdfFilename
        } catch (err) {
          const msg = `PDF generation failed: ${(err as Error).message}`
          await supabase.from('invoices').update({ auto_sent: false, auto_send_error: msg }).eq('id', invoice.id)
          results.errors.push(`${invoiceNumber}: ${msg}`)
          continue
        }

        // STEP D — email content
        const businessName = profile.business_name || 'FundiBill'
        const subject = `Invoice ${invoiceNumber} from ${businessName}`
        const amountFmt = fmtZAR(lineTotal).replace('R ', '') // {amount} placeholder is just the number, matching fillMessageTemplate's existing convention elsewhere
        const rawMessage = profile.email_invoice_message && profile.email_invoice_message.trim()
          ? profile.email_invoice_message
          : DEFAULT_MESSAGE_TEMPLATE
        const bodyMessage = fillMessageTemplate(rawMessage, {
          clientName,
          invoiceNumber,
          businessName,
          amount: amountFmt,
          dueDate: fmtDate(dueDate),
        })
        const html = buildInvoiceEmailHtml({
          businessName,
          businessEmail: profile.email || profile.smtp_user || '',
          primaryColor: profile.primary_color || '#14b8a6',
          logoUrl: profile.logo_url || '',
          clientName,
          invoiceNumber,
          total: lineTotal,
          dueDate,
          bodyMessage,
        })

        // STEP E — send via the user's configured provider
        const sendResult = profile.email_provider === 'gmail'
          ? (profile.gmail_access_token
              ? await sendViaGmail(appUrl, {
                  userId: template.user_id, to: clientEmail, subject, html,
                  pdfBase64, pdfFilename, fromName: businessName,
                })
              : { ok: false as const, error: 'Gmail not connected' })
          : await sendViaSmtp(profile, { to: clientEmail, subject, html, pdfBase64, pdfFilename })

        // STEP F — handle result
        if (sendResult.ok) {
          await supabase.from('invoices').update({
            auto_sent: true,
            auto_sent_at: new Date().toISOString(),
            auto_send_error: null,
            sent_from_app: true,
            status: 'sent',
          }).eq('id', invoice.id)
          results.sent++

          if (template.auto_send_cc_user && profile.email) {
            const ccTitle = `Recurring Invoice ${invoiceNumber} sent successfully`
            const ccBody = `
              <p style="font-size:15px;color:#0f172a;font-family:Arial,Helvetica,sans-serif;margin:0 0 16px;font-weight:600;">
                Recurring invoice sent successfully
              </p>
              <p style="font-size:14px;color:#334155;font-family:Arial,Helvetica,sans-serif;margin:0 0 20px;line-height:1.7;">
                Your recurring invoice <strong>${esc(invoiceNumber)}</strong> for <strong>${esc(clientName)}</strong>
                was automatically sent to ${esc(clientEmail)} on ${esc(fmtDate(today))}.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;">
                <tr>
                  <td style="padding:12px 20px;border-bottom:1px solid #e2e8f0;">
                    <span style="font-size:11px;color:#94a3b8;font-family:Arial,Helvetica,sans-serif;text-transform:uppercase;letter-spacing:0.06em;display:block;margin-bottom:3px;">Invoice Number</span>
                    <span style="font-size:16px;font-weight:700;color:#0f172a;font-family:Arial,Helvetica,sans-serif;">${esc(invoiceNumber)}</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:12px 20px;">
                    <span style="font-size:11px;color:#94a3b8;font-family:Arial,Helvetica,sans-serif;text-transform:uppercase;letter-spacing:0.06em;display:block;margin-bottom:3px;">Amount</span>
                    <span style="font-size:16px;font-weight:700;color:#14b8a6;font-family:Arial,Helvetica,sans-serif;">${esc(fmtZAR(lineTotal))}</span>
                  </td>
                </tr>
              </table>`
            await sendCcUserEmail({
              to: profile.email,
              subject: `FundiBill - Recurring Invoice ${invoiceNumber} sent successfully to ${clientName}`,
              html: buildFundiBillNotificationEmailHtml(ccTitle, ccBody),
            })
          }
        } else {
          console.error(`process-recurring-invoices: send failed for ${invoiceNumber}:`, sendResult.error)
          await supabase.from('invoices').update({
            auto_sent: false,
            auto_send_error: sendResult.error,
          }).eq('id', invoice.id)
          results.errors.push(`${invoiceNumber}: ${sendResult.error}`)
          // In-app notification banner still shows (status is still 'draft') so the user can send manually.
        }

      } catch (err) {
        console.error(`process-recurring-invoices: template ${template.id} failed:`, err)
        results.errors.push(`recurring ${template.id}: ${(err as Error).message}`)
      }
    }

    return new Response(JSON.stringify(results), {
      status: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('process-recurring-invoices fatal error:', err)
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
