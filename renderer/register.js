const $ = s => document.querySelector(s)
const $$ = s => [...document.querySelectorAll(s)]

const GRADES = ['Nursery', 'Pre-Kinder', 'Kinder', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12']

let editingId = null
let captureMode = false
let currentPhoto = ''
let dismissalSchedule = {}

function toast(msg, type = 'info', ms = 3200) {
  const el = document.createElement('div')
  el.className = `toast ${type}`
  el.textContent = msg
  $('#toasts').appendChild(el)
  setTimeout(() => el.remove(), ms)
}

function errMsg(e) {
  const m = String(e && e.message || e)
  const match = m.match(/Error invoking remote method [^:]+: (?:Error: )?([\s\S]*)$/)
  return match ? match[1] : m
}

function photoUrl(fileName) {
  return ''
}

async function showPhoto(fileName) {
  const preview = $('#photo-preview')
  const placeholder = $('#photo-placeholder')
  const removeBtn = $('#btn-remove-photo')
  if (fileName) {
    const dataUri = await hope.photo.getDataUri(fileName)
    if (dataUri) {
      preview.src = dataUri
      preview.classList.remove('hidden')
      placeholder.classList.add('hidden')
      removeBtn.classList.remove('hidden')
      return
    }
  }
  preview.src = ''
  preview.classList.add('hidden')
  placeholder.classList.remove('hidden')
  removeBtn.classList.add('hidden')
}

async function uploadPhoto() {
  const result = await hope.photo.upload()
  if (result) {
    currentPhoto = result.fileName
    const preview = $('#photo-preview')
    const placeholder = $('#photo-placeholder')
    const removeBtn = $('#btn-remove-photo')
    preview.src = result.dataUri
    preview.classList.remove('hidden')
    placeholder.classList.add('hidden')
    removeBtn.classList.remove('hidden')
  }
}

function removePhoto() {
  if (currentPhoto) hope.photo.delete(currentPhoto)
  currentPhoto = ''
  showPhoto('')
}

function normUid(v) {
  return String(v || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase()
}

function schedText(st) {
  const type = st.person_type || 'student'
  if (type !== 'student') return 'Always allowed · any time of day'
  if (st.all_day_access) return 'All-day access'
  const parts = []
  if (st.lunch_break_access) parts.push('Lunch: Allowed')
  else parts.push('Lunch: Not Allowed')
  if (st.dismissal_allowed) parts.push('Dismissal: Allowed')
  else parts.push('Dismissal: Not Allowed')
  return parts.join(' · ')
}

function setAccessRadio(name, value) {
  const allowed = document.querySelector(`input[name="${name}"][value="1"]`)
  const denied = document.querySelector(`input[name="${name}"][value="0"]`)
  if (!allowed || !denied) return
  allowed.checked = value === true || value === 1 || value === '1'
  denied.checked = !(value === true || value === 1 || value === '1')
}

function getAccessRadio(name) {
  const checked = document.querySelector(`input[name="${name}"]:checked`)
  return checked ? checked.value === '1' : false
}

function resetForm() {
  editingId = null
  $('#form-title').textContent = 'Register Student'
  $('#f-uid').value = ''
  $('#f-name').value = ''
  $('#f-number').value = ''
  $('#f-section').value = ''
  $('#f-allday').checked = false
  $('#f-waiting').checked = false
  $('#f-active').checked = true
  setAccessRadio('lunch_access', false)
  setAccessRadio('dismissal_access', false)
  $('#btn-cancel').classList.add('hidden')
  currentPhoto = ''
  showPhoto('')
  setPersonType('student')
}

function fillForm(st) {
  editingId = st.id
  $('#form-title').textContent = `Edit ${personTypeLabel(st.person_type || 'student')} #${st.id}`
  $('#f-uid').value = st.uid || ''
  $('#f-name').value = st.name
  $('#f-number').value = st.student_number || ''
  $('#f-section').value = st.course_section || ''
  $('#f-allday').checked = !!st.all_day_access
  $('#f-waiting').checked = !!st.waiting_area
  $('#f-active').checked = !!st.active
  setAccessRadio('lunch_access', st.lunch_break_access)
  setAccessRadio('dismissal_access', st.dismissal_allowed)
  $('#btn-cancel').classList.remove('hidden')
  currentPhoto = st.photo || ''
  showPhoto(currentPhoto)
  setPersonType(st.person_type || 'student')
  window.scrollTo(0, 0)
}

async function refresh() {
  const q = $('#search').value.trim()
  const list = await hope.students.list(q)
  const body = $('#students-body')
  body.innerHTML = ''
  $('#count').textContent = `${list.length} person${list.length === 1 ? '' : 's'}`
  if (!list.length) {
    body.innerHTML = '<tr><td colspan="6" class="dim" style="text-align:center;padding:30px">No records found. Register one on the left.</td></tr>'
    return
  }
  for (const st of list) {
    const tr = document.createElement('tr')

    const tdUid = document.createElement('td')
    tdUid.className = 'mono'
    tdUid.textContent = st.uid || ''

    const tdName = document.createElement('td')
    tdName.className = 'name-cell'
    tdName.innerHTML = ''
    if (st.photo) {
      const thumb = document.createElement('img')
      thumb.className = 'student-thumb'
      thumb.alt = ''
      tdName.appendChild(thumb)
      hope.photo.getDataUri(st.photo).then(uri => { if (uri) thumb.src = uri })
    }
    const nameB = document.createElement('b')
    nameB.textContent = st.name
    tdName.appendChild(nameB)
    if (!st.active) {
      const badge = document.createElement('span')
      badge.className = 'badge inactive'
      badge.style.marginLeft = '6px'
      badge.textContent = 'INACTIVE'
      tdName.appendChild(badge)
    }
    const ptype = st.person_type || 'student'
    if (ptype === 'visitor') {
      const badge = document.createElement('span')
      badge.className = 'badge visitor'
      badge.style.marginLeft = '6px'
      badge.textContent = 'VISITOR'
      tdName.appendChild(badge)
    } else if (ptype === 'coach') {
      const badge = document.createElement('span')
      badge.className = 'badge coach'
      badge.style.marginLeft = '6px'
      badge.textContent = 'COACH'
      tdName.appendChild(badge)
    } else if (ptype === 'employee') {
      const badge = document.createElement('span')
      badge.className = 'badge employee'
      badge.style.marginLeft = '6px'
      badge.textContent = 'EMPLOYEE'
      tdName.appendChild(badge)
    } else if (ptype === 'zion') {
      const badge = document.createElement('span')
      badge.className = 'badge zion'
      badge.style.marginLeft = '6px'
      badge.textContent = 'ZION'
      tdName.appendChild(badge)
    }
    if (st.all_day_access) {
      const badge = document.createElement('span')
      badge.className = 'badge allowed'
      badge.style.marginLeft = '6px'
      badge.textContent = 'ALL-DAY'
      tdName.appendChild(badge)
    }
    if (st.waiting_area) {
      const badge = document.createElement('span')
      badge.className = 'badge waiting'
      badge.style.marginLeft = '6px'
      badge.textContent = 'WAITING AREA'
      tdName.appendChild(badge)
    }

    const tdNum = document.createElement('td')
    tdNum.textContent = st.student_number || '—'

    const tdSec = document.createElement('td')
    tdSec.textContent = st.course_section || '—'

    const tdSched = document.createElement('td')
    tdSched.className = 'dim'
    tdSched.textContent = schedText(st)

    const tdAct = document.createElement('td')
    const wrap = document.createElement('div')
    wrap.className = 'row-actions'
    const editBtn = document.createElement('button')
    editBtn.className = 'btn small ghost'
    editBtn.textContent = 'Edit'
    editBtn.addEventListener('click', () => fillForm(st))
    const delBtn = document.createElement('button')
    delBtn.className = 'btn small danger'
    delBtn.textContent = 'Delete'
    delBtn.addEventListener('click', async () => {
      if (!confirm(`Delete ${st.name}? Their card will no longer be recognized.`)) return
      await hope.students.remove(st.id)
      toast('Student deleted', 'ok')
      if (editingId === st.id) resetForm()
      refresh()
    })
    wrap.append(editBtn, delBtn)
    tdAct.appendChild(wrap)

    tr.append(tdUid, tdName, tdNum, tdSec, tdSched, tdAct)
    body.appendChild(tr)
  }
}

async function commitUid() {
  const input = $('#f-uid')
  const uid = normUid(input.value)
  if (!uid) {
    toast('No card data received. Tap the card again.', 'warn')
    return
  }
  input.value = uid
  const existing = await hope.students.getByUid(uid)
  if (existing && existing.id !== editingId) {
    toast(`This card is already registered to ${existing.name} — loaded it for editing.`, 'warn', 4500)
    fillForm(existing)
  }
}

async function save() {
  try {
    const data = {
      uid: normUid($('#f-uid').value),
      name: $('#f-name').value.trim(),
      student_number: $('#f-number').value.trim(),
      course_section: $('#f-section').value.trim(),
      photo: currentPhoto,
      person_type: personType(),
      all_day_access: $('#f-allday').checked,
      waiting_area: $('#f-waiting').checked,
      lunch_break_access: getAccessRadio('lunch_access'),
      dismissal_allowed: getAccessRadio('dismissal_access'),
      active: $('#f-active').checked
    }
    if (!data.name) return toast('A name is required.', 'err')
    if (!data.uid) return toast('Tap the card on the reader to capture the UID first.', 'err')
    const slots = []
    if (editingId) {
      await hope.students.update(editingId, data, slots)
      toast(`${data.name} updated`, 'ok')
    } else {
      await hope.students.create(data, slots)
      toast(`${data.name} registered`, 'ok')
    }
    resetForm()
    refresh()
  } catch (e) {
    toast(errMsg(e), 'err', 5000)
  }
}

const isoDate = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function logFilters() {
  return {
    from: $('#lf-from').value || '',
    to: $('#lf-to').value || '',
    tstart: $('#lf-tstart').value || '',
    tend: $('#lf-tend').value || '',
    result: $('#lf-result').value || ''
  }
}

let logFilterTimer = null
function onLogFilterChange() {
  clearTimeout(logFilterTimer)
  logFilterTimer = setTimeout(() => {
    logPage = 1
    loadLogs()
  }, 250)
}

function goLogPage(p) {
  logPage = Math.max(1, p)
  loadLogs()
}

const PER_PAGE = 20
let logPage = 1

const PERSON_TYPE_LABEL = { student: 'Student', visitor: 'Visitor', coach: 'Coach', employee: 'Employee', zion: 'Zion' }

function personTypeLabel(t) {
  return PERSON_TYPE_LABEL[t] || 'Student'
}

function setPersonType(t) {
  const raw = String(t || 'student').toLowerCase()
  const use = ['student', 'visitor', 'coach', 'employee', 'zion'].includes(raw) ? raw : 'student'
  const isStudent = use === 'student'
  $('#f-type').value = use
  $('#student-fields').classList.toggle('hidden', !isStudent)
  $('#non-student-note').classList.toggle('hidden', isStudent)
  $('#form-title').textContent = `Register ${personTypeLabel(use)}`
  $('#btn-save').textContent = isStudent ? 'Save Student' : `Save ${personTypeLabel(use)}`
}

function personType() {
  return $('#f-type').value || 'student'
}

async function loadLogs() {
  const res = await hope.logs.list(logFilters(), logPage)
  const rows = res.rows || []
  const total = Number(res.total) || 0
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE))

  if (logPage > totalPages) {
    logPage = totalPages
    return loadLogs()
  }

  $('#lg-info').textContent = `Page ${logPage} of ${totalPages}`
  $('#lg-first').disabled = $('#lg-prev').disabled = logPage <= 1
  $('#lg-next').disabled = $('#lg-last').disabled = logPage >= totalPages

  const body = $('#logs-body')
  body.innerHTML = ''
  $('#logs-count').textContent = `${total} record${total === 1 ? '' : 's'}`
  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="5" class="dim" style="text-align:center;padding:30px">No scan logs match the selected filters.</td></tr>'
    return
  }
  for (const r of rows) {
    const tr = document.createElement('tr')
    const cells = [r.scanned_at, r.uid, r.name || '—']
    for (const c of cells) {
      const td = document.createElement('td')
      td.textContent = c
      tr.appendChild(td)
    }
    const tdRes = document.createElement('td')
    tdRes.innerHTML = `<span class="badge ${r.result.toLowerCase()}">${r.result}</span>`
    const tdDet = document.createElement('td')
    tdDet.className = 'dim'
    tdDet.textContent = r.detail
    tr.appendChild(tdRes)
    tr.appendChild(tdDet)
    body.appendChild(tr)
  }
}

