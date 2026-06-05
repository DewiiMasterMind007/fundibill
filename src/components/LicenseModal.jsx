import { useState, useRef, useEffect } from 'react'

// ─── Key input formatter ──────────────────────────────────────────────────────
// Strips non-alphanumeric, uppercases, and re-inserts dashes so the input
// always shows the canonical FNDBY-XXXX-XXXX-XXXX shape.

function formatKey(raw) {
  // Keep only A-Z and 0-9, uppercase, max 17 alphanumeric chars
  const clean = raw.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 17)
  if (clean.length <= 5) return clean
  const prefix = clean.slice(0, 5)   // "FNDBY"
  const rest   = clean.slice(5)      // up to 12 chars → 3 groups of 4
  const parts  = []
  for (let i = 0; i < rest.length; i += 4) parts.push(rest.slice(i, i + 4))
  return [prefix, ...parts].join('-')
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function LockIcon() {
  return (
    <svg width="38" height="38" viewBox="0 0 24 24" fill="none"
      stroke="#14b8a6" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}

function Btn({ children, primary, onClick, disabled, style = {} }) {
  const base = {
    border:       'none',
    borderRadius: 8,
    padding:      '11px 22px',
    fontSize:     14,
    fontWeight:   600,
    cursor:       disabled ? 'not-allowed' : 'pointer',
    transition:   'opacity 0.15s, background 0.15s',
    opacity:      disabled ? 0.5 : 1,
    ...style,
  }
  const themed = primary
    ? { background: '#14b8a6', color: '#fff' }
    : { background: 'rgba(255,255,255,0.07)', color: '#e2e8f0',
        border: '1px solid rgba(255,255,255,0.12)' }
  return (
    <button style={{ ...base, ...themed }} onClick={onClick} disabled={disabled}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.opacity = '0.85' }}
      onMouseLeave={e => { if (!disabled) e.currentTarget.style.opacity = '1' }}>
      {children}
    </button>
  )
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export default function LicenseModal({ onActivate, initialShowInput = false, trialExpired = true, onDismiss }) {
  const [view,    setView]    = useState(initialShowInput ? 'input' : 'expired')
  const [key,     setKey]     = useState('')
  const [error,   setError]   = useState('')
  const [busy,    setBusy]    = useState(false)
  const [success, setSuccess] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    if (view === 'input') inputRef.current?.focus()
  }, [view])

  const handleKeyChange = (e) => {
    setKey(formatKey(e.target.value))
    setError('')
  }

  // Swallow Enter key on the input
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleActivate()
  }

  const handleActivate = async () => {
    const trimmed = key.trim()
    if (!trimmed) { setError('Please enter a license key.'); return }
    if (trimmed.length < 20) { setError('Key must be in the format FNDBY-XXXX-XXXX-XXXX.'); return }

    setBusy(true)
    setError('')
    const result = await onActivate(trimmed)
    setBusy(false)

    if (result.success) {
      setSuccess(true)
    } else {
      setError(result.error || 'Invalid license key. Please check and try again.')
    }
  }

  // ── Success screen ──────────────────────────────────────────────────────────
  if (success) {
    return (
      <Overlay>
        <Card>
          <div style={{ fontSize: 48, marginBottom: 12 }}>✓</div>
          <h2 style={headingStyle}>License Activated!</h2>
          <p style={subStyle}>
            Thank you for purchasing FundiBill Lifetime Access. Your license has been saved.
            The app will unlock now.
          </p>
        </Card>
      </Overlay>
    )
  }

  // ── Key-entry screen ────────────────────────────────────────────────────────
  if (view === 'input') {
    return (
      <Overlay>
        <Card>
          <LockIcon />
          <h2 style={{ ...headingStyle, marginTop: 12 }}>Enter License Key</h2>
          <p style={{ ...subStyle, marginBottom: 24 }}>
            Enter your <code style={codeStyle}>FNDBY-XXXX-XXXX-XXXX</code> key below.
          </p>

          <input
            ref={inputRef}
            value={key}
            onChange={handleKeyChange}
            onKeyDown={handleKeyDown}
            placeholder="FNDBY-XXXX-XXXX-XXXX"
            maxLength={20}
            spellCheck={false}
            style={{
              width:        '100%',
              background:   '#0f172a',
              border:       `1.5px solid ${error ? '#ef4444' : 'rgba(255,255,255,0.15)'}`,
              borderRadius: 8,
              color:        '#e2e8f0',
              fontSize:     20,
              fontFamily:   'ui-monospace, "Cascadia Code", Consolas, monospace',
              fontWeight:   600,
              letterSpacing: '0.12em',
              padding:      '12px 16px',
              outline:      'none',
              textAlign:    'center',
              marginBottom: 8,
              transition:   'border-color 0.15s',
            }}
          />

          {error && (
            <p style={{
              color: '#f87171', fontSize: 13, marginBottom: 16,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span>⚠</span> {error}
            </p>
          )}
          {!error && <div style={{ height: 16 + 16 }} />}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <Btn onClick={() => {
              if (!trialExpired && onDismiss) {
                onDismiss()
              } else {
                setView('expired'); setKey(''); setError('')
              }
            }}>
              ← Back
            </Btn>
            <Btn primary onClick={handleActivate} disabled={busy}>
              {busy ? 'Validating…' : 'Activate License'}
            </Btn>
          </div>

          <p style={{ marginTop: 20, fontSize: 12, color: '#475569' }}>
            Don't have a key?{' '}
            <span
              onClick={() => { /* purchase URL to be added */ }}
              style={{ color: '#14b8a6', cursor: 'pointer', textDecoration: 'underline' }}
            >
              Purchase a license
            </span>
          </p>
        </Card>
      </Overlay>
    )
  }

  // ── Trial-expired screen (default) ──────────────────────────────────────────
  return (
    <Overlay>
      <Card>
        <div style={{
          width: 72, height: 72, borderRadius: '50%',
          background: 'rgba(20,184,166,0.1)',
          border: '1.5px solid rgba(20,184,166,0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 20,
        }}>
          <LockIcon />
        </div>

        <h1 style={{ ...headingStyle, fontSize: 22 }}>
          Trial Expired
        </h1>

        <p style={subStyle}>
          Your 7-day trial has expired. Purchase a license to continue using FundiBill
          and keep all your data.
        </p>

        <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '24px 0' }} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
          <Btn primary onClick={() => setView('input')} style={{ width: '100%' }}>
            Enter License Key
          </Btn>
          <Btn
            onClick={() => { /* purchase URL to be added */ }}
            style={{ width: '100%' }}
          >
            Buy FundiBill Lifetime Access — R99
          </Btn>
        </div>

        <p style={{ marginTop: 20, fontSize: 12, color: '#334155' }}>
          Your data is safe and will be restored once you activate a license.
        </p>
      </Card>
    </Overlay>
  )
}

