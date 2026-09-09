const $ = s => document.querySelector(s)

let audioCtx = null
let lastUid = ''
let lastTs = 0
let resetTimer = null

const GLYPHS = {
  idle: 'TAP',
  checking: '',
  allowed: '\u2713',
  allowed_waiting: '\u2713',
  already: '!',
  denied: '\u2715',
  early: 'WAIT',
  unknown: '?',
  inactive: '!',
  invalid: '!'
}

function beep(status) {
  try {
    audioCtx = audioCtx || new AudioContext()
    const ctx = audioCtx
    const play = (freq, start, dur, type = 'sine') => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = type
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + start)
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur)
      osc.connect(gain).connect(ctx.destination)
      osc.start(ctx.currentTime + start)
      osc.stop(ctx.currentTime + start + dur + 0.05)
    }
    if (status === 'allowed' || status === 'allowed_waiting') {
      play(880, 0, 0.15)
      play(1318, 0.13, 0.25)
    } else if (status === 'denied') {
      play(220, 0, 0.4, 'square')
    } else {
      play(440, 0, 0.12)
      play(440, 0.18, 0.12)
      play(440, 0.36, 0.12)
    }
  } catch (e) { /* audio unavailable */ }
}

function tickClock() {
  const now = new Date()
  const pad = n => String(n).padStart(2, '0')
  $('#clock-time').textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
  $('#clock-date').textContent = now.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
}

function fitTitle() {
  const el = $('#title')
  const len = el.textContent.length
  if (len <= 8) {
    el.style.fontSize = 'clamp(22px, 5vh, 46px)'
  } else if (len <= 14) {
    el.style.fontSize = 'clamp(20px, 4.2vh, 38px)'
  } else {
    el.style.fontSize = 'clamp(18px, 3.6vh, 32px)'
  }
}

function setStatus(cls, title, reason, data = {}) {
  const card = $('#status-card')
  card.className = `status-card ${cls}`
  void card.offsetWidth
  card.classList.add('pop')

  $('#glyph').textContent = GLYPHS[cls] || ''
  $('#glyph').style.animationPlayState = cls === 'checking' ? 'running' : 'paused'
  $('#title').textContent = title
  fitTitle()
  $('#reason').textContent = reason

  const photoEl = $('#student-photo')
  if (data.student && data.student.photo) {
    photoEl.classList.add('hidden')
    hope.photo.getDataUri(data.student.photo).then(uri => {
      if (uri) {
        photoEl.src = uri
        photoEl.classList.remove('hidden')
      }
    })
  } else {
    photoEl.src = ''
    photoEl.classList.add('hidden')
  }

  const nameEl = $('#who-name')
  const metaEl = $('#who-meta')
  if (data.student) {
    const st = data.student
    const ptype = st.person_type || 'student'
    nameEl.textContent = st.name
    nameEl.classList.remove('hidden')
    const typeLabel = ptype === 'coach' ? 'Coach' : ptype === 'visitor' ? 'Visitor' : ptype === 'employee' ? 'Employee' : ptype === 'zion' ? 'Zion' : 'Student'
    const meta = ptype === 'student'
      ? [st.student_number, st.course_section].filter(Boolean).join(' · ') || st.uid
      : `${typeLabel} · ${st.uid}`
    metaEl.textContent = meta
    metaEl.classList.remove('hidden')
  } else if (data.uid) {
    nameEl.classList.add('hidden')
    metaEl.textContent = `UID: ${data.uid}`
    metaEl.classList.remove('hidden')
  } else {
    nameEl.classList.add('hidden')
    metaEl.classList.add('hidden')
  }

  const chips = $('#chips')
  chips.innerHTML = ''
  if (data.student) {
    const ptype = data.student.person_type || 'student'
    if (ptype !== 'student') {
      const chip = document.createElement('span')
      chip.className = 'chip active-now'
      chip.textContent = 'Always allowed · any time of day'
      chips.appendChild(chip)
    } else {
      const lunchChip = document.createElement('span')
      lunchChip.className = 'chip' + (data.student.lunch_break_access ? ' active-now' : '')
      lunchChip.textContent = data.student.lunch_break_access ? 'Lunch break: Allowed' : 'Lunch break: Not Allowed'
      chips.appendChild(lunchChip)

      const dismissChip = document.createElement('span')
      dismissChip.className = 'chip' + (data.student.dismissal_allowed ? ' active-now' : '')
      dismissChip.textContent = data.student.dismissal_allowed ? 'Dismissal: Allowed' : 'Dismissal: Not Allowed'
      chips.appendChild(dismissChip)
    }
  }
}

