// Shared email-sending router used by every send flow (SendEmailModal,
// ReminderModal, MarkAsPaidEmailModal, Settings test email).
//
// Routes to Gmail (via /api/send-gmail, Phase 4) when the user's profile has
// email_provider === 'gmail'; otherwise falls straight through to the
// existing, untouched SMTP path in src/lib/sendEmail.js (Electron IPC or the
// PHP relay, exactly as before).

import { sendEmail as sendViaSmtpOrElectron } from '../lib/sendEmail'

/** Convert an ArrayBuffer (from buildPdfBuffer) to a base64 string in chunks. */
export function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

/** Convert a base64 string back to an ArrayBuffer — needed so the SMTP path
 *  (which expects the original ArrayBuffer shape) is left completely unchanged. */
function base64ToArrayBuffer(base64) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

/**
 * sendEmail — provider-aware send. Throws on failure, resolves with the
 * result object on success.
 *
 * @param {object} opts
 *   supabase      Supabase client instance (unused for gmail; kept for a
 *                 consistent signature and potential future use)
 *   userId        Current user's Supabase auth ID
 *   profile       Current user's profile row (from AppDataContext/Settings)
 *   to            Recipient email address
 *   subject       Email subject line
 *   html          HTML email body
 *   pdfBase64     Base64 PDF string, or null/undefined if no attachment
 *   pdfFilename   PDF filename, or null/undefined if no attachment
 */
export async function sendEmail({ supabase, userId, profile, to, subject, html, pdfBase64, pdfFilename }) {
  const provider = profile?.email_provider

  if (provider === 'gmail') {
    if (!profile?.gmail_access_token) {
      throw new Error('Gmail not connected. Please connect Gmail in Settings.')
    }
    if (profile?.gmail_token_expiry && new Date(profile.gmail_token_expiry) <= new Date()) {
      // Not fatal — /api/send-gmail.js refreshes expired tokens server-side.
      console.warn('[sendEmail] Gmail access token appears expired; server will attempt to refresh.')
    }

    const response = await fetch('/api/send-gmail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id:      userId,
        to,
        subject,
        html,
        pdf_base64:   pdfBase64 || null,
        pdf_filename: pdfFilename || null,
        from_name:    profile?.business_name || 'FundiBill',
      }),
    })

    const result = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(result?.error || 'Failed to send email via Gmail.')
    }
    return result
  }

  // SMTP (or any other/unset provider) — the existing Electron IPC / PHP
  // relay path in src/lib/sendEmail.js, completely unchanged.
  const result = await sendViaSmtpOrElectron({
    to,
    subject,
    message:       html,
    html,
    smtpHost:      profile?.smtp_host      || '',
    smtpPort:      parseInt(profile?.smtp_port || '587', 10) || 587,
    smtpUser:      profile?.smtp_user      || '',
    smtpPassword:  profile?.smtp_password  || '',
    smtpFromName:  profile?.smtp_from_name || profile?.business_name || '',
    smtpFromEmail: profile?.smtp_user      || '',
    pdfBuffer:     pdfBase64 ? base64ToArrayBuffer(pdfBase64) : undefined,
    fileName:      pdfFilename || undefined,
    emailProvider: 'smtp',
  })

  if (result?.success === false) {
    throw new Error(result.error || 'Failed to send email.')
  }
  return result
}
