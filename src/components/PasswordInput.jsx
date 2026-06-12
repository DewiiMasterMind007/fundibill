import { useState } from 'react'

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  )
}

// Wraps a password <input> with a show/hide toggle button on the right.
// Each instance manages its own visibility state independently.
export default function PasswordInput({ style = {}, wrapperStyle = {}, iconColor = '#94a3b8', iconHoverColor = '#475569', ...props }) {
  const [visible, setVisible] = useState(false)

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: style.maxWidth, ...wrapperStyle }}>
      <input
        {...props}
        type={visible ? 'text' : 'password'}
        style={{ ...style, paddingRight: 44 }}
      />
      <button
        type="button"
        onClick={() => setVisible(v => !v)}
        tabIndex={-1}
        aria-label={visible ? 'Hide password' : 'Show password'}
        style={{
          position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          color: iconColor, transition: 'color 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.color = iconHoverColor }}
        onMouseLeave={e => { e.currentTarget.style.color = iconColor }}
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  )
}
