// supabase/functions/send-welcome-email/index.ts
//
// Triggered by a Supabase Database Webhook on auth.users (UPDATE), which
// fires when email_confirmed_at transitions from null to a timestamp —
// i.e. the user has just confirmed their email address for the first time.
// See the webhook setup instructions provided alongside this function for
// exact configuration steps.
//
// Deploy: supabase functions deploy send-welcome-email
// (Do NOT deploy with --no-verify-jwt. The webhook is configured to send
// the project's service role key as a Bearer token, which the Edge
// Functions gateway validates before this code ever runs — see the setup
// instructions for how to configure that header.)
//
// NOTE: there is no existing "notify-new-signup" function or webhook-secret
// verification pattern anywhere else in this codebase to mirror — the two
// other deployed functions (cancel-subscription, send-payment-reminders)
// use JWT-gateway auth and a service-role Supabase client respectively.
// This function follows the same service-role-client pattern as
// send-payment-reminders/index.ts.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// ─── Welcome email HTML ─────────────────────────────────────────────────────
// Inlined directly (not imported from src/lib/emailTemplates.js — Edge
// Functions run on Deno and can't import the React-app's Vite-bundled
// source tree). Keep this in sync with generateWelcomeEmail() in
// src/lib/emailTemplates.js if the design changes.
//
// All URLs below are kept in sync by hand with generateWelcomeEmail() in
// src/lib/emailTemplates.js — update both if any of them change.

const LOGO_URL = 'https://www.fundibill.online/wp-content/uploads/2026/06/FundiBill-Logo.png'
const LOGO_URL_WHITE = 'https://www.fundibill.online/wp-content/uploads/2026/06/FundiAI-Logo-1.png'
const HERO_IMAGE_URL = 'https://www.fundibill.online/wp-content/uploads/2026/07/FundiBill-Welcome-Email-Header.png'
const GOOGLE_REVIEW_URL = 'https://g.page/r/CW6EkPEWdnCREBM/review'
const FACEBOOK_URL = 'https://www.facebook.com/fundibill'
const INSTAGRAM_URL = 'https://www.instagram.com/fundibillza'
const APP_URL = 'https://app.fundibill.online'

const FONT = 'Arial,Helvetica,sans-serif'
const BODY_TEXT = `font-size:16px;color:#444444;font-family:${FONT};line-height:1.6;margin:0 0 16px;`
const STEP_TITLE = `font-size:16px;color:#1a1a2e;font-family:${FONT};font-weight:700;margin:0 0 6px;`
const STEP_BODY = `font-size:15px;color:#444444;font-family:${FONT};line-height:1.6;margin:0;`

function step(number: number, title: string, bodyHtml: string) {
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
          <p style="${STEP_TITLE}">${title}</p>
          ${bodyHtml}
        </td>
      </tr>`
}

function buildWelcomeEmailHtml(): string {
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

// ─── Handler ─────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const payload = await req.json()
    const record = payload?.record
    const oldRecord = payload?.old_record

    // Step 1 & 2: only fire on the null -> timestamp transition, never on
    // repeat updates to an already-confirmed user (e.g. password changes).
    const confirmedNow = !!record?.email_confirmed_at
    const confirmedBefore = !!oldRecord?.email_confirmed_at
    if (!confirmedNow || confirmedBefore) {
      return json({ success: true, skipped: true, reason: 'not_a_fresh_confirmation' })
    }

    // Step 3 & 4
    const userEmail = record.email as string | undefined
    const userId = record.id as string | undefined
    if (!userEmail || !userId) {
      throw new Error('Webhook payload missing record.email or record.id')
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Step 5: dedup guard — never send twice for the same user.
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('welcome_email_sent')
      .eq('id', userId)
      .maybeSingle()
    if (profileError) throw profileError
    if (profile?.welcome_email_sent) {
      return json({ success: true, skipped: true, reason: 'already_sent' })
    }

    // Step 6
    const html = buildWelcomeEmailHtml()

    // Step 7 — field names match the exact contract used by
    // src/lib/sendEmail.js elsewhere in this codebase for the same PHP
    // relay endpoint. send-reminder.php rejected the request with
    // "Missing required fields" when smtp_host/smtp_port/smtp_user/
    // smtp_password were omitted (confirmed via net._http_response), so —
    // unlike a per-user send — this system email supplies FundiBill's own
    // info@fundibill.online mailbox credentials, read from Supabase secrets
    // (never hardcoded). Set them with:
    //   supabase secrets set WELCOME_EMAIL_SMTP_HOST=... WELCOME_EMAIL_SMTP_PORT=...
    //     WELCOME_EMAIL_SMTP_USER=... WELCOME_EMAIL_SMTP_PASSWORD=...
    const smtpHost = Deno.env.get('WELCOME_EMAIL_SMTP_HOST')
    const smtpPort = Deno.env.get('WELCOME_EMAIL_SMTP_PORT')
    const smtpUser = Deno.env.get('WELCOME_EMAIL_SMTP_USER')
    const smtpPassword = Deno.env.get('WELCOME_EMAIL_SMTP_PASSWORD')
    if (!smtpHost || !smtpPort || !smtpUser || !smtpPassword) {
      throw new Error('Missing WELCOME_EMAIL_SMTP_* secrets — run `supabase secrets set` for HOST/PORT/USER/PASSWORD')
    }

    const sendResponse = await fetch('https://api.fundibill.online/send-reminder.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to_email: userEmail,
        subject: 'Welcome to FundiBill — Your Free Trial Has Started! 🎉',
        html_body: html,
        from_name: 'The FundiBill Team',
        smtp_host: smtpHost,
        smtp_port: smtpPort,
        smtp_user: smtpUser,
        smtp_password: smtpPassword,
      }),
    })

    const sendResult = await sendResponse.json().catch(() => ({}))
    if (!sendResponse.ok || sendResult?.success === false) {
      throw new Error(sendResult?.error || 'send-reminder.php request failed')
    }

    // Step 8
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ welcome_email_sent: true })
      .eq('id', userId)
    if (updateError) throw updateError

    // Step 9
    return json({ success: true })
  } catch (err) {
    // Step 10
    console.error('[send-welcome-email] error:', err)
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