// ─── Layout helpers ───────────────────────────────────────────────────────────

function Overlay({ children }) {
  return (
    <div style={{
      position:       'fixed',
      inset:          0,
      zIndex:         9999,
      background:     'rgba(2, 6, 23, 0.96)',
      backdropFilter: 'blur(6px)',
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'center',
      // Block all pointer interaction with anything beneath
      pointerEvents:  'all',
    }}>
      {children}
    </div>
  )
}

function Card({ children }) {
  return (
    <div style={{
      background:   '#1e293b',
      borderRadius: 16,
      border:       '1px solid rgba(255,255,255,0.08)',
      padding:      '44px 52px',
      maxWidth:     460,
      width:        '90%',
      textAlign:    'center',
      boxShadow:    '0 32px 80px rgba(0,0,0,0.7)',
      display:      'flex',
      flexDirection:'column',
      alignItems:   'center',
    }}>
      {children}
    </div>
  )
}

const headingStyle = {
  color:        '#f1f5f9',
  fontSize:     20,
  fontWeight:   700,
  margin:       '0 0 10px',
  letterSpacing: '-0.3px',
}

const subStyle = {
  color:      '#94a3b8',
  fontSize:   14,
  lineHeight: 1.65,
  margin:     '0 0 8px',
  maxWidth:   340,
}

const codeStyle = {
  background:  'rgba(255,255,255,0.08)',
  borderRadius: 4,
  padding:     '1px 6px',
  fontFamily:  'ui-monospace, Consolas, monospace',
  fontSize:    13,
  color:       '#e2e8f0',
}
