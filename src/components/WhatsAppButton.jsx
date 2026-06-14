// ── WhatsApp send button ──────────────────────────────────────────────────────
//
// Green "Send via WhatsApp" button used on the Invoice and Estimate detail
// screens. Disabled (with a tooltip) when the client has no phone number.
//
// Variants:
//   - default: full button with label, used in desktop header / mobile bottom bar
//   - icon:     compact icon-only button, used in the mobile header icon row

const WHATSAPP_GREEN = '#25D366'

function WhatsAppIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.85.5 3.58 1.46 5.08L2 22l5.2-1.36a9.9 9.9 0 0 0 4.84 1.24h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm0 1.67c2.21 0 4.29.86 5.85 2.42a8.2 8.2 0 0 1 2.42 5.82c0 4.55-3.71 8.25-8.27 8.25a8.3 8.3 0 0 1-4.21-1.15l-.3-.18-3.09.81.83-3.01-.2-.31a8.18 8.18 0 0 1-1.26-4.37c0-4.56 3.71-8.28 8.23-8.28zm-3.94 4.7c-.16 0-.43.06-.61.27-.18.21-.7.69-.7 1.67 0 .98.71 1.93.81 2.06.1.14 1.41 2.19 3.47 3.05 1.71.71 2.31.66 2.71.61.4-.05 1.28-.52 1.46-1.03.18-.51.18-.94.13-1.03-.05-.1-.18-.16-.38-.27-.2-.1-1.28-.63-1.48-.7-.2-.07-.34-.1-.49.1-.14.21-.56.7-.69.84-.13.14-.25.16-.46.06-.21-.1-.88-.33-1.68-1.04-.62-.55-1.04-1.23-1.16-1.44-.12-.21-.01-.32.1-.43.1-.1.23-.27.35-.4.12-.14.16-.24.24-.4.08-.16.04-.3-.03-.43-.07-.13-.62-1.5-.85-2.04-.18-.43-.36-.4-.51-.41z"/>
    </svg>
  )
}

export function WhatsAppButton({ phone, loading, onClick, icon = false, mobile = false }) {
  const hasPhone = !!(phone && phone.trim())
  const disabled = !hasPhone || loading
  const title = hasPhone ? 'Send via WhatsApp' : 'Add a phone number to this client to send via WhatsApp'

  const spinner = (
    <span style={{
      display: 'inline-block', width: 13, height: 13, borderRadius: '50%',
      border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff',
      animation: 'waSpin 0.7s linear infinite',
    }} />
  )

  const styleEl = (
    <style>{`@keyframes waSpin { to { transform: rotate(360deg); } }`}</style>
  )

  if (icon) {
    return (
      <>
        {styleEl}
        <button
          onClick={onClick}
          disabled={disabled}
          title={title}
          style={{
            padding: '7px', borderRadius: 7, border: '1px solid transparent',
            background: disabled ? '#cbd5e1' : WHATSAPP_GREEN,
            color: '#fff', cursor: disabled ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: !hasPhone ? 0.6 : 1,
          }}
        >
          {loading ? spinner : <WhatsAppIcon size={15} />}
        </button>
      </>
    )
  }

  return (
    <>
      {styleEl}
      <button
        onClick={onClick}
        disabled={disabled}
        title={title}
        style={{
          padding: mobile ? '11px' : '9px 14px',
          borderRadius: 8, border: 'none',
          background: disabled ? '#cbd5e1' : WHATSAPP_GREEN,
          color: '#fff', fontWeight: 600, fontSize: mobile ? 14 : 13,
          cursor: disabled ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          fontFamily: 'inherit', width: mobile ? '100%' : undefined,
          flex: mobile ? 1 : undefined,
          opacity: !hasPhone ? 0.6 : 1,
        }}
      >
        {loading ? spinner : <WhatsAppIcon size={mobile ? 16 : 14} />}
        {mobile ? 'WhatsApp' : 'Send via WhatsApp'}
      </button>
    </>
  )
}
