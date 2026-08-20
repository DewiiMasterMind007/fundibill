/**
 * supabase/functions/send-auto-payment-reminders/index.ts
 *
 * Cron job: automatically emails payment reminders for overdue invoices,
 * on a fixed schedule, for any user with profiles.auto_reminders_enabled.
 *
 * This is a NEW, separate system from the older send-payment-reminders
 * function (per-invoice opt-in via invoices.reminder_opted_in +
 * profiles.reminders_enabled/reminder_interval_days) — that function is
 * left completely untouched and keeps running on its own schedule. This one
 * uses different columns (profiles.auto_reminders_enabled,
 * invoices.auto_reminder_count/auto_reminder_last_sent_at) so the two
 * systems can never collide or double-send.
 *
 * Eligibility for a given invoice:
 *  - invoices.sent_from_app = true (never for invoices never actually sent)
 *  - invoices.status != 'paid'
 *  - invoices.due_date <= today
 *  - profiles.auto_reminders_enabled = true for that invoice's owner
 *
 * Schedule (per invoice, driven by auto_reminder_count):
 *  - count 0: first reminder, due the moment due_date <= today
 *  - count 1: second reminder, due 7 days after due_date
 *  - count 2+: every 3 days after auto_reminder_last_sent_at
 *  Continues indefinitely until the invoice is marked paid (at which point
 *  the eligibility query above simply stops matching it).
 *
 * Two reuse decisions, same reasoning as process-recurring-invoices:
 *  - PDF generation calls /api/generate-invoice-pdf (reuses the real
 *    @react-pdf/renderer PdfDocument).
 *  - Gmail sending calls /api/send-gmail; SMTP sends go through the
 *    send-reminder.php relay — NOT Deno's denomailer directly (see
 *    process-recurring-invoices' header comment / CLAUDE.md Known Issue #12
 *    for why: a real SMTP host triggered a confusing denomailer failure in
 *    testing there).
 *  - Every helper below (esc/fmtZAR/fmtDate/fetchWithTimeout/sendViaGmail/
 *    sendViaSmtp/the FundiBill-branded wrapper) is duplicated from
 *    process-recurring-invoices/index.ts rather than shared — Deno Edge
 *    Functions in this project don't use a `_shared` import convention
 *    anywhere yet, and hand-duplication is the existing pattern (see
 *    send-welcome-email mirroring generateWelcomeEmail()).
 *
 * Deploy:
 *   supabase functions deploy send-auto-payment-reminders --no-verify-jwt
 *
 * Schedule (run in Supabase SQL Editor — pg_cron + pg_net required):
 *
 *   SELECT cron.schedule(
 *     'send-auto-payment-reminders',
 *     '0 8 * * *',
 *     $$ select net.http_post(
 *       url     := 'https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/send-auto-payment-reminders',
 *       headers := jsonb_build_object('Authorization', 'Bearer <YOUR_SERVICE_ROLE_KEY>'),
 *       body    := '{}'::jsonb
 *     ) $$
 *   );
 *
 * Env vars (Supabase Dashboard -> Edge Functions -> Secrets) — same set as
 * process-recurring-invoices: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * VITE_APP_URL, WELCOME_EMAIL_SMTP_HOST/_PORT/_USER/_PASSWORD.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function daysBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / 86_400_000
}

function fillMessageTemplate(template: string, vars: Record<string, string>): string {
  let out = template
  for (const [key, val] of Object.entries(vars)) {
    out = out.replaceAll(`{${key}}`, val)
  }
  return out
}

async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

// ─── Client-facing reminder email — mirrors generateReminderEmail()/
// summaryBox()/signature()/baseTemplate() in src/lib/emailTemplates.js.
// Branded as the BUSINESS (logo/name), not FundiBill — this goes to the
// client, same as a manually-sent reminder would. ───────────────────────────

function summaryBox(rows: [string, string][], primaryColor: string): string {
  const rowHtml = rows.map(([label, value], i) => {
    const isLast = i === rows.length - 1
    const border = isLast ? '' : 'border-bottom:1px solid #e2e8f0;'
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

function buildReminderEmailHtml(d: {
  businessName: string; businessEmail: string; businessPhone: string; logoUrl: string; primaryColor: string
  clientName: string; invoiceNumber: string; amount: number; issueDate: string; dueDate: string; customMessage: string
}): string {
  const safeColor = esc(d.primaryColor || '#14b8a6')
  const safeName = esc(d.businessName || '')
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
      ${nl2br(d.customMessage)}
    </p>
    ${summaryBox([
      ['Invoice Number', d.invoiceNumber || '—'],
      ['Issue Date', d.issueDate || '—'],
      ['Due Date', d.dueDate || '—'],
      ['Amount Due', fmtZAR(d.amount)],
    ], safeColor)}
    <p style="font-size:13px;color:#64748b;font-family:Arial,Helvetica,sans-serif;margin:20px 0 4px;">Kind regards,</p>
    <p style="font-size:15px;font-weight:700;color:#0f172a;font-family:Arial,Helvetica,sans-serif;margin:0 0 4px;">${safeName}</p>
    ${d.businessEmail ? `<p style="font-size:13px;color:#64748b;font-family:Arial,Helvetica,sans-serif;margin:0;">${esc(d.businessEmail)}</p>` : ''}
    ${d.businessPhone ? `<p style="font-size:13px;color:#64748b;font-family:Arial,Helvetica,sans-serif;margin:0;">${esc(d.businessPhone)}</p>` : ''}`

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>Payment Reminder - ${esc(d.invoiceNumber)}</title>
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

// ─── FundiBill-branded wrapper for the CC-user notification (same pattern as
// process-recurring-invoices' buildFundiBillNotificationEmailHtml) ─────────

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

async function sendCcUserEmail(args: { to: string; subject: string; html: string }): Promise<void> {
  const smtpHost = Deno.env.get('WELCOME_EMAIL_SMTP_HOST')
  const smtpPort = Deno.env.get('WELCOME_EMAIL_SMTP_PORT')
  const smtpUser = Deno.env.get('WELCOME_EMAIL_SMTP_USER')
  const smtpPassword = Deno.env.get('WELCOME_EMAIL_SMTP_PASSWORD')
  if (!smtpHost || !smtpPort || !smtpUser || !smtpPassword) {
    console.error('send-auto-payment-reminders: missing WELCOME_EMAIL_SMTP_* secrets, skipping CC-user email')
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
      console.error('send-auto-payment-reminders: CC-user email failed', result)
    }
  } catch (err) {
    console.error('send-auto-payment-reminders: CC-user email failed', (err as Error).message)
  }
}

const DEFAULT_REMINDER_TEMPLATE =
  'Dear {clientName},\n\nThis is a friendly reminder that invoice {invoiceNumber} for R {amount} was due on {dueDate} and is still outstanding.\n\nPlease arrange payment at your earliest convenience.\n\nKind regards,\n{businessName}'

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

    const now = new Date()
    const today = now.toISOString().slice(0, 10)

    // sent_from_app gates this to invoices actually emailed from FundiBill —
    // never for drafts or ones only ever downloaded/shared via WhatsApp.
    const { data: candidates, error: invError } = await supabase
      .from('invoices')
      .select('*')
      .eq('sent_from_app', true)
      .neq('status', 'paid')
      .lte('due_date', today)

    if (invError) throw new Error(`invoices query failed: ${invError.message}`)

    const results = { processed: 0, sent: 0, skipped: 0, errors: [] as string[] }

    for (const invoice of (candidates ?? [])) {
      results.processed++

      try {
        // ── Schedule check ───────────────────────────────────────────────────
        const count = invoice.auto_reminder_count || 0
        let due = false
        if (count === 0) {
          due = true // eligibility query already guarantees due_date <= today
        } else if (count === 1) {
          due = daysBetween(new Date(invoice.due_date + 'T00:00:00'), now) >= 7
        } else {
          due = !!invoice.auto_reminder_last_sent_at &&
            daysBetween(new Date(invoice.auto_reminder_last_sent_at), now) >= 3
        }
        if (!due) { results.skipped++; continue }

        // ── Global per-user gate ─────────────────────────────────────────────
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', invoice.user_id)
          .maybeSingle()

        if (!profile?.auto_reminders_enabled) { results.skipped++; continue }

        // ── Client ────────────────────────────────────────────────────────────
        const { data: client } = invoice.client_id
          ? await supabase.from('clients').select('name, company_name, email').eq('id', invoice.client_id).maybeSingle()
          : { data: null }

        const clientName = client?.company_name || client?.name || 'Valued Client'
        const clientEmail = client?.email?.trim() || ''

        if (!clientEmail) {
          results.errors.push(`${invoice.invoice_number}: client has no email address`)
          results.skipped++
          continue
        }

        // ── PDF ───────────────────────────────────────────────────────────────
        if (!appUrl) {
          results.errors.push(`${invoice.invoice_number}: VITE_APP_URL not configured`)
          continue
        }

        let pdfBase64 = ''
        let pdfFilename = `Invoice-${invoice.invoice_number}.pdf`
        try {
          const pdfResp = await fetchWithTimeout(`${appUrl}/api/generate-invoice-pdf`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ invoice_id: invoice.id, user_id: invoice.user_id }),
          }, 25_000)
          const pdfResult = await pdfResp.json().catch(() => ({}))
          if (!pdfResp.ok || !pdfResult?.success) {
            throw new Error(pdfResult?.error || 'PDF generation request failed')
          }
          pdfBase64 = pdfResult.pdf_base64
          pdfFilename = pdfResult.filename || pdfFilename
        } catch (err) {
          results.errors.push(`${invoice.invoice_number}: PDF generation failed: ${(err as Error).message}`)
          continue
        }

        // ── Email content ────────────────────────────────────────────────────
        const businessName = profile.business_name || ''
        const isPartial = invoice.status === 'partial'
        const balanceDue = Math.max(0, Number(invoice.total) - Number(invoice.amount_paid || 0))
        const amount = isPartial ? balanceDue : Number(invoice.total)

        const rawTemplate = profile.email_overdue_message && profile.email_overdue_message.trim()
          ? profile.email_overdue_message
          : DEFAULT_REMINDER_TEMPLATE
        const customMessage = fillMessageTemplate(rawTemplate, {
          clientName,
          invoiceNumber: invoice.invoice_number,
          businessName,
          amount: fmtZAR(amount).replace('R ', ''),
          dueDate: fmtDate(invoice.due_date),
        })

        const subject = `Payment Reminder - Invoice ${invoice.invoice_number} is Outstanding`
        const html = buildReminderEmailHtml({
          businessName,
          businessEmail: profile.email || profile.smtp_user || '',
          businessPhone: profile.phone || '',
          logoUrl: profile.logo_url || '',
          primaryColor: profile.primary_color || '#14b8a6',
          clientName,
          invoiceNumber: invoice.invoice_number,
          amount,
          issueDate: fmtDate(invoice.issue_date),
          dueDate: fmtDate(invoice.due_date),
          customMessage,
        })

        // ── Send ──────────────────────────────────────────────────────────────
        const sendResult = profile.email_provider === 'gmail'
          ? (profile.gmail_access_token
              ? await sendViaGmail(appUrl, {
                  userId: invoice.user_id, to: clientEmail, subject, html,
                  pdfBase64, pdfFilename, fromName: businessName || 'FundiBill',
                })
              : { ok: false as const, error: 'Gmail not connected' })
          : await sendViaSmtp(profile, { to: clientEmail, subject, html, pdfBase64, pdfFilename })

        if (!sendResult.ok) {
          console.error(`send-auto-payment-reminders: send failed for ${invoice.invoice_number}:`, sendResult.error)
          results.errors.push(`${invoice.invoice_number}: ${sendResult.error}`)
          continue // don't advance the schedule on failure — retried next run
        }

        await supabase.from('invoices').update({
          auto_reminder_count: count + 1,
          auto_reminder_last_sent_at: now.toISOString(),
        }).eq('id', invoice.id)
        results.sent++

        if (profile.email) {
          const stageLabel = count === 0 ? 'first' : count === 1 ? 'second' : `#${count + 1}`
          const ccTitle = `Payment Reminder Sent for Invoice ${invoice.invoice_number}`
          const ccBody = `
            <p style="font-size:15px;color:#0f172a;font-family:Arial,Helvetica,sans-serif;margin:0 0 16px;font-weight:600;">
              Payment reminder sent
            </p>
            <p style="font-size:14px;color:#334155;font-family:Arial,Helvetica,sans-serif;margin:0 0 20px;line-height:1.7;">
              A ${esc(stageLabel)} payment reminder for invoice <strong>${esc(invoice.invoice_number)}</strong>
              was automatically sent to <strong>${esc(clientName)}</strong> (${esc(clientEmail)}) on ${esc(fmtDate(today))}.
              This will keep repeating automatically every 3 days until the invoice is marked as paid.
            </p>
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;">
              <tr>
                <td style="padding:12px 20px;border-bottom:1px solid #e2e8f0;">
                  <span style="font-size:11px;color:#94a3b8;font-family:Arial,Helvetica,sans-serif;text-transform:uppercase;letter-spacing:0.06em;display:block;margin-bottom:3px;">Invoice Number</span>
                  <span style="font-size:16px;font-weight:700;color:#0f172a;font-family:Arial,Helvetica,sans-serif;">${esc(invoice.invoice_number)}</span>
                </td>
              </tr>
              <tr>
                <td style="padding:12px 20px;">
                  <span style="font-size:11px;color:#94a3b8;font-family:Arial,Helvetica,sans-serif;text-transform:uppercase;letter-spacing:0.06em;display:block;margin-bottom:3px;">Amount Due</span>
                  <span style="font-size:16px;font-weight:700;color:#14b8a6;font-family:Arial,Helvetica,sans-serif;">${esc(fmtZAR(amount))}</span>
                </td>
              </tr>
            </table>`
          await sendCcUserEmail({
            to: profile.email,
            subject: `FundiBill - Payment Reminder Sent for Invoice ${invoice.invoice_number}`,
            html: buildFundiBillNotificationEmailHtml(ccTitle, ccBody),
          })
        }

      } catch (err) {
        console.error(`send-auto-payment-reminders: invoice ${invoice.id} failed:`, err)
        results.errors.push(`invoice ${invoice.id}: ${(err as Error).message}`)
      }
    }

    return new Response(JSON.stringify(results), {
      status: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('send-auto-payment-reminders fatal error:', err)
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
