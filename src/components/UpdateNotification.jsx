import { useState, useEffect } from 'react'

export default function UpdateNotification() {
  const [state,     setState]     = useState(null) // null | 'available' | 'ready'
  const [version,   setVersion]   = useState('')
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!window.electronAPI) return

    window.electronAPI.onUpdateAvailable((v) => {
      setVersion(v)
      setState('available')
    })

    window.electronAPI.onUpdateDownloaded(() => {
      setState('ready')
    })
  }, [])

  if (!state || dismissed) return null

  return (
    <div style={{
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'space-between',
      gap:            12,
      padding:        '9px 20px',
      background:     '#eff6ff',
      borderBottom:   '1px solid #bfdbfe',
      fontSize:       13,
      color:          '#1e40af',
      flexShrink:     0,
    }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
        {state === 'available' ? (
          <>
            <span style={{ fontSize: 15 }}>⬆️</span>
            A new version of FundiBill is available. Downloading update...
          </>
        ) : (
          <>
            <span style={{ fontSize: 15 }}>✅</span>
            Update ready. Restart FundiBill to apply the update.
            <button
              onClick={() => window.electronAPI.installUpdate()}
              style={{
                marginLeft:   8,
                padding:      '3px 12px',
                background:   '#1d4ed8',
                color:        '#fff',
                border:       'none',
                borderRadius: 5,
                cursor:       'pointer',
                fontSize:     12,
                fontWeight:   600,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#1e40af' }}
              onMouseLeave={e => { e.currentTarget.style.background = '#1d4ed8' }}
            >
              Restart Now
            </button>
          </>
        )}
      </span>

      <button
        onClick={() => setDismissed(true)}
        title="Dismiss"
        style={{
          background:  'none',
          border:      'none',
          cursor:      'pointer',
          color:       '#3b82f6',
          fontSize:    20,
          lineHeight:  1,
          padding:     '0 4px',
          flexShrink:  0,
          opacity:     0.6,
          fontWeight:  400,
        }}
        onMouseEnter={e => { e.currentTarget.style.opacity = '1' }}
        onMouseLeave={e => { e.currentTarget.style.opacity = '0.6' }}
      >
        ×
      </button>
    </div>
  )
}