document.addEventListener('keydown', e => {
  if (!captureMode) return
  const input = $('#f-uid')
  if (e.key === 'Enter') {
    e.preventDefault()
    captureMode = false
    input.classList.remove('listening')
    commitUid()
  } else if (e.key === 'Escape') {
    e.preventDefault()
    captureMode = false
    input.classList.remove('listening')
    input.blur()
  } else if (e.key === 'Backspace') {
    e.preventDefault()
    input.value = input.value.slice(0, -1)
  } else if (e.key.length === 1) {
    e.preventDefault()
    if (input.value.length < 32) input.value += e.key.toUpperCase()
  }
})

$('#f-uid').addEventListener('focus', () => {
  captureMode = true
  $('#f-uid').classList.add('listening')
})
$('#f-uid').addEventListener('blur', () => {
  captureMode = false
  $('#f-uid').classList.remove('listening')
})

$('#btn-save').addEventListener('click', save)
$('#btn-cancel').addEventListener('click', resetForm)
$('#btn-refresh').addEventListener('click', refresh)
$('#f-type').addEventListener('change', e => setPersonType(e.target.value))
$('#photo-area').addEventListener('click', uploadPhoto)
$('#btn-remove-photo').addEventListener('click', removePhoto)
let searchTimer = null
$('#search').addEventListener('input', () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(refresh, 250)
})

