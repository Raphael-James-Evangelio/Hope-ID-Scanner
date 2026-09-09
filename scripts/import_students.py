import sqlite3
import openpyxl
import os
import sys

DB_PATH = os.path.join(os.environ.get('APPDATA', ''), 'hope-id-scanner', 'hope-scanner.db')
EXCEL_PATH = r'C:\Users\HowardKevinVelos\Documents\new student lists\ID LIST 2026-2027 - EXTRACTED.xlsx'

print(f'Database: {DB_PATH}')
print(f'Excel:    {EXCEL_PATH}')

if not os.path.exists(DB_PATH):
    print('ERROR: Database not found')
    sys.exit(1)

wb = openpyxl.load_workbook(EXCEL_PATH, read_only=True)
ws = wb.active
rows = list(ws.iter_rows(values_only=True))
header = rows[0]
data_rows = rows[1:]

print(f'\nHeader: {header}')
print(f'Total students in Excel: {len(data_rows)}')

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

cur.execute('DELETE FROM time_slots')
cur.execute('DELETE FROM students')
conn.commit()
print('Cleared existing students and time_slots')

inserted = 0
skipped = 0

for row in data_rows:
    name, grade_level, section, rfid, timeout_status = row

    if not rfid or not str(rfid).strip():
        skipped += 1
        continue

    rfid = str(rfid).strip()
    name = str(name).strip() if name else ''
    grade_level = str(grade_level).strip() if grade_level else ''
    section = str(section).strip() if section else ''
    timeout_status = str(timeout_status).strip() if timeout_status else ''

    course_section = f'{grade_level} - {section}' if section and section != 'None' else grade_level

    all_day_access = 0
    waiting_area = 0
    lunch_break_access = 0
    dismissal_allowed = 0

    if timeout_status == 'Allowed':
        lunch_break_access = 1
        dismissal_allowed = 1
    elif timeout_status == 'Allowed in waiting area':
        waiting_area = 1
        dismissal_allowed = 1
        lunch_break_access = 1
    elif timeout_status == 'Not allowed':
        lunch_break_access = 0
        dismissal_allowed = 0
    else:
        lunch_break_access = 0
        dismissal_allowed = 0

    cur.execute(
        'INSERT INTO students (uid, student_number, name, course_section, photo, all_day_access, waiting_area, lunch_break_access, dismissal_allowed, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        (rfid, None, name, course_section, '', all_day_access, waiting_area, lunch_break_access, dismissal_allowed, 1)
    )
    inserted += 1

conn.commit()
conn.close()

print(f'\nDone!')
print(f'  Inserted: {inserted}')
print(f'  Skipped (no RFID): {skipped}')
print(f'  Total: {inserted + skipped}')
