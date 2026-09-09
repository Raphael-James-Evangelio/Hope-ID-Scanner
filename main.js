const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const db = require('./src/database')
const scanner = require('./src/scanner')
const xlsx = require('./src/xlsx')
const { autoUpdater } = require('electron-updater')

if (!app.requestSingleInstanceLock()) {
  app.quit()
}

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

let launcher = null

function createWindow(file) {
  const iconPath = path.join(__dirname, 'build', 'icon.ico')
  const win = new BrowserWindow({
    width: 1200,
    height: 780,
    minWidth: 940,
    minHeight: 620,
    backgroundColor: '#0b1220',
    autoHideMenuBar: true,
    show: false,
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  win.once('ready-to-show', () => {
    win.maximize()
    win.show()
  })
  win.loadFile(path.join(__dirname, 'renderer', file))
  return win
}

function registerIpc() {
  ipcMain.handle('windows:openScanner', () => {
    const win = createWindow('scan.html')
    scanner.attach(win.webContents)
    return true
  })

  ipcMain.handle('windows:openRegister', () => {
    createWindow('register.html')
    return true
  })

  ipcMain.handle('scanner:enabled', (_e, v) => {
    scanner.setEnabled(v)
    return true
  })

  ipcMain.handle('win:toggleFullscreen', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    win.setFullScreen(!win.isFullScreen())
    return win.isFullScreen()
  })

  ipcMain.handle('students:list', (_e, q) => db.studentsList(q || ''))
  ipcMain.handle('students:getByUid', (_e, uid) => db.studentByUid(uid))
  ipcMain.handle('students:create', (_e, data, slots) => db.studentCreate(data, slots))
  ipcMain.handle('students:update', (_e, id, data, slots) => db.studentUpdate(id, data, slots))
  ipcMain.handle('students:remove', (_e, id) => db.studentDelete(id))

  ipcMain.handle('photo:upload', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'Select Student Photo',
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
      properties: ['openFile']
    })
    if (canceled || !filePaths[0]) return null
    const ext = path.extname(filePaths[0]).toLowerCase() || '.jpg'
    const name = `student_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`
    const dest = path.join(app.getPath('userData'), 'photos', name)
    fs.copyFileSync(filePaths[0], dest)
    const buf = fs.readFileSync(dest)
    const mime = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }[ext] || 'image/jpeg'
    return { fileName: name, dataUri: `data:${mime};base64,${buf.toString('base64')}` }
  })

  ipcMain.handle('photo:getDataUri', (_e, fileName) => {
    if (!fileName) return null
    try {
      const filePath = path.join(app.getPath('userData'), 'photos', fileName)
      const buf = fs.readFileSync(filePath)
      const ext = path.extname(fileName).toLowerCase()
      const mime = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }[ext] || 'image/jpeg'
      return `data:${mime};base64,${buf.toString('base64')}`
    } catch (_) { return null }
  })

  ipcMain.handle('photo:delete', (_e, fileName) => {
    if (!fileName) return
    try { fs.unlinkSync(path.join(app.getPath('userData'), 'photos', fileName)) } catch (_) {}
  })

  ipcMain.handle('settings:get', () => db.settingsGet())
  ipcMain.handle('settings:set', (_e, patch) => db.settingsSet(patch))

  ipcMain.handle('logs:list', (_e, filters, page) => {
    const perPage = 20
    const p = Math.max(1, Math.floor(Number(page) || 1))
    return db.logsQuery(filters || {}, perPage, (p - 1) * perPage)
  })
  ipcMain.handle('logs:clear', () => db.logsClear())
  ipcMain.handle('logs:export', async (e, filters) => {
    const { rows } = db.logsQuery(filters || {})
    const { canceled, filePath } = await dialog.showSaveDialog(BrowserWindow.fromWebContents(e.sender), {
      title: 'Export scan logs',
      defaultPath: `hope-scan-logs-${new Date().toISOString().slice(0, 10)}.xlsx`,
      filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }]
    })
    if (canceled || !filePath) return null
    const buf = xlsx.buildSheet({
      name: 'Scan Logs',
      headers: ['Scanned At', 'UID', 'Student Name', 'Result', 'Detail'],
      widths: [21, 16, 30, 12, 48],
      rows: rows.map(r => [r.scanned_at, r.uid, r.name || '', r.result, r.detail])
    })
    fs.writeFileSync(filePath, buf)
    return filePath
  })

  ipcMain.handle('evaluate', (_e, uid, period) => db.evaluateAndLog(uid, period))
  ipcMain.handle('evaluate:in', (_e, uid, period) => db.evaluateIn(uid, period))
  ipcMain.handle('stats:get', () => db.stats())
}

function createLauncher() {
  launcher = createWindow('index.html')
  launcher.on('closed', () => { launcher = null })
}

function broadcastAll(channel, ...args) {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, ...args)
  }
}

function setupUpdater() {
  if (!app.isPackaged) return

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => {
    broadcastAll('updater:update-available', { version: info.version })
  })
  autoUpdater.on('update-not-available', (info) => {
    broadcastAll('updater:update-not-available', { version: info.version })
  })
  autoUpdater.on('update-downloaded', (info) => {
    broadcastAll('updater:update-downloaded', { version: info.version })
  })
  autoUpdater.on('download-progress', (p) => {
    broadcastAll('updater:download-progress', {
      percent: Math.round(p.percent),
      bytesPerSecond: p.bytesPerSecond,
      transferred: p.transferred,
      total: p.total
    })
  })
  autoUpdater.on('error', (err) => {
    broadcastAll('updater:error', { message: String(err && (err.message || err)) })
  })

  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {})
  }, 3000)
}

function registerUpdateIpc() {
  ipcMain.handle('updater:version', () => app.getVersion())
  ipcMain.handle('updater:check', () => {
    if (!app.isPackaged) return { ok: false, message: 'dev mode' }
    return autoUpdater.checkForUpdates()
      .then(() => ({ ok: true }))
      .catch(e => ({ ok: false, message: String(e && (e.message || e)) }))
  })
  ipcMain.handle('updater:download', async () => {
    try {
      await autoUpdater.downloadUpdate()
      return { ok: true }
    } catch (e) {
      return { ok: false, message: String(e && (e.message || e)) }
    }
  })
  ipcMain.handle('updater:restart', () => {
    autoUpdater.quitAndInstall()
    return true
  })
}

app.on('second-instance', () => {
  if (launcher) {
    if (launcher.isMinimized()) launcher.restore()
    launcher.focus()
  }
})

app.whenReady().then(() => {
  const photosDir = path.join(app.getPath('userData'), 'photos')
  if (!fs.existsSync(photosDir)) fs.mkdirSync(photosDir, { recursive: true })

  db.init()
  registerIpc()
  registerUpdateIpc()
  createLauncher()
  setupUpdater()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createLauncher()
  })
})

app.on('window-all-closed', () => {
  app.quit()
})
