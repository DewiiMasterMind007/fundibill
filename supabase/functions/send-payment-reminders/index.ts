/**
 * supabase/functions/send-payment-reminders/index.ts
 *
 * Sends payment reminder emails for overdue invoices where the user
 * has opted in to automatic reminders.
 *
 * Deploy:
 *   supabase functions deploy send-payment-reminders --no-verify-jwt
 *
 * Schedule (run in Supabase SQL Editor — pg_cron + pg_net required):
 *
 *   SELECT cron.schedule(
 *     'send-payment-reminders',
 *     '0 7 * * *',
 *     $$ select net.http_post(
 *       url     := 'https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/send-payment-reminders',
 *       headers := jsonb_build_object('Authorization', 'Bearer <YOUR_SERVICE_ROLE_KEY>'),
 *       body    := '{}'::jsonb
 *     ) $$
 *   );
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { SMTPClient }   from 'https://deno.land/x/denomailer@1.6.0/mod.ts'

// ─── CORS headers (required for Supabase Edge Functions) ──────────────────────

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
}

function fmtZAR(n: unknown): string {
  const num = Number(n) || 0
  return 'R ' + new Intl.NumberFormat('en-ZA', {
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

// ─── Email template ───────────────────────────────────────────────────────────

interface ReminderEmailData {
  businessName:  string
  businessEmail: string
  primaryColor:  string
  clientName:    string
  invoiceNumber: string
  total:         number
  issueDate:     string
  dueDate:       string
}

function buildReminderHtml(d: ReminderEmailData): string {
  const safeColor = esc(d.primaryColor || '#14b8a6')
  const safeName  = esc(d.businessName  || 'FundiBill')

  const headerInner = `<span style="color:#ffffff;font-size:22px;font-weight:700;font-family:Arial,Helvetica,sans-serif;">${safeName}</span>`

  const bodyHtml = `
    <p style="font-size:15px;color:#0f172a;font-family:Arial,Helvetica,sans-serif;margin:0 0 20px;font-weight:600;">
      Dear ${esc(d.clientName)},
    </p>
    <p style="font-size:14px;color:#334155;font-family:Arial,Helvetica,sans-serif;margin:0 0 20px;line-height:1.7;">
      This is a friendly reminder that invoice
      <strong style="color:#0f172a;">${esc(d.invoiceNumber)}</strong>
      for <strong style="color:#0f172a;">${esc(fmtZAR(d.total))}</strong>
      issued on <strong style="color:#0f172a;">${esc(fmtDate(d.issueDate))}</strong>
      is still outstanding.
    </p>

    <!-- Summary box -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin:0 0 24px;">
      <tr>
        <td style="padding:12px 20px;border-bottom:1px solid #e2e8f0;">
          <span style="font-size:11px;color:#94a3b8;font-family:Arial,Helvetica,sans-serif;text-transform:uppercase;letter-spacing:0.06em;display:block;margin-bottom:3px;">Due Date</span>
          <span style="font-size:15px;font-weight:700;color:#ef4444;font-family:Arial,Helvetica,sans-serif;">${esc(fmtDate(d.dueDate))}</span>
        </td>
      </tr>
      <tr>
        <td style="padding:12px 20px;border-bottom:1px solid #e2e8f0;">
          <span style="font-size:11px;color:#94a3b8;font-family:Arial,Helvetica,sans-serif;text-transform:uppercase;letter-spacing:0.06em;display:block;margin-bottom:3px;">Invoice Number</span>
          <span style="font-size:15px;font-weight:700;color:#0f172a;font-family:Arial,Helvetica,sans-serif;">${esc(d.invoiceNumber)}</span>
        </td>
      </tr>
      <tr>
        <td style="padding:12px 20px;">
          <span style="font-size:11px;color:#94a3b8;font-family:Arial,Helvetica,sans-serif;text-transform:uppercase;letter-spacing:0.06em;display:block;margin-bottom:3px;">Amount Due</span>
          <span style="font-size:16px;font-weight:700;color:${safeColor};font-family:Arial,Helvetica,sans-serif;">${esc(fmtZAR(d.total))}</span>
        </td>
      </tr>
    </table>

    <p style="font-size:14px;color:#334155;font-family:Arial,Helvetica,sans-serif;margin:0 0 20px;line-height:1.7;">
      If you have already made payment, please disregard this email or send your proof
      of payment to
      <a href="mailto:${esc(d.businessEmail)}" style="color:${safeColor};text-decoration:none;">${esc(d.businessEmail)}</a>.
    </p>
    <p style="font-size:14px;color:#334155;font-family:Arial,Helvetica,sans-serif;margin:0 0 20px;line-height:1.7;">
      Thank you for your prompt attention.
    </p>
    <p style="font-size:13px;color:#64748b;font-family:Arial,Helvetica,sans-serif;margin:20px 0 4px;">Kind regards,</p>
    <p style="font-size:15px;font-weight:700;color:#0f172a;font-family:Arial,Helvetica,sans-serif;margin:0;">${safeName}</p>`

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>Payment Reminder — ${esc(d.invoiceNumber)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">

  <!--[if mso]><table role="presentation" width="100%"><tr><td><![endif]-->
  <table width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background-color:#f1f5f9;min-width:100%;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table width="600" cellpadding="0" cellspacing="0" border="0"
               style="max-width:600px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background-color:${safeColor};border-radius:10px 10px 0 0;padding:24px 32px;">
              ${headerInner}
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background-color:#ffffff;padding:32px 32px 28px;
                        border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
              ${bodyHtml}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f8fafc;border:1px solid #e2e8f0;border-top:none;
                        border-radius:0 0 10px 10px;padding:18px 32px;text-align:center;">
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

function buildReminderText(d: ReminderEmailData): string {
  return [
    `Dear ${d.clientName},`,
    '',
    `This is a friendly reminder that invoice ${d.invoiceNumber} for ${fmtZAR(d.total)} issued on ${fmtDate(d.issueDate)} is still outstanding.`,
    '',
    `Due Date:       ${fmtDate(d.dueDate)}`,
    `Amount Due:     ${fmtZAR(d.total)}`,
    `Invoice Number: ${d.invoiceNumber}`,
    '',
    `If you have already made payment, please disregard this email or send your proof of payment to ${d.businessEmail}.`,
    '',
    'Thank you for your prompt attention.',
    '',
    'Kind regards,',
    d.businessName,
    '',
    '---',
    'Sent by FundiBill - SA Built Invoicing Software | fundibill.online',
  ].join('\n')
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  try {
    // Service-role client bypasses RLS so we can read all users' data
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const today = new Date().toISOString().slice(0, 10)

    // ── Fetch all eligible invoices ──────────────────────────────────────────
    const { data: invoices, error: invError } = await supabase
      .from('invoices')
      .select('*')
      .eq('sent_from_app',    true)
      .eq('reminder_opted_in', true)
      .neq('status', 'paid')
      .neq('status', 'draft')
      .lte('due_date', today)

    if (invError) throw new Error(`Invoice query failed: ${invError.message}`)

    const results = {
      processed: 0,
      sent:      0,
      skipped:   0,
      errors:    [] as string[],
    }

    for (const invoice of (invoices ?? [])) {
      results.processed++

      // ── Fetch user profile ─────────────────────────────────────────────────
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', invoice.user_id)
        .maybeSingle()

      if (!profile) {
        results.errors.push(`${invoice.invoice_number}: profile not found`)
        results.skipped++
        continue
      }

      // ── Skip if user has turned reminders off ──────────────────────────────
      if (!profile.reminders_enabled) {
        results.skipped++
        continue
      }

      // ── Skip if SMTP is not configured ────────────────────────────────────
      if (!profile.smtp_host || !profile.smtp_user || !profile.smtp_password) {
        results.errors.push(`${invoice.invoice_number}: SMTP not configured for user`)
        results.skipped++
        continue
      }

      // ── Interval check — has enough time passed since last reminder? ───────
      const intervalDays = Number(profile.reminder_interval_days) || 3

      if (invoice.reminder_sent_at) {
        const lastSent   = new Date(invoice.reminder_sent_at).getTime()
        const daysSince  = (Date.now() - lastSent) / 86_400_000
        if (daysSince < intervalDays) {
          results.skipped++
          continue
        }
      }
      // If reminder_sent_at is null this is the first reminder — always send.

      // ── Fetch client details ───────────────────────────────────────────────
      const { data: client } = await supabase
        .from('clients')
        .select('name, company_name, email')
        .eq('id', invoice.client_id)
        .maybeSingle()

      const clientName  = client?.company_name || client?.name || 'Valued Client'
      const clientEmail = client?.email?.trim() || ''

      if (!clientEmail) {
        results.errors.push(`${invoice.invoice_number}: client has no email address`)
        results.skipped++
        continue
      }

      // ── Build email content ────────────────────────────────────────────────
      const emailData: ReminderEmailData = {
        businessName:  profile.business_name || '',
        businessEmail: profile.email || profile.smtp_user || '',
        primaryColor:  profile.primary_color || '#14b8a6',
        clientName,
        invoiceNumber: invoice.invoice_number,
        total:         invoice.total,
        issueDate:     invoice.issue_date,
        dueDate:       invoice.due_date,
      }

      const subject  = `Payment Reminder — Invoice ${invoice.invoice_number} is Outstanding`
      const htmlBody = buildReminderHtml(emailData)
      const textBody = buildReminderText(emailData)

      // ── Send via user's SMTP settings ─────────────────────────────────────
      try {
        const smtpPort   = parseInt(profile.smtp_port || '587', 10) || 587
        const useTLS     = smtpPort === 465
        const fromName   = profile.smtp_from_name || profile.business_name || 'FundiBill'
        const fromAddr   = profile.smtp_user

        const client_smtp = new SMTPClient({
          connection: {
            hostname: profile.smtp_host,
            port:     smtpPort,
            tls:      useTLS,
            auth: {
              username: profile.smtp_user,
              password: profile.smtp_password,
            },
          },
        })

        await client_smtp.send({
          from:    `${fromName} <${fromAddr}>`,
          to:      clientEmail,
          subject,
          content: textBody,
          html:    htmlBody,
        })

        await client_smtp.close()

        // ── Update reminder_sent_at on the invoice ─────────────────────────
        const { error: updateError } = await supabase
          .from('invoices')
          .update({ reminder_sent_at: new Date().toISOString() })
          .eq('id', invoice.id)

        if (updateError) {
          results.errors.push(`${invoice.invoice_number}: sent but failed to update reminder_sent_at — ${updateError.message}`)
        }

        results.sent++
        console.log(`[reminders] Sent reminder for invoice ${invoice.invoice_number} to ${clientEmail}`)

      } catch (sendErr) {
        const msg = sendErr instanceof Error ? sendErr.message : String(sendErr)
        results.errors.push(`${invoice.invoice_number}: SMTP error — ${msg}`)
        results.skipped++
        console.error(`[reminders] Failed to send ${invoice.invoice_number}:`, msg)
      }
    }

    console.log('[reminders] Run complete:', results)

    return new Response(JSON.stringify({ ok: true, ...results }), {
      status:  200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[reminders] Fatal error:', message)
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status:  500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
