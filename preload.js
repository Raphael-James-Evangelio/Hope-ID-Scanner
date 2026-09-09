const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('hope', {
  students: {
    list: q => ipcRenderer.invoke('students:list', q),
    getByUid: uid => ipcRenderer.invoke('students:getByUid', uid),
    create: (data, slots) => ipcRenderer.invoke('students:create', data, slots),
    update: (id, data, slots) => ipcRenderer.invoke('students:update', id, data, slots),
    remove: id => ipcRenderer.invoke('students:remove', id)
  },
  photo: {
    upload: () => ipcRenderer.invoke('photo:upload'),
    getDataUri: fileName => ipcRenderer.invoke('photo:getDataUri', fileName),
    delete: fileName => ipcRenderer.invoke('photo:delete', fileName)
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: patch => ipcRenderer.invoke('settings:set', patch)
  },
  logs: {
    list: (filters, page) => ipcRenderer.invoke('logs:list', filters, page),
    clear: () => ipcRenderer.invoke('logs:clear'),
    export: filters => ipcRenderer.invoke('logs:export', filters)
  },
  stats: {
    get: () => ipcRenderer.invoke('stats:get')
  },
  evaluate: (uid, period) => ipcRenderer.invoke('evaluate', uid, period),
  evaluateIn: (uid, period) => ipcRenderer.invoke('evaluate:in', uid, period),
  windows: {
    openScanner: () => ipcRenderer.invoke('windows:openScanner'),
    openRegister: () => ipcRenderer.invoke('windows:openRegister')
  },
  scanner: {
    setEnabled: v => ipcRenderer.invoke('scanner:enabled', v),
    onData: cb => ipcRenderer.on('scanner:data', (_e, uid) => cb(uid))
  },
  toggleFullscreen: () => ipcRenderer.invoke('win:toggleFullscreen'),
  updater: {
    version: () => ipcRenderer.invoke('updater:version'),
    check: () => ipcRenderer.invoke('updater:check'),
    download: () => ipcRenderer.invoke('updater:download'),
    restart: () => ipcRenderer.invoke('updater:restart'),
    onUpdateAvailable: cb => ipcRenderer.on('updater:update-available', (_e, info) => cb(info)),
    onUpdateNotAvailable: cb => ipcRenderer.on('updater:update-not-available', (_e, info) => cb(info)),
    onDownloaded: cb => ipcRenderer.on('updater:update-downloaded', (_e, info) => cb(info)),
    onDownloadProgress: cb => ipcRenderer.on('updater:download-progress', (_e, p) => cb(p)),
    onUpdateError: cb => ipcRenderer.on('updater:error', (_e, err) => cb(err))
  }
})
