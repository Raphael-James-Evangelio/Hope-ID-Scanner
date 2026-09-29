import sqlite3, json

conn = sqlite3.connect(r'C:\Users\HowardKevinVelos\Documents\HOPE ID SCANNER\seed\hope-scanner.db')
cur = conn.cursor()

print('Students:', cur.execute('SELECT COUNT(*) FROM students').fetchone()[0])
print('Waiting area:', cur.execute('SELECT COUNT(*) FROM students WHERE waiting_area=1').fetchone()[0])
print('Waiting area + lunch allowed:', cur.execute('SELECT COUNT(*) FROM students WHERE waiting_area=1 AND lunch_break_access=1').fetchone()[0])
print('Lunch allowed total:', cur.execute('SELECT COUNT(*) FROM students WHERE lunch_break_access=1').fetchone()[0])
print('Dismissal allowed total:', cur.execute('SELECT COUNT(*) FROM students WHERE dismissal_allowed=1').fetchone()[0])

cur.execute("SELECT value FROM settings WHERE key='attendanceSchedule'")
row = cur.fetchone()
schedule = json.loads(row[0]) if row and row[0] else {}
DAYS = {1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri'}


def show(entry):
    return (f"AM in {entry.get('amIn', '-')} · AM out {entry.get('amOut', '-')} "
            f"· PM in {entry.get('pmIn', '-')} · PM out {entry.get('pmOut', '-')}")


print('\nAttendance schedule:')
for grade, entry in sorted(schedule.items()):
    print(f'  {grade} [every day]: {show(entry.get("base") or {})}')
    for dow, label in DAYS.items():
        day = (entry.get('days') or {}).get(str(dow))
        if day:
            print(f'  {grade} [{label}]: {show(day)}')

# Sample records
print('\nSample students with waiting area:')
for r in cur.execute('SELECT name, course_section, waiting_area, lunch_break_access, dismissal_allowed FROM students WHERE waiting_area=1 LIMIT 3'):
    print(' ', r)

conn.close()
