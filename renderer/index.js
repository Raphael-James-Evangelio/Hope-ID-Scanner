const $ = s => document.querySelector(s)

function toast(msg, type = 'info', ms = 3200) {
  const el = document.createElement('div')
  el.className = `toast ${type}`
  el.textContent = msg
  $('#toasts').appendChild(el)
  setTimeout(() => el.remove(), ms)
}

async function refreshStats() {
  try {
    const s = await hope.stats.get()
    $('#s-students').textContent = s.students
    $('#s-scans').textContent = s.scansToday
    $('#s-ok').textContent = s.allowedToday
    $('#s-no').textContent = s.deniedToday
  } catch (e) { /* stats are non-critical */ }
}

$('#btn-open-scanner').addEventListener('click', async () => {
  await hope.windows.openScanner()
})

$('#btn-open-register').addEventListener('click', async () => {
  await hope.windows.openRegister()
})

refreshStats()
setInterval(refreshStats, 5000)

hope.settings.get().then(s => {
  if (s.schoolName) $('#school-title').textContent = s.schoolName
})

const banner = $('#update-banner')
const downloadBtn = $('#btn-update-download')
const restartBtn = $('#btn-update-restart')
const progressEl = $('#update-progress')
const progressBar = $('#update-progress-bar')
let downloadStarted = false

function setBannerVisible(v) {
  banner.classList.toggle('hidden', !v)
  if (v) banner.classList.remove('banner-done')
}

function showProgress(pct) {
  progressEl.classList.remove('hidden')
  progressBar.style.width = `${Math.max(0, Math.min(100, pct))}%`
}

let currentVersion = ''
hope.updater.version().then(v => {
  currentVersion = v
  const hint = document.querySelector('.footer-hint')
  if (hint) hint.textContent = `Version ${v} · Tip: press F11 in the scanner window for fullscreen kiosk mode · Data is stored locally on this PC`
})

hope.updater.onUpdateAvailable(info => {
  const ver = (info && info.version) ? `v${info.version}` : 'a new version'
  $('#update-sub').innerHTML = `Version <b>${ver}</b> is available. Your current version is <b>v${currentVersion}</b>.`
  downloadBtn.classList.remove('hidden')
  restartBtn.classList.add('hidden')
  setBannerVisible(true)
})

hope.updater.onUpdateNotAvailable(() => {})

hope.updater.onDownloadProgress(p => showProgress(p.percent))

hope.updater.onDownloaded(info => {
  downloadBtn.classList.add('hidden')
  restartBtn.classList.remove('hidden')
  showProgress(100)
  const sub = $('#update-sub')
  sub.innerHTML = `Version <b>v${(info && info.version) || '?'}</b> downloaded. Restart to install.`
  banner.classList.add('banner-done')
})

hope.updater.onUpdateError(err => {
  $('#update-sub').textContent = `Update check failed: ${(err && err.message) || 'unknown error'}`
})

downloadBtn.addEventListener('click', async () => {
  if (downloadStarted) return
  downloadStarted = true
  downloadBtn.disabled = true
  downloadBtn.textContent = 'Downloading...'
  try {
    await hope.updater.download()
  } catch (e) {
    downloadStarted = false
    downloadBtn.disabled = false
    downloadBtn.textContent = 'Download'
    $('#update-sub').textContent = `Download failed: ${String((e && e.message) || e)}`
  }
})

restartBtn.addEventListener('click', () => hope.updater.restart())
