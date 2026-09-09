import sqlite3, json

conn = sqlite3.connect(r'C:\Users\HowardKevinVelos\Documents\HOPE ID SCANNER\seed\hope-scanner.db')
cur = conn.cursor()

print('Students:', cur.execute('SELECT COUNT(*) FROM students').fetchone()[0])
print('Waiting area:', cur.execute('SELECT COUNT(*) FROM students WHERE waiting_area=1').fetchone()[0])
print('Waiting area + lunch allowed:', cur.execute('SELECT COUNT(*) FROM students WHERE waiting_area=1 AND lunch_break_access=1').fetchone()[0])
print('Lunch allowed total:', cur.execute('SELECT COUNT(*) FROM students WHERE lunch_break_access=1').fetchone()[0])
print('Dismissal allowed total:', cur.execute('SELECT COUNT(*) FROM students WHERE dismissal_allowed=1').fetchone()[0])

cur.execute("SELECT value FROM settings WHERE key='dismissalSchedule'")
row = cur.fetchone()
schedule = json.loads(row[0])
print('\nDismissal schedule:')
for grade, time in schedule.items():
    print(f'  {grade}: {time}')

# Sample records
print('\nSample students with waiting area:')
for r in cur.execute('SELECT name, course_section, waiting_area, lunch_break_access, dismissal_allowed FROM students WHERE waiting_area=1 LIMIT 3'):
    print(' ', r)

conn.close()
