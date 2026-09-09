import openpyxl, sqlite3, os, sys
sys.stdout.reconfigure(encoding='utf-8')

DB_PATH = os.path.join(os.environ.get('APPDATA',''), 'hope-id-scanner', 'hope-scanner.db')
conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

wb = openpyxl.load_workbook(r'C:\Users\HowardKevinVelos\Downloads\Lunch_Break_Summary_Colossians.xlsx', read_only=True)
ws = wb.active
rows = list(ws.iter_rows(values_only=True))

updated = 0
for i in range(8, 33):
    name = rows[i][0]
    if not name:
        continue
    allowed = bool(rows[i][1])
    waiting = bool(rows[i][2])
    notallowed = bool(rows[i][3])

    lunch_break_access = 1 if allowed or waiting else 0
    waiting_area = 1 if waiting else 0
    dismissal_allowed = 1 if allowed or waiting else 0

    name = str(name).strip()
    cur.execute(
        'UPDATE students SET lunch_break_access = ?, waiting_area = ?, dismissal_allowed = ? WHERE name = ?',
        (lunch_break_access, waiting_area, dismissal_allowed, name)
    )
    if cur.rowcount:
        updated += 1
        print(f'Updated: {name} | lunch={lunch_break_access} waiting={waiting_area} dismiss={dismissal_allowed}')
    else:
        print(f'NOT FOUND: {name}')

conn.commit()
print(f'\nTotal students updated: {updated}')
conn.close()
