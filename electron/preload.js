/**
 * electron/preload.js
 *
 * Exposes two globals to the renderer process:
 *   window.electronAPI  — primary bridge (SendEmailModal)
 *   window.db           — legacy bridge (PDF save/read, Settings test-email, shell)
 *
 * All application data is stored in Supabase.
 * Only native file-system / SMTP operations are bridged here.
 */

const { contextBridge, ipcRenderer } = require('electron')

/** Thin wrapper: invoke an IPC channel with any number of arguments. */
const call = (channel, ...args) => ipcRenderer.invoke(channel, ...args)

// ── electronAPI ───────────────────────────────────────────────────────────────

contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Send an email via the configured SMTP server.
   * @param {object} payload  { to, subject, message,
   *                            smtpHost, smtpPort, smtpUser, smtpPassword,
   *                            smtpFromName, smtpFromEmail,
   *                            pdfBuffer?, fileName? }
   * @returns {Promise<{ success: boolean, error?: string }>}
   */
  sendEmail: (payload) => call('send-email', payload),

  // ── Auto-updater ──────────────────────────────────────────────────────────
  onUpdateAvailable:  (cb) => ipcRenderer.on('update-available',  (_e, version) => cb(version)),
  onUpdateDownloaded: (cb) => ipcRenderer.on('update-downloaded', () => cb()),
  installUpdate:      ()   => ipcRenderer.send('install-update'),
})

// ── db (legacy) ───────────────────────────────────────────────────────────────

contextBridge.exposeInMainWorld('db', {
  // ── PDF ───────────────────────────────────────────────────────────────────
  pdf: {
    /**
     * Show a native Save dialog and write the PDF to disk, then open the file.
     * @param {ArrayBuffer} buffer  PDF bytes from @react-pdf/renderer
     * @param {string}      filename  Suggested filename (e.g. "Invoice-INV-0001.pdf")
     */
    save: (buffer, filename) => call('pdf:save', { buffer, filename }),

    /**
     * Read a local logo file and return it as a base64 data URL so
     * @react-pdf/renderer can embed it in the document.
     */
    getLogoBase64: (filePath) => call('pdf:getLogoBase64', filePath),
  },

  // ── Email (used by Settings → Send Test Email) ────────────────────────────
  email: {
    /**
     * @param {object} payload  { smtp, to, subject, text, html?, attachmentBuffer?, attachmentFilename? }
     */
    send: (payload) => call('email:send', payload),
  },

  // ── Shell ──────────────────────────────────────────────────────────────────
  openExternal: (url) => call('shell:openExternal', url),
})
