import openpyxl, sqlite3, os, sys
sys.stdout.reconfigure(encoding='utf-8')

DB_PATH = os.path.join(os.environ.get('APPDATA',''), 'hope-id-scanner', 'hope-scanner.db')
conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

wb = openpyxl.load_workbook(r'C:\Users\HowardKevinVelos\Downloads\Lunch_Break_Summary_Colossians.xlsx', read_only=True)
ws = wb.active
rows = list(ws.iter_rows(values_only=True))

# Names are rows 8-32, columns: 0=name, 1=allowed, 2=waiting, 3=not allowed
for i in range(8, 33):
    name = rows[i][0]
    if not name:
        continue
    allowed = rows[i][1]
    waiting = rows[i][2]
    notallowed = rows[i][3]
    
    # Find in DB by name
    cur.execute('SELECT id, uid, name, course_section, waiting_area, lunch_break_access, dismissal_allowed FROM students WHERE name = ?', (str(name).strip(),))
    row = cur.fetchone()
    status = 'Allowed' if allowed else ('Waiting' if waiting else ('Not allowed' if notallowed else 'UNKNOWN'))
    
    if row:
        print(f'FOUND: {name} | new_status={status} | DB: id={row[0]} uid={row[1]} section={row[3]} waiting={row[4]} lunch={row[5]} dismiss={row[6]}')
    else:
        print(f'MISSING: {name} | new_status={status}')
