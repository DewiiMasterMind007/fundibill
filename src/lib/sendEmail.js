// Convert an ArrayBuffer to a base64 string in chunks (avoids call-stack
// limits from spreading large byte arrays into String.fromCharCode).
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

// Gmail OAuth is not wired up to actually send yet (Phase 4 — /api/send-gmail.js).
// This guard only stops a stale/expired Gmail connection from silently falling
// through to the SMTP/relay path below with the wrong (or missing) credentials.
export function checkGmailProviderReady(payload) {
  if (payload.emailProvider !== 'gmail') return { ok: true }

  const expiry = payload.gmailTokenExpiry ? new Date(payload.gmailTokenExpiry) : null
  const expired = !payload.gmailAccessToken || !expiry || isNaN(expiry.getTime()) || expiry <= new Date()

  if (expired) {
    return { ok: false, error: 'Your Gmail connection has expired. Please reconnect Gmail in Settings.' }
  }
  return { ok: true }
}

export async function sendEmail(payload) {
  const gmailCheck = checkGmailProviderReady(payload)
  if (!gmailCheck.ok) {
    return { success: false, error: gmailCheck.error }
  }

  const isElectron = window?.electronAPI?.sendEmail !== undefined

  if (isElectron) {
    return await window.electronAPI.sendEmail(payload)
  }

  const response = await fetch('https://api.fundibill.online/send-reminder.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      smtp_host:     payload.smtpHost,
      smtp_port:     payload.smtpPort,
      smtp_user:     payload.smtpUser,
      smtp_password: payload.smtpPassword,
      from_name:     payload.smtpFromName,
      to_email:      payload.to,
      subject:       payload.subject,
      html_body:     payload.html,
      text_body:     payload.text || payload.message,
      pdf_base64:    payload.pdfBuffer ? arrayBufferToBase64(payload.pdfBuffer) : null,
      pdf_filename:  payload.fileName || null,
    }),
  })

  const result = await response.json()
  if (result.success) {
    return { success: true }
  } else {
    return { success: false, error: result.error }
  }
}