function feed(res) {
  const list = $('#feed')
  const empty = list.querySelector('.feed-empty')
  if (empty) empty.remove()

  const li = document.createElement('li')
  li.className = `feed-item ${res.status}`

  if (res.student && res.student.photo) {
    const feedPhoto = document.createElement('img')
    feedPhoto.className = 'feed-photo'
    feedPhoto.alt = ''
    li.appendChild(feedPhoto)
    hope.photo.getDataUri(res.student.photo).then(uri => {
      if (uri) feedPhoto.src = uri
    })
  }

  const t = document.createElement('span')
  t.className = 'ft'
  t.textContent = res.now.slice(0, 5)

  const mid = document.createElement('div')
  mid.style.minWidth = '0'
  const n = document.createElement('div')
  n.className = 'fn'
  n.textContent = res.student ? res.student.name : res.uid
  const u = document.createElement('div')
  u.className = 'fu'
  u.textContent = res.student ? (res.student.student_number || '') : 'unregistered'
  mid.append(n, u)

  const r = document.createElement('span')
  r.className = 'fr'
  r.textContent = res.status === 'allowed_waiting' ? 'WAITING AREA' : res.status.toUpperCase()

  li.append(t, mid, r)
  list.prepend(li)
  while (list.children.length > 10) list.lastChild.remove()
}

async function handleScan(raw) {
  const uid = String(raw || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase()
  if (!uid) return

  const t = Date.now()
  if (uid === lastUid && t - lastTs < 1500) return
  lastUid = uid
  lastTs = t

  setStatus('checking', 'READING...', 'Verifying card', { uid })
  beep('reading')

  let res
  try {
    res = mode === 'in' ? await hope.evaluateIn(uid, period) : await hope.evaluate(uid, period)
  } catch (e) {
    res = { status: 'invalid', title: 'ERROR', reason: String(e.message || e), uid, now: new Date().toTimeString().slice(0, 8) }
  }

  setStatus(res.status, res.title, res.reason, { student: res.student, slots: [], uid: res.uid })
  beep(res.status)
  feed(res)

  clearTimeout(resetTimer)
  resetTimer = setTimeout(() => {
    setStatus('idle', 'TAP YOUR ID', 'Hold your card near the reader')
  }, 6000)
}

let mode = 'in'
let period = 'am'

function setMode(m) {
  mode = m
  const inBtn = $('#btn-time-in')
  const outBtn = $('#btn-time-out')
  inBtn.classList.toggle('active', m === 'in')
  outBtn.classList.toggle('active', m === 'out')
}

function setPeriod(p) {
  period = p
  const amBtn = $('#btn-period-am')
  const pmBtn = $('#btn-period-pm')
  amBtn.classList.toggle('active', p === 'am')
  pmBtn.classList.toggle('active', p === 'pm')
}

$('#btn-time-in').addEventListener('click', () => setMode('in'))
$('#btn-time-out').addEventListener('click', () => setMode('out'))
$('#btn-period-am').addEventListener('click', () => setPeriod('am'))
$('#btn-period-pm').addEventListener('click', () => setPeriod('pm'))
setMode('in')
setPeriod('am')

$('#btn-fs').addEventListener('click', () => hope.toggleFullscreen())

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme)
  $('#btn-theme').textContent = theme === 'light' ? 'Dark Mode' : 'White Mode'
}

let theme = localStorage.getItem('hope-theme') || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
applyTheme(theme)

$('#btn-theme').addEventListener('click', () => {
  theme = theme === 'light' ? 'dark' : 'light'
  localStorage.setItem('hope-theme', theme)
  applyTheme(theme)
})

window.addEventListener('keydown', e => {
  if (e.key === 'F11') {
    e.preventDefault()
    hope.toggleFullscreen()
  }
})

const manualInput = $('#manual-uid')
manualInput.addEventListener('focus', () => hope.scanner.setEnabled(false))
manualInput.addEventListener('blur', () => hope.scanner.setEnabled(true))
$('#manual-form').addEventListener('submit', e => {
  e.preventDefault()
  handleScan(manualInput.value)
  manualInput.select()
})

hope.settings.get().then(s => {
  if (s.schoolName) $('#school-name').textContent = s.schoolName
})

hope.scanner.onData(handleScan)

tickClock()
setInterval(tickClock, 500)
setStatus('idle', 'TAP YOUR ID', 'Hold your card near the reader')