$$('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    $$('.tab').forEach(t => t.classList.toggle('active', t === tab))
    $$('.tab-panel').forEach(p => p.classList.toggle('hidden', p.dataset.panel !== tab.dataset.tab))
    if (tab.dataset.tab === 'logs') loadLogs()
  })
})

$('#btn-refresh-logs').addEventListener('click', () => loadLogs())
$('#lg-first').addEventListener('click', () => goLogPage(1))
$('#lg-prev').addEventListener('click', () => goLogPage(logPage - 1))
$('#lg-next').addEventListener('click', () => goLogPage(logPage + 1))
$('#lg-last').addEventListener('click', () => goLogPage(999999))
$('#btn-export').addEventListener('click', async () => {
  const path = await hope.logs.export(logFilters())
  toast(path ? `Exported to ${path}` : 'Export cancelled', path ? 'ok' : 'info')
})
$('#btn-clear-logs').addEventListener('click', async () => {
  if (!confirm('Delete ALL scan logs? This cannot be undone.')) return
  await hope.logs.clear()
  loadLogs()
  toast('Scan logs cleared', 'ok')
})

for (const id of ['lf-from', 'lf-to', 'lf-tstart', 'lf-tend', 'lf-result']) {
  const el = document.getElementById(id)
  el.addEventListener('change', onLogFilterChange)
  el.addEventListener('input', onLogFilterChange)
}

