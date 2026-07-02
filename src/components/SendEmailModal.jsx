import React, { useState, useEffect } from 'react'
import { generateInvoiceEmail, generateEstimateEmail } from '../lib/emailTemplates'
import { supabase } from '../lib/supabase'
import { sendEmail, arrayBufferToBase64 } from '../utils/sendEmail'
import { buildPdfBuffer } from '../lib/pdfBuffer'

// ── Helpers ───────────────────────────────────────────────────────────────────

function smtpFromSettings(settings) {
  return {
    host:      settings?.smtp_host      || '',
    port:      settings?.smtp_port      || '587',
    user:      settings?.smtp_user      || '',
    password:  settings?.smtp_password  || '',
    from_name: settings?.smtp_from_name || settings?.business_name || '',
  }
}

// ── Modal ─────────────────────────────────────────────────────────────────────

/**
 * SendEmailModal — send an invoice or estimate as a PDF attachment.
 *
 * Props:
 *   isOpen             boolean
 *   data               Full invoice/estimate object with items[]
 *   settings           Business settings (raw Supabase profile row)
 *   docType            "INVOICE" | "ESTIMATE"
 *   clientEmail        Pre-filled To address (from the selected client)
 *   configuredMessage  Optional — the user's configured email_invoice_message /
 *                       email_quote_message template, with placeholders already
 *                       filled in by the caller. Used as the seed body instead of
 *                       the hardcoded default when provided and non-empty.
 *   onClose            () => void
 */
