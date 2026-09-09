import sqlite3, json, os

DB_PATH = os.path.join(os.environ.get('APPDATA', ''), 'hope-id-scanner', 'hope-scanner.db')
conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

schedule = {
    'Grade 1': '12:05',
    'Grade 2': '14:20',
    'Grade 3': '15:20',
    'Grade 4': '16:35',
    'Grade 5': '16:35',
    'Grade 6': '16:35',
    'Grade 7': '16:55',
    'Grade 8': '16:55',
    'Grade 9': '16:55',
    'Grade 10': '16:55',
    'Grade 11': '16:15',
    'Grade 12': '16:15',
}

sql = "INSERT INTO settings (key, value) VALUES ('dismissalSchedule', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
cur.execute(sql, (json.dumps(schedule),))
conn.commit()

cur.execute("SELECT value FROM settings WHERE key = 'dismissalSchedule'")
row = cur.fetchone()
parsed = json.loads(row[0])
print('Dismissal schedule saved:')
for grade, time in parsed.items():
    h, m = int(time[:2]), int(time[3:])
    ap = 'AM' if h < 12 else 'PM'
    h12 = h % 12 or 12
    print(f'  {grade}: {h12}:{m:02d} {ap}')

conn.close()
