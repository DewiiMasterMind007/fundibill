export async function sendEmail(payload) {
  const isElectron = window?.electronAPI?.sendEmail !== undefined

  if (isElectron) {
    return await window.electronAPI.sendEmail(payload)
  }

  const response = await fetch('https://api.fundiai.co.za/send-reminder.php', {
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
    }),
  })

  const result = await response.json()
  if (result.success) {
    return { success: true }
  } else {
    return { success: false, error: result.error }
  }
}