export function SendEmailModal({ isOpen, data, settings, docType, clientEmail, configuredMessage, onClose, onSent }) {
  const isInvoice   = docType === 'INVOICE'
  const docNumber   = isInvoice ? data?.invoice_number : data?.estimate_number
  const docLabel    = isInvoice ? 'Invoice' : 'Estimate'
  const businessName = settings?.business_name || settings?.smtp_from_name || 'us'

  const defaultSubject = `${docLabel} ${docNumber || ''} from ${businessName}`.trim()
  const hardcodedBody   = isInvoice
    ? `Hi,\n\nPlease find your invoice ${docNumber || ''} attached.\n\nIf you have any questions, feel free to reach out.\n\nThank you for your business!`
    : `Hi,\n\nPlease find your estimate ${docNumber || ''} attached.\n\nLet us know if you'd like to discuss any of the details.\n\nThank you!`
  const defaultBody    = configuredMessage && configuredMessage.trim() ? configuredMessage : hardcodedBody

  const [to,      setTo]      = useState(clientEmail || '')
  const [subject, setSubject] = useState(defaultSubject)
  const [body,    setBody]    = useState(defaultBody)
  const [sending, setSending] = useState(false)
  const [sent,    setSent]    = useState(false)
  const [error,   setError]   = useState('')

  // Re-initialise fields whenever the modal opens with new data
  useEffect(() => {
    if (isOpen) {
      setTo(clientEmail || '')
      setSubject(defaultSubject)
      setBody(defaultBody)
      setSending(false)
      setSent(false)
      setError('')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, docNumber, clientEmail, configuredMessage])

  // Escape key closes modal
  useEffect(() => {
    if (!isOpen) return
    const fn = (e) => { if (e.key === 'Escape' && !sending) onClose() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [isOpen, sending, onClose])

  if (!isOpen) return null

  const smtp = smtpFromSettings(settings)
  const smtpMissing = !smtp.host || !smtp.user || !smtp.password

  const isGmailProvider = settings?.email_provider === 'gmail'
  const gmailNotConnected = isGmailProvider && !settings?.gmail_access_token
  const sendBlocked = isGmailProvider ? gmailNotConnected : smtpMissing

  async function handleSend() {
    if (!to.trim()) { setError('Recipient email is required.'); return }
    if (gmailNotConnected) { setError('Gmail not connected. Please connect Gmail in Settings.'); return }
    if (!isGmailProvider && smtpMissing) {
      setError('SMTP is not configured. Go to Settings → Email Settings.')
      return
    }

    setSending(true)
    setError('')

    try {
      const fileName = isInvoice
        ? `Invoice-${docNumber || 'draft'}.pdf`
        : `Estimate-${docNumber || 'draft'}.pdf`

      // Profile fields fed into the template
      const templateData = {
        businessName:  settings?.business_name  || '',
        businessEmail: settings?.email          || smtp.user || '',
        businessPhone: settings?.phone          || '',
        logoUrl:       settings?.logo_url       || settings?.logo_path || '',
        primaryColor:  settings?.primary_color  || '#14b8a6',
        clientName:    data?.client_name        || '',
        amount:        data?.total              ?? 0,
        customMessage: body.trim(),
      }
      console.log('[SendEmailModal] template input:', {
        ...templateData,
        logoUrl: templateData.logoUrl
          ? (templateData.logoUrl.startsWith('data:') ? '[base64 data url]' : templateData.logoUrl)
          : '(none)',
      })

      // Build PDF buffer and HTML email body in parallel
      const [pdfBuffer, html] = await Promise.all([
        buildPdfBuffer(data, settings, docType),
        Promise.resolve(
          isInvoice
            ? generateInvoiceEmail({
                ...templateData,
                documentNumber: data?.invoice_number || '',
                dueDate:        data?.due_date       || '',
              })
            : generateEstimateEmail({
                ...templateData,
                documentNumber: data?.estimate_number || '',
                expiryDate:     data?.expiry_date     || '',
              })
        ),
      ])

      console.log('[SendEmailModal] html generated:', {
        type:    typeof html,
        length:  html?.length,
        isEmpty: !html,
        preview: html?.slice(0, 80),
      })

      const { data: { user: authUser } } = await supabase.auth.getUser()

      await sendEmail({
        supabase,
        userId:      authUser?.id,
        profile:     settings,
        to:          to.trim(),
        subject:     subject.trim(),
        html,
        pdfBase64:   pdfBuffer ? arrayBufferToBase64(pdfBuffer) : null,
        pdfFilename: fileName,
      })

      setSent(true)
      // Notify parent (e.g. to auto-dismiss a recurring-invoice notification banner)
      onSent?.()
    } catch (e) {
      setError(e.message || 'Failed to send email.')
    } finally {
      setSending(false)
    }
  }

  // ── Styles ──────────────────────────────────────────────────────────────────
  const INPUT = {
    width:        '100%',
    padding:      '9px 12px',
    borderRadius: 8,
    border:       '1.5px solid #e2e8f0',
    background:   '#f8fafc',
    color:        '#0f172a',
    fontSize:     14,
    outline:      'none',
    boxSizing:    'border-box',
    fontFamily:   'inherit',
  }

  return (
    <div
      style={{
        position:   'fixed', inset: 0, zIndex: 8000,
        background: 'rgba(15,23,42,0.55)',
        display:    'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onMouseDown={e => { if (e.target === e.currentTarget && !sending) onClose() }}
    >
      <div style={{
        background:   '#fff',
        borderRadius: 16,
        width:        520,
        maxWidth:     '95vw',
        boxShadow:    '0 24px 64px rgba(0,0,0,0.22)',
        overflow:     'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding:      '18px 24px',
          borderBottom: '1px solid #f1f5f9',
          display:      'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#14b8a6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
              <polyline points="22,6 12,13 2,6"/>
            </svg>
            <span style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
              Send {docLabel}
            </span>
          </div>
          <button
            onClick={onClose}
            disabled={sending}
            style={{ background: 'none', border: 'none', cursor: sending ? 'not-allowed' : 'pointer', color: '#94a3b8', fontSize: 20, lineHeight: 1, padding: '0 2px' }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '24px 24px 20px' }}>
          {sendBlocked && !sent && (
            <div style={{
              background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8,
              padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#92400e',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {isGmailProvider
                ? <>Gmail not connected. Go to <strong style={{ margin: '0 3px' }}>Settings → Email Settings</strong> to connect it.</>
                : <>SMTP not configured. Go to <strong style={{ margin: '0 3px' }}>Settings → Email Settings</strong> first.</>}
            </div>
          )}

          {sent ? (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{
                width: 56, height: 56, borderRadius: '50%', background: '#dcfce7',
                display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px',
              }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>Email sent!</div>
              <div style={{ fontSize: 14, color: '#64748b' }}>{docLabel} sent to <strong>{to}</strong></div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>To</label>
                <input
                  type="email"
                  value={to}
                  onChange={e => setTo(e.target.value)}
                  placeholder="client@example.com"
                  style={INPUT}
                  disabled={sending}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Subject</label>
                <input
                  type="text"
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  style={INPUT}
                  disabled={sending}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Message</label>
                <textarea
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  rows={6}
                  style={{ ...INPUT, resize: 'vertical', lineHeight: 1.6 }}
                  disabled={sending}
                />
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 5 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                PDF will be attached automatically.
              </div>
              {error && (
                <div style={{ fontSize: 13, color: '#dc2626', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 7, padding: '8px 12px' }}>
                  {error}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding:      '14px 24px 20px',
          borderTop:    '1px solid #f1f5f9',
          display:      'flex', justifyContent: 'flex-end', gap: 10,
        }}>
          {sent ? (
            <button
              onClick={onClose}
              style={{ padding: '9px 22px', borderRadius: 8, border: 'none', background: '#14b8a6', color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
            >
              Done
            </button>
          ) : (
            <>
              <button
                onClick={onClose}
                disabled={sending}
                style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 600, fontSize: 14, cursor: sending ? 'not-allowed' : 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={sending || sendBlocked}
                style={{
                  padding: '9px 22px', borderRadius: 8, border: 'none',
                  background: (sending || sendBlocked) ? '#94a3b8' : '#14b8a6',
                  color: '#fff', fontWeight: 600, fontSize: 14,
                  cursor: (sending || sendBlocked) ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: 7,
                }}
              >
                {sending ? (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: 'emailSpin 0.8s linear infinite' }}>
                      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                    </svg>
                    Sending…
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="22" y1="2" x2="11" y2="13"/>
                      <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                    </svg>
                    Send {docLabel}
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>

      <style>{`@keyframes emailSpin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
