import sqlite3
import os
import sys
import openpyxl

DB_PATH = os.path.join(os.environ.get('APPDATA', ''), 'hope-id-scanner', 'hope-scanner.db')
EXCEL_PATH = r'C:\Users\HowardKevinVelos\Downloads\2026 Employee ID Numbers.xlsx'

print(f'Database: {DB_PATH}')
print(f'Excel:    {EXCEL_PATH}')

if not os.path.exists(DB_PATH):
    print('ERROR: Database not found')
    sys.exit(1)

wb = openpyxl.load_workbook(EXCEL_PATH, read_only=True)
ws = wb.active
rows = list(ws.iter_rows(values_only=True))
header = rows[0]
data_rows = rows[2:]

print(f'\nHeader: {header}')
print(f'Employee rows in Excel: {len(data_rows)}')

def norm_rfid(v):
    if v is None:
        return None
    s = str(v).strip()
    if s == '':
        return None
    return s

def build_name(surname, first, middle):
    surname = str(surname).strip() if surname else ''
    first = str(first).strip() if first else ''
    middle = str(middle).strip() if middle else ''
    if not middle or middle.lower() in ('(no middle name)', 'n/a', 'none'):
        middle = ''
    full = f'{first} {middle}'.strip() if middle else first
    return f'{surname}, {full}'.strip()

def build_employee_number(sno, eid):
    return str(eid).strip() if eid else None

conn = sqlite3.connect(DB_PATH)
conn.execute('PRAGMA foreign_keys = OFF')
cur = conn.cursor()

cur.execute("SELECT COUNT(*) FROM students WHERE person_type = 'employee'")
print(f'Existing employees in DB: {cur.fetchone()[0]}')

existing_student_numbers = {r[0] for r in cur.execute("SELECT student_number FROM students WHERE student_number IS NOT NULL").fetchall()}

# --- Rebuild students table so uid can be NULL (blank RFID) while keeping UNIQUE ---
print('\nRebuilding students table to allow blank RFID...')
cur.execute('BEGIN')
cur.execute('''
    CREATE TABLE students_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uid TEXT UNIQUE,
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
    )
''')
cur.execute('INSERT INTO students_new (id, uid, student_number, name, course_section, photo, person_type, all_day_access, waiting_area, lunch_break_access, dismissal_allowed, active, created_at) SELECT id, uid, student_number, name, course_section, photo, person_type, all_day_access, waiting_area, lunch_break_access, dismissal_allowed, active, created_at FROM students')
cur.execute('DROP TABLE students')
cur.execute('ALTER TABLE students_new RENAME TO students')
cur.execute("UPDATE sqlite_sequence SET name = 'students' WHERE name = 'students_new'")
conn.commit()

# --- Import employees ---
inserted = 0
blank_rfid = 0
skipped = 0

employee_rows = []
for row in data_rows:
    sno, eid, hired, surname, first, middle, rfid = row[:7]
    if surname is None and first is None:
        continue
    rfid = norm_rfid(rfid)
    if rfid is not None and len(rfid) < 10 and rfid.isdigit():
        rfid = rfid.zfill(10)
    employee_rows.append((sno, eid, surname, first, middle, rfid))

rfid_counts = {}
for _, _, _, _, _, rfid in employee_rows:
    if rfid is not None:
        rfid_counts[rfid] = rfid_counts.get(rfid, 0) + 1

duplicated_rfids = {rfid for rfid, count in rfid_counts.items() if count > 1}
if duplicated_rfids:
    print(f'Duplicated RFID numbers found; leaving blank for all matching rows: {sorted(duplicated_rfids)}')

for sno, eid, surname, first, middle, rfid in employee_rows:
    if rfid in duplicated_rfids:
        rfid = None

    name = build_name(surname, first, middle)
    employee_number = build_employee_number(sno, eid)

    if employee_number and employee_number in existing_student_numbers:
        print(f'  SKIP student_number collision: {employee_number} -> {name}')
        skipped += 1
        continue

    cur.execute(
        'INSERT INTO students (uid, student_number, name, course_section, photo, person_type, all_day_access, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        (rfid, employee_number, name, '', '', 'employee', 0, 1)
    )
    if rfid is None:
        blank_rfid += 1
    inserted += 1

conn.commit()
conn.close()

print(f'\nDone!')
print(f'  Imported: {inserted} employees')
print(f'  Blank RFID: {blank_rfid}')
print(f'  Skipped: {skipped}')