import React, { useState, useEffect, useRef, useCallback } from 'react'

// ── Preview modal ──────────────────────────────────────────────────────────────
//
// Usage:
//   <PdfPreviewModal
//     isOpen={pdfOpen}
//     data={invoice}          // full invoice/estimate object with items[]
//     settings={settings}     // business settings
//     docType="INVOICE"       // or "ESTIMATE"
//     onClose={() => setPdfOpen(false)}
//   />

export function PdfPreviewModal({ isOpen, data, settings, docType, onClose }) {
  const [pdfUrl, setPdfUrl]         = useState(null)
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState(null)
  const urlRef  = useRef(null)
  const blobRef = useRef(null)   // store blob directly to avoid re-fetching

  const filename = docType === 'INVOICE'
    ? `Invoice-${data?.invoice_number || 'draft'}.pdf`
    : `Estimate-${data?.estimate_number || 'draft'}.pdf`

  // ── Generate PDF whenever the modal opens ──────────────────────────────────
  useEffect(() => {
    if (!isOpen || !data) return

    let canceled = false

    async function generate() {
      setGenerating(true)
      setError(null)
      setPdfUrl(null)

      try {
        // settings may use logo_path (Settings form) or logo_url (raw Supabase profile row).
        // It's either a data: URL (legacy accounts, pre-Storage-upload) or an
        // https:// URL (Supabase Storage, current) — @react-pdf/renderer's
        // <Image> component accepts both directly, no file-system read needed.
        let settingsWithLogo = settings || {}
        const logoSrc = settings?.logo_path || settings?.logo_url || ''
        if (logoSrc) {
          settingsWithLogo = { ...settings, _logoSrc: logoSrc }
        }

        // Dynamically import to keep @react-pdf/renderer out of the static
        // import graph (avoids Vite CJS→ESM crash on startup)
        const [{ pdf }, { PdfDocument }] = await Promise.all([
          import('@react-pdf/renderer'),
          import('./PdfDocument'),
        ])

        const element = React.createElement(PdfDocument, {
          data,
          settings: settingsWithLogo,
          docType,
        })
        const blob = await pdf(element).toBlob()

        if (!canceled) {
          // Revoke any previous URL and store the new blob + URL
          if (urlRef.current) URL.revokeObjectURL(urlRef.current)
          const url = URL.createObjectURL(blob)
          urlRef.current  = url
          blobRef.current = blob
          setPdfUrl(url)
        }
      } catch (e) {
        if (!canceled) setError(`Failed to generate PDF: ${e.message}`)
        console.error('[pdf]', e)
      }

      if (!canceled) setGenerating(false)
    }

    generate()

    return () => {
      canceled = true
    }
  }, [isOpen, data, settings, docType])

  // Revoke object URL on close
  useEffect(() => {
    if (!isOpen && urlRef.current) {
      URL.revokeObjectURL(urlRef.current)
      urlRef.current  = null
      blobRef.current = null
      setPdfUrl(null)
    }
  }, [isOpen])

  // ── Save: Electron native save dialog, or a browser/PWA download fallback ──
  const handleSave = useCallback(async () => {
    if (!blobRef.current || saving) return
    setSaving(true)
    try {
      if (window.db?.pdf?.save) {
        const buffer = await blobRef.current.arrayBuffer()
        const res    = await window.db.pdf.save(buffer, filename)
        if (res?.success === false && !res?.canceled) {
          setError(res?.error || 'Failed to save PDF.')
        }
      } else {
        // Browser / mobile PWA — no native save dialog exists, so trigger a
        // normal download via a temporary anchor tag (same pattern used by
        // the WhatsApp share flow's downloadPdfBlob()).
        const url = URL.createObjectURL(blobRef.current)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      }
    } catch (e) {
      setError(`Save error: ${e.message}`)
    }
    setSaving(false)
  }, [saving, filename])

  // ── Keyboard: Escape closes modal ─────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return
    const fn = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9000,
      display: 'flex', flexDirection: 'column',
      background: 'rgba(15,23,42,0.85)',
    }}>
      {/* ── Modal header ─────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 20px', background: '#1e293b', borderBottom: '1px solid #334155',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          <span style={{ color: '#f1f5f9', fontSize: 14, fontWeight: 600 }}>
            PDF Preview — {filename}
          </span>
          {generating && (
            <span style={{ color: '#94a3b8', fontSize: 13 }}>Generating…</span>
          )}
          {error && (
            <span style={{ color: '#f87171', fontSize: 13 }}>{error}</span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          {/* Save As button */}
          <button
            onClick={handleSave}
            disabled={!pdfUrl || saving}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '8px 16px', borderRadius: 8, border: 'none',
              background: (pdfUrl && !saving) ? '#14b8a6' : '#334155',
              color: (pdfUrl && !saving) ? '#fff' : '#64748b',
              fontWeight: 600, fontSize: 13, cursor: (pdfUrl && !saving) ? 'pointer' : 'not-allowed',
              transition: 'background 0.15s',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            {saving ? 'Saving…' : 'Save As…'}
          </button>

          {/* Close button */}
          <button
            onClick={onClose}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 8,
              border: '1px solid #475569', background: 'transparent',
              color: '#94a3b8', fontWeight: 600, fontSize: 13, cursor: 'pointer',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
            Close
          </button>
        </div>
      </div>

      {/* ── PDF viewer ─────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {generating && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 40, height: 40, border: '3px solid #334155',
              borderTopColor: '#14b8a6', borderRadius: '50%',
              animation: 'pdfSpin 0.8s linear infinite',
            }} />
            <span style={{ color: '#94a3b8', fontSize: 14 }}>Generating PDF…</span>
          </div>
        )}

        {!generating && error && (
          <div style={{ textAlign: 'center', color: '#f87171', fontSize: 14 }}>
            <p style={{ margin: '0 0 8px', fontWeight: 600 }}>Could not generate PDF</p>
            <p style={{ margin: 0, color: '#94a3b8', fontSize: 12 }}>{error}</p>
          </div>
        )}

        {pdfUrl && !generating && (
          <iframe
            src={pdfUrl}
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
            }}
            title="PDF Preview"
          />
        )}
      </div>

      <style>{`
        @keyframes pdfSpin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
