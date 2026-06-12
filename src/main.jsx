import { Buffer } from 'buffer'

// @react-pdf/renderer's browser bundle references the Node Buffer global
// (e.g. for image/font decoding) — polyfill it before anything else loads.
window.Buffer = Buffer
globalThis.Buffer = Buffer

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import './index.css'

// If a dynamically-imported chunk (e.g. PdfDocument) 404s because the user's
// tab is running an older build whose chunk hashes no longer exist on the
// server after a new deploy, reload once to fetch the current build.
window.addEventListener('vite:preloadError', () => {
  if (sessionStorage.getItem('reloadedForChunkError')) return
  sessionStorage.setItem('reloadedForChunkError', '1')
  window.location.reload()
})

// This run loaded fine — allow a future chunk error to trigger one more reload.
sessionStorage.removeItem('reloadedForChunkError')

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>
)
