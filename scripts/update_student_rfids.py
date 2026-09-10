import sqlite3
import os

DB_PATH = os.path.join(os.environ.get('APPDATA', ''), 'hope-id-scanner', 'hope-scanner.db')

UPDATES = [
    (1245, '0002012934'),
    (1161, '0008990991'),
    (1104, '0004483786'),
    (1219, '0004241246'),
    (1250, '0001751969'),
    (1081, '0005741291'),
    (950,  '0005794130'),
    (836,  '0005731073'),
    (1197, '0004862311'),
    (1199, '0004912403'),
    (1200, '0006298218'),
    (788,  '0009413835'),
    (930,  '0001063362'),
    (1267, '0002058438'),
    (1212, '0002076343'),
    (996,  '0004501648'),
]

print(f'Database: {DB_PATH}')

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

updated = 0
for sid, rfid in UPDATES:
    cur.execute('UPDATE students SET uid = ? WHERE id = ?', (rfid, sid))
    if cur.rowcount != 1:
        print(f'  WARNING: no row updated for id {sid}')
    else:
        updated += 1

conn.commit()

# verify
print(f'\nUpdated: {updated}')
print('Verify:')
for sid, rfid in UPDATES:
    row = cur.execute('SELECT id, uid, name FROM students WHERE id = ?', (sid,)).fetchone()
    print(f'  [{row[0]}] {row[2]} -> {row[1]}')

conn.close()