$('#lf-today').addEventListener('click', () => {
  const d = isoDate(new Date())
  $('#lf-from').value = d
  $('#lf-to').value = d
  logPage = 1
  loadLogs()
})

$('#lf-7d').addEventListener('click', () => {
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - 6)
  $('#lf-from').value = isoDate(from)
  $('#lf-to').value = isoDate(to)
  logPage = 1
  loadLogs()
})

$('#lf-clear').addEventListener('click', () => {
  for (const id of ['lf-from', 'lf-to', 'lf-tstart', 'lf-tend', 'lf-result']) document.getElementById(id).value = ''
  logPage = 1
  loadLogs()
})

$('#btn-save-settings').addEventListener('click', async () => {
  const schedule = {}
  for (const row of document.querySelectorAll('#dismissal-schedule-box .sched-row')) {
    const grade = row.dataset.grade
    const time = row.querySelector('.sched-time').value
    if (grade && time) schedule[grade] = time
  }
  await hope.settings.set({
    schoolName: $('#s-school').value.trim() || 'HOPE ID SCANNER',
    dismissalSchedule: JSON.stringify(schedule)
  })
  $('#reg-school').textContent = $('#s-school').value.trim() || 'HOPE ID SCANNER'
  dismissalSchedule = schedule
  toast('Settings saved', 'ok')
})

function renderDismissalSchedule() {
  const box = $('#dismissal-schedule-box')
  if (!box) return
  box.innerHTML = ''
  for (const grade of GRADES) {
    const row = document.createElement('div')
    row.className = 'sched-row'
    row.dataset.grade = grade

    const label = document.createElement('span')
    label.className = 'sched-label'
    label.textContent = grade

    const timeInput = document.createElement('input')
    timeInput.type = 'time'
    timeInput.className = 'sched-time'
    timeInput.value = dismissalSchedule[grade] || ''
    timeInput.placeholder = '--:--'

    row.append(label, timeInput)
    box.appendChild(row)
  }
}

function loadSettings() {
  hope.settings.get().then(s => {
    $('#reg-school').textContent = s.schoolName || 'HOPE ID SCANNER'
    $('#s-school').value = s.schoolName || ''
    try {
      dismissalSchedule = JSON.parse(s.dismissalSchedule || '{}')
    } catch (_) {
      dismissalSchedule = {}
    }
    renderDismissalSchedule()
  })
}

resetForm()
refresh()
loadSettings()
