const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')
const { autoUpdater } = require('electron-updater')
const path       = require('path')
const fs         = require('fs')
const nodemailer = require('nodemailer')

const isDev = !app.isPackaged

autoUpdater.autoDownload = true
autoUpdater.autoInstallOnAppQuit = true

// ─── Window ──────────────────────────────────────────────────────────────────

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    title: 'FundiBill',
    icon: path.join(__dirname, '../assets/icon.ico'),
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  win.setMenuBarVisibility(false)

  if (isDev) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '../dist/renderer/index.html'))
  }
}

// ─── IPC handlers ────────────────────────────────────────────────────────────

function registerHandlers() {
  // ── PDF ──────────────────────────────────────────────────────────────────

  ipcMain.handle('pdf:save', async (_event, { buffer, filename }) => {
    try {
      const { filePath, canceled } = await dialog.showSaveDialog({
        title: 'Save PDF',
        defaultPath: filename,
        filters: [{ name: 'PDF Document', extensions: ['pdf'] }],
      })
      if (canceled || !filePath) return { success: false, canceled: true }
      fs.writeFileSync(filePath, Buffer.from(buffer))
      // Open the saved file in the system's default PDF viewer
      shell.openPath(filePath)
      return { success: true, filePath }
    } catch (err) {
      console.error('[pdf:save]', err.message)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('pdf:getLogoBase64', (_event, filePath) => {
    try {
      if (!filePath || !fs.existsSync(filePath)) return { success: false }
      const data = fs.readFileSync(filePath)
      const ext  = path.extname(filePath).slice(1).toLowerCase()
      const mime = ['jpg', 'jpeg'].includes(ext) ? 'image/jpeg'
                 : ext === 'png'  ? 'image/png'
                 : ext === 'svg'  ? 'image/svg+xml'
                 : `image/${ext}`
      return { success: true, data: `data:${mime};base64,${data.toString('base64')}` }
    } catch (err) {
      console.error('[pdf:getLogoBase64]', err.message)
      return { success: false, error: err.message }
    }
  })

  // ── Email (legacy — used by Settings test-email) ──────────────────────────

  ipcMain.handle('email:send', async (_event, { smtp, to, subject, text, html, attachmentBuffer, attachmentFilename }) => {
    try {
      const port = parseInt(smtp.port || '587', 10) || 587
      const transporter = nodemailer.createTransport({
        host: smtp.host,
        port,
        secure: port === 465,
        auth: { user: smtp.user, pass: smtp.password },
        tls: { rejectUnauthorized: false },
      })

      const fromAddress = smtp.from_name
        ? `"${smtp.from_name}" <${smtp.user}>`
        : smtp.user

      const mailOptions = {
        from: fromAddress,
        to,
        subject,
        text,
        html: html || undefined,
      }

      if (attachmentBuffer && attachmentFilename) {
        mailOptions.attachments = [{
          filename: attachmentFilename,
          content:  Buffer.from(attachmentBuffer),
        }]
      }

      await transporter.sendMail(mailOptions)
      return { success: true }
    } catch (err) {
      console.error('[email:send]', err.message)
      return { success: false, error: err.message }
    }
  })

  // ── Email (send-email — used by SendEmailModal) ───────────────────────────

  ipcMain.handle('send-email', async (_event, {
    to, subject, message, html,
    smtpHost, smtpPort, smtpUser, smtpPassword,
    smtpFromName, smtpFromEmail,
    pdfBuffer, fileName,
  }) => {
    // ── Diagnostic: confirm what arrived from the renderer ──────────────────
    console.log('[send-email] handler invoked:', {
      to,
      subject,
      smtpHost,
      smtpUser,
      hasMessage:  !!message,
      messageLen:  message?.length,
      hasHtml:     !!html,
      htmlLength:  html?.length,
      hasBuffer:   !!pdfBuffer,
      fileName,
    })

    try {
      const port = parseInt(smtpPort, 10) || 587
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port,
        secure: port === 465,
        auth: { user: smtpUser, pass: smtpPassword },
        tls: { rejectUnauthorized: false },
      })

      const fromEmail   = smtpFromEmail || smtpUser
      const fromAddress = smtpFromName
        ? `"${smtpFromName}" <${fromEmail}>`
        : fromEmail

      const mailOptions = {
        from:    fromAddress,
        to,
        subject,
        text:    message,           // plain-text fallback for clients that block HTML
        html:    html || undefined, // branded HTML body
      }

      if (pdfBuffer && fileName) {
        mailOptions.attachments = [{
          filename: fileName,
          content:  Buffer.from(pdfBuffer),
        }]
      }

      // ── Diagnostic: confirm what nodemailer will send ─────────────────────
      console.log('[send-email] mailOptions:', {
        from:            mailOptions.from,
        to:              mailOptions.to,
        subject:         mailOptions.subject,
        hasText:         !!mailOptions.text,
        hasHtml:         !!mailOptions.html,
        htmlLength:      mailOptions.html?.length,
        attachmentCount: mailOptions.attachments?.length ?? 0,
      })

      await transporter.sendMail(mailOptions)
      console.log('[send-email] sent successfully to', to)
      return { success: true }
    } catch (err) {
      console.error('[send-email] ERROR:', err.message)
      return { success: false, error: err.message }
    }
  })

  // ── Shell ─────────────────────────────────────────────────────────────────

  ipcMain.handle('shell:openExternal', (_event, url) => {
    if (typeof url === 'string' && /^https?:\/\//.test(url)) {
      shell.openExternal(url)
    }
  })
}

// ─── App lifecycle ───────────────────────────────────────────────────────────

app.whenReady().then(() => {
  registerHandlers()
  createWindow()

  const mainWindow = BrowserWindow.getAllWindows()[0]

  // Check for updates in production only
  if (app.isPackaged) {
    autoUpdater.checkForUpdates()
  }

  autoUpdater.on('update-available', (info) => {
    mainWindow.webContents.send('update-available', info.version)
  })

  autoUpdater.on('update-downloaded', () => {
    mainWindow.webContents.send('update-downloaded')
  })

  autoUpdater.on('error', (err) => {
    console.log('Auto updater error: ' + err)
  })

  ipcMain.on('install-update', () => {
    autoUpdater.quitAndInstall()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
