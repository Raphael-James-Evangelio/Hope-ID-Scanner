const { app } = require('electron')
const path = require('path')
const fs = require('fs')
const { DatabaseSync } = require('node:sqlite')

let db = null

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const LUNCH_START = '11:50'
const LUNCH_END = '13:00'
const GRADES = ['Nursery', 'Pre-Kinder', 'Kinder', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12']
const PERSON_TYPES = ['student', 'visitor', 'coach', 'employee', 'zion']

function seedDbIfMissing() {
  const dbPath = path.join(app.getPath('userData'), 'hope-scanner.db')
  if (fs.existsSync(dbPath)) return
  const seedPath = path.join(__dirname, '..', 'seed', 'hope-scanner.db')
  if (!fs.existsSync(seedPath)) return
  try {
    fs.writeFileSync(dbPath, fs.readFileSync(seedPath))
  } catch (_) {}
}

function init() {
  seedDbIfMissing()
  db = new DatabaseSync(path.join(app.getPath('userData'), 'hope-scanner.db'))
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec(`
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uid TEXT NOT NULL UNIQUE,
      student_number TEXT UNIQUE,
      name TEXT NOT NULL,
      course_section TEXT NOT NULL DEFAULT '',
      photo TEXT NOT NULL DEFAULT '',
      person_type TEXT NOT NULL DEFAULT 'student',
      all_day_access INTEGER NOT NULL DEFAULT 0,
      waiting_area INTEGER NOT NULL DEFAULT 0,
      lunch_break_access INTEGER NOT NULL DEFAULT 0,
      dismissal_allowed INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE IF NOT EXISTS time_slots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      days TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS scan_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uid TEXT NOT NULL,
      student_id INTEGER,
      name TEXT,
      result TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '',
      scanned_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `)
  db.prepare("INSERT OR IGNORE INTO settings(key, value) VALUES ('schoolName', 'HOPE ID SCANNER')").run()

  try { db.exec("ALTER TABLE students ADD COLUMN photo TEXT NOT NULL DEFAULT ''") } catch (_) {}
  try { db.exec("ALTER TABLE students ADD COLUMN person_type TEXT NOT NULL DEFAULT 'student'") } catch (_) {}
  try { db.exec("UPDATE students SET person_type = 'student' WHERE person_type IS NULL OR person_type = ''") } catch (_) {}
  try { db.exec("ALTER TABLE students ADD COLUMN waiting_area INTEGER NOT NULL DEFAULT 0") } catch (_) {}
  try { db.exec("ALTER TABLE students ADD COLUMN lunch_break_access INTEGER NOT NULL DEFAULT 0") } catch (_) {}
  try { db.exec("ALTER TABLE students ADD COLUMN dismissal_allowed INTEGER NOT NULL DEFAULT 0") } catch (_) {}
}

function normalizeUid(raw) {
  return String(raw || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase()
}

function toMinutes(hm) {
  const [h, m] = String(hm).split(':').map(Number)
  return h * 60 + m
}

function inRange(t, a, b) {
  if (a === b) return t >= a && t < a + 1440
  if (a < b) return t >= a && t < b
  return t >= a || t < b
}

function dismissalSchedule() {
  let raw
  try {
    raw = db.prepare("SELECT value FROM settings WHERE key = 'dismissalSchedule'").get()
  } catch (_) {}
  if (!raw || !raw.value) return {}
  try {
    return JSON.parse(raw.value)
  } catch (_) {
    return {}
  }
}

function friendlyError(e) {
  const msg = String(e && e.message) || 'Database error'
  if (/students\.uid/.test(msg)) return new Error('This card UID is already registered.')
  if (/student_number/.test(msg)) return new Error('That student number is already used.')
  return e
}

function validateSlots(slots) {
  if (!Array.isArray(slots)) throw new Error('Invalid schedule data.')
  for (const s of slots) {
    const days = Array.isArray(s.days) ? s.days.filter(d => Number.isInteger(d) && d >= 0 && d <= 6) : []
    if (!days.length) throw new Error('Each time window needs at least one day selected.')
    if (!TIME_RE.test(s.start_time || '') || !TIME_RE.test(s.end_time || '')) throw new Error('Time windows need valid HH:MM times.')
  }
}

function normPersonType(v) {
  const t = String(v || 'student').toLowerCase()
  return PERSON_TYPES.includes(t) ? t : 'student'
}

function slotsRaw(studentId) {
  return db.prepare('SELECT * FROM time_slots WHERE student_id = ? ORDER BY start_time').all(studentId)
}

function insertSlots(studentId, slots) {
  db.exec('BEGIN')
  try {
    db.prepare('DELETE FROM time_slots WHERE student_id = ?').run(studentId)
    const ins = db.prepare('INSERT INTO time_slots (student_id, days, start_time, end_time) VALUES (?, ?, ?, ?)')
    for (const s of slots) {
      const days = [...new Set(s.days.map(Number))].sort((a, b) => a - b).join(',')
      ins.run(studentId, days, s.start_time, s.end_time)
    }
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}

function pub(st) {
  return {
    id: st.id,
    uid: st.uid,
    name: st.name,
    student_number: st.student_number,
    course_section: st.course_section,
    photo: st.photo || '',
    person_type: st.person_type || 'student',
    all_day_access: !!st.all_day_access,
    waiting_area: !!st.waiting_area,
    lunch_break_access: !!st.lunch_break_access,
    dismissal_allowed: !!st.dismissal_allowed,
    active: !!st.active,
    created_at: st.created_at
  }
}

function studentsList(q) {
  let sql = 'SELECT * FROM students'
  const params = []
  if (q) {
    sql += ' WHERE uid LIKE ? OR name LIKE ? OR student_number LIKE ? OR course_section LIKE ?'
    const like = `%${q}%`
    params.push(like, like, like, like)
  }
  sql += ' ORDER BY name COLLATE NOCASE'
  const rows = db.prepare(sql).all(...params)
  return rows.map(r => ({ ...pub(r), slots: [] }))
}

function studentByUid(uid) {
  const row = db.prepare('SELECT * FROM students WHERE uid = ?').get(normalizeUid(uid))
  if (!row) return null
  return { ...pub(row), slots: slotsRaw(row.id) }
}

function studentCreate(data, slots) {
  if (!data.name || !String(data.name).trim()) throw new Error('A name is required.')
  const uid = normalizeUid(data.uid)
  if (!uid) throw new Error('Card UID is required. Tap the card first.')
  validateSlots(slots)
  const personType = normPersonType(data.person_type)
  try {
    const res = db.prepare(
      'INSERT INTO students (uid, student_number, name, course_section, photo, person_type, all_day_access, waiting_area, lunch_break_access, dismissal_allowed, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(uid, data.student_number || null, String(data.name).trim(), data.course_section || '', data.photo || '', personType, data.all_day_access ? 1 : 0, data.waiting_area ? 1 : 0, data.lunch_break_access ? 1 : 0, data.dismissal_allowed ? 1 : 0, data.active === false ? 0 : 1)
    insertSlots(Number(res.lastInsertRowid), slots)
    return Number(res.lastInsertRowid)
  } catch (e) {
    throw friendlyError(e)
  }
}

function studentUpdate(id, data, slots) {
  if (!data.name || !String(data.name).trim()) throw new Error('A name is required.')
  const uid = normalizeUid(data.uid)
  if (!uid) throw new Error('Card UID is required.')
  validateSlots(slots)
  const personType = normPersonType(data.person_type)
  try {
    db.prepare(
      'UPDATE students SET uid = ?, student_number = ?, name = ?, course_section = ?, photo = ?, person_type = ?, all_day_access = ?, waiting_area = ?, lunch_break_access = ?, dismissal_allowed = ?, active = ? WHERE id = ?'
    ).run(uid, data.student_number || null, String(data.name).trim(), data.course_section || '', data.photo || '', personType, data.all_day_access ? 1 : 0, data.waiting_area ? 1 : 0, data.lunch_break_access ? 1 : 0, data.dismissal_allowed ? 1 : 0, data.active === false ? 0 : 1, id)
    insertSlots(id, slots)
    return id
  } catch (e) {
    throw friendlyError(e)
  }
}

function studentDelete(id) {
  const row = db.prepare('SELECT photo FROM students WHERE id = ?').get(id)
  db.prepare('DELETE FROM students WHERE id = ?').run(id)
  if (row && row.photo) {
    try { fs.unlinkSync(path.join(app.getPath('userData'), 'photos', row.photo)) } catch (_) {}
  }
  return true
}

function settingsGet() {
  const out = {}
  for (const row of db.prepare('SELECT key, value FROM settings').all()) out[row.key] = row.value
  return out
}

function settingsSet(patch) {
  const up = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
  for (const [k, v] of Object.entries(patch || {})) up.run(String(k), String(v))
  return settingsGet()
}

function addLog(uid, studentId, name, result, detail) {
  db.prepare('INSERT INTO scan_logs (uid, student_id, name, result, detail) VALUES (?, ?, ?, ?, ?)').run(uid, studentId, name || '', result, detail || '')
}

function periodLabel(period) {
  return period === 'pm' ? 'PM' : 'AM'
}

function alreadyTimeInToday(uid, period) {
  const detail = `Time in (${periodLabel(period)})`
  const row = db.prepare(
    "SELECT COUNT(*) AS c FROM scan_logs WHERE uid = ? AND scanned_at LIKE date('now','localtime') || '%' AND detail = ?"
  ).get(uid, detail)
  return Number(row.c) > 0
}

function alreadyTimeOutToday(uid, period) {
  const detail = `Time out (${periodLabel(period)})%`
  const row = db.prepare(
    "SELECT COUNT(*) AS c FROM scan_logs WHERE uid = ? AND scanned_at LIKE date('now','localtime') || '%' AND result = 'ALLOWED' AND detail LIKE ?"
  ).get(uid, detail)
  return Number(row.c) > 0
}

function logsQuery(filters = {}, limit = null, offset = 0) {
  const f = {}
  if (typeof filters.from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(filters.from)) f.from = filters.from
  if (typeof filters.to === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(filters.to)) f.to = filters.to
  if (typeof filters.tstart === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(filters.tstart)) f.tstart = filters.tstart
  if (typeof filters.tend === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(filters.tend)) f.tend = filters.tend
  if (['in', 'out', 'ami', 'amo', 'pmi', 'pmo'].includes(filters.result)) f.result = filters.result

  let where = ''
  const params = []

  if (f.from) {
    where += ' AND scanned_at >= ?'
    params.push(`${f.from} 00:00:00`)
  }
  if (f.to) {
    where += ' AND scanned_at <= ?'
    params.push(`${f.to} 23:59:59`)
  }

  if (f.tstart && f.tend && f.tstart > f.tend) {
    where += ' AND (substr(scanned_at, 12, 5) >= ? OR substr(scanned_at, 12, 5) <= ?)'
    params.push(f.tstart, f.tend)
  } else {
    if (f.tstart) {
      where += ' AND substr(scanned_at, 12, 5) >= ?'
      params.push(f.tstart)
    }
    if (f.tend) {
      where += ' AND substr(scanned_at, 12, 5) <= ?'
      params.push(f.tend)
    }
  }

  if (f.result) {
    const detailMap = {
      in: " AND detail LIKE 'Time in%'",
      out: " AND detail LIKE 'Time out%'",
      ami: " AND detail = 'Time in (AM)'",
      amo: " AND detail LIKE 'Time out (AM)%'",
      pmi: " AND detail = 'Time in (PM)'",
      pmo: " AND detail LIKE 'Time out (PM)%'"
    }
    where += detailMap[f.result]
  }

  const total = Number(db.prepare('SELECT COUNT(*) AS c FROM scan_logs WHERE 1=1' + where).get(...params).c)

  let sql = 'SELECT * FROM scan_logs WHERE 1=1' + where + ' ORDER BY id DESC'
  if (limit) sql += ' LIMIT ? OFFSET ?'

  const stmt = db.prepare(sql)
  const rows = limit ? stmt.all(...params, limit, offset) : stmt.all(...params)

  return { rows, total }
}

function logsClear() {
  db.prepare('DELETE FROM scan_logs').run()
  return true
}

function fmtTime12(hm) {
  let [h, m] = String(hm).split(':').map(Number)
  const ap = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${h}:${String(m).padStart(2, '0')} ${ap}`
}

function dismissalTimeFor(courseSection) {
  const schedule = dismissalSchedule()
  const section = String(courseSection || '').trim()
  return schedule[section] || null
}

function gradeFromSection(courseSection) {
  const section = String(courseSection || '').trim()
  if (GRADES.includes(section)) return section
  for (const g of GRADES) {
    if (section.startsWith(g)) return g
  }
  return section
}

function evaluateAndLog(raw, period = 'am') {
  const uid = normalizeUid(raw)
  const now = new Date()
  const dow = now.getDay()
  const dayName = DAY_NAMES[dow]
  const pad = n => String(n).padStart(2, '0')
  const nowFull = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
  const mins = now.getHours() * 60 + now.getMinutes()
  const pl = periodLabel(period)
  const base = {
    uid,
    now: nowFull,
    dayName,
    date: now.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  }

  if (!uid) return { ...base, status: 'invalid', title: 'READ ERROR', reason: 'Empty card data' }

  const st = db.prepare('SELECT * FROM students WHERE uid = ?').get(uid)

  if (!st) {
    addLog(uid, null, null, 'UNKNOWN', 'Card not registered')
    return { ...base, status: 'unknown', title: 'CARD NOT RECOGNIZED', reason: 'This card is not registered' }
  }

  const student = pub(st)

  if (!st.active) {
    addLog(uid, st.id, st.name, 'INACTIVE', 'Card deactivated')
    return { ...base, status: 'inactive', title: 'CARD DEACTIVATED', reason: 'Please contact the registrar office', student }
  }

  const personType = st.person_type || 'student'

  if (personType !== 'student') {
    const label = personType === 'coach' ? 'Coach' : 'Visitor'
    const timeoutDetail = `Time out (${pl})`
    addLog(uid, st.id, st.name, 'ALLOWED', timeoutDetail)
    return { ...base, status: 'allowed', title: 'ALLOWED TO GO OUT', reason: `${label} · always allowed (${pl} time out)`, student }
  }

  if (alreadyTimeOutToday(uid, period)) {
    return { ...base, status: 'already', title: 'ALREADY SCANNED', reason: `${pl} time out already recorded`, student }
  }

  const timeoutDetail = `Time out (${pl})`

  if (st.all_day_access) {
    addLog(uid, st.id, st.name, 'ALLOWED', timeoutDetail)
    return { ...base, status: 'allowed', title: 'ALLOWED TO GO OUT', reason: `All-day access (${pl} time out)`, student }
  }

  const lunchStart = toMinutes(LUNCH_START)
  const lunchEnd = toMinutes(LUNCH_END)
  const inLunch = inRange(mins, lunchStart, lunchEnd)

  if (period === 'am') {
    const inLunchBreak = !!st.lunch_break_access && inLunch

    if (inLunchBreak) {
      if (st.waiting_area) {
        addLog(uid, st.id, st.name, 'ALLOWED', timeoutDetail)
        const reason = `Waiting area only · lunch ${fmtTime12(LUNCH_START)}–${fmtTime12(LUNCH_END)} (${pl} time out)`
        return { ...base, status: 'allowed_waiting', title: 'WAITING AREA ONLY', reason, student }
      }
      addLog(uid, st.id, st.name, 'ALLOWED', timeoutDetail)
      const reason = `Within lunch break ${fmtTime12(LUNCH_START)}–${fmtTime12(LUNCH_END)} (${pl} time out)`
      return { ...base, status: 'allowed', title: 'ALLOWED TO GO OUT', reason, student }
    }

    let reason = 'Not allowed to go out'
    if (!inLunch) reason = `Not allowed · outside lunch break (${pl} time out is only during lunch ${fmtTime12(LUNCH_START)}–${fmtTime12(LUNCH_END)})`
    else if (!st.lunch_break_access) reason = `Not allowed · lunch break not permitted`
    else reason = `Not allowed · lunch break ends at ${fmtTime12(LUNCH_END)}`

    addLog(uid, st.id, st.name, 'DENIED', timeoutDetail + ' · ' + reason)
    return { ...base, status: 'denied', title: 'NOT ALLOWED', reason, student }
  } else {
    let afterDismissal = false
    let dismissalTime = null
    const grade = gradeFromSection(st.course_section)
    const dt = dismissalTimeFor(grade)
    if (dt) {
      dismissalTime = dt
      afterDismissal = mins >= toMinutes(dt)
    }

    if (afterDismissal && st.dismissal_allowed) {
      addLog(uid, st.id, st.name, 'ALLOWED', timeoutDetail)
      const reason = `After dismissal (${fmtTime12(dismissalTime)}) (${pl} time out)`
      return { ...base, status: 'allowed', title: 'ALLOWED TO GO OUT', reason, student }
    }

    let reason = 'Not allowed to go out'
    if (!st.dismissal_allowed) reason = 'Not allowed · dismissal not permitted'
    else if (dismissalTime) reason = `Not allowed · dismissal at ${fmtTime12(dismissalTime)}`
    else reason = 'Not allowed · dismissal time not configured'

    addLog(uid, st.id, st.name, 'DENIED', timeoutDetail + ' · ' + reason)
    return { ...base, status: 'denied', title: 'NOT ALLOWED', reason, student }
  }
}

function evaluateIn(raw, period = 'am') {
  const uid = normalizeUid(raw)
  const now = new Date()
  const pad = n => String(n).padStart(2, '0')
  const nowFull = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
  const pl = periodLabel(period)
  const base = {
    uid,
    now: nowFull,
    dayName: DAY_NAMES[now.getDay()],
    date: now.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  }

  if (!uid) return { ...base, status: 'invalid', title: 'READ ERROR', reason: 'Empty card data' }

  const st = db.prepare('SELECT * FROM students WHERE uid = ?').get(uid)

  if (!st) {
    addLog(uid, null, null, 'UNKNOWN', 'Card not registered')
    return { ...base, status: 'unknown', title: 'CARD NOT RECOGNIZED', reason: 'This card is not registered' }
  }

  if (!st.active) {
    addLog(uid, st.id, st.name, 'INACTIVE', 'Card deactivated')
    return { ...base, status: 'inactive', title: 'CARD DEACTIVATED', reason: 'Please contact the registrar office', student: pub(st) }
  }

  const personType = st.person_type || 'student'

  if (personType !== 'student') {
    const label = personType === 'coach' ? 'Coach' : 'Visitor'
    addLog(uid, st.id, st.name, 'ALLOWED', `Time in (${pl})`)
    return { ...base, status: 'allowed', title: `${pl} TIME IN`, reason: `${label} · time in recorded`, student: pub(st) }
  }

  if (alreadyTimeInToday(uid, period)) {
    return { ...base, status: 'already', title: 'TIME IN RECORDED', reason: `${pl} time in already recorded`, student: pub(st), slots: [] }
  }

  addLog(uid, st.id, st.name, 'ALLOWED', `Time in (${pl})`)
  return { ...base, status: 'allowed', title: `${pl} TIME IN`, reason: `${pl} time in recorded`, student: pub(st), slots: [] }
}

function stats() {
  const one = sql => Number(db.prepare(sql).get().c)
  const today = "date('now','localtime')"
  return {
    students: one('SELECT COUNT(*) AS c FROM students'),
    scansToday: one(`SELECT COUNT(*) AS c FROM scan_logs WHERE scanned_at LIKE ${today} || '%'`),
    allowedToday: one(`SELECT COUNT(*) AS c FROM scan_logs WHERE scanned_at LIKE ${today} || '%' AND result = 'ALLOWED'`),
    deniedToday: one(`SELECT COUNT(*) AS c FROM scan_logs WHERE scanned_at LIKE ${today} || '%' AND result <> 'ALLOWED'`)
  }
}

module.exports = {
  init,
  normalizeUid,
  studentsList,
  studentByUid,
  studentCreate,
  studentUpdate,
  studentDelete,
  settingsGet,
  settingsSet,
  logsQuery,
  logsClear,
  evaluateAndLog,
  evaluateIn,
  stats,
  dismissalSchedule,
  dismissalTimeFor,
  gradeFromSection,
  GRADES,
  PERSON_TYPES
}
