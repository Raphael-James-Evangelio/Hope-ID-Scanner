import openpyxl, sqlite3, os, sys, re, unicodedata

APPLY = '--apply' in sys.argv
sys.stdout.reconfigure(encoding='utf-8')

EXCEL_PATH = r'C:\Users\HowardKevinVelos\Downloads\Lunch_Break_Summary.xlsx'
DB_PATH = os.path.join(os.environ.get('APPDATA', ''), 'hope-id-scanner', 'hope-scanner.db')
SECTION = 'Grade 4 - John'


def norm(s):
    s = unicodedata.normalize('NFKD', s or '')
    s = ''.join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r'[^a-z0-9 ]', '', s.lower())
    return re.sub(r'\s+', ' ', s).strip()


def surname_joined(s):
    s = s or ''
    if ',' not in s:
        return ''
    raw = unicodedata.normalize('NFKD', s.split(',')[0])
    raw = re.sub(r'[^a-z0-9 ]', '', raw.lower())
    return re.sub(r'\s+', '', raw)


def given_tokens(s):
    s = s or ''
    if ',' not in s:
        return set()
    raw = unicodedata.normalize('NFKD', s.split(',')[1])
    raw = ''.join(c for c in raw if not unicodedata.combining(c))
    raw = re.sub(r'[^a-z0-9 ]', '', raw.lower())
    return set(raw.split())


wb = openpyxl.load_workbook(EXCEL_PATH, read_only=True)
ws = wb.active
rows = list(ws.iter_rows(values_only=True))

excel_entries = []
for i in list(range(10, 24)) + list(range(25, 38)):
    name = rows[i][0]
    if not name or not str(name).strip():
        continue
    allowed = rows[i][1]
    waiting = rows[i][2]
    notallowed = rows[i][3]
    if str(allowed).strip() == '✓':
        status = 'allowed'
    elif str(waiting).strip() == '✓':
        status = 'waiting'
    elif str(notallowed).strip() == '✓':
        status = 'notallowed'
    else:
        status = 'unmarked'
    excel_entries.append((str(name).strip(), status))

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()
cur.execute('SELECT id, name FROM students WHERE course_section = ?', (SECTION,))
db_students = [(r[0], r[1]) for r in cur.fetchall()]


def find_match(excel_name):
    es, egiven = surname_joined(excel_name), given_tokens(excel_name)
    if not es:
        return None, 0.0
    candidates = [(sid, sname) for sid, sname in db_students if surname_joined(sname) == es]
    if not candidates:
        return None, 0.0
    if len(candidates) == 1:
        sid, sname = candidates[0]
        overlap = len(egiven & given_tokens(sname))
        if overlap >= 1:
            return (sid, sname), 1.0
        return None, 0.0
    best, best_score = None, 0.0
    for sid, sname in candidates:
        sgiven = given_tokens(sname)
        if not egiven or not sgiven:
            continue
        score = len(egiven & sgiven) / len(egiven | sgiven)
        if score > best_score:
            best, best_score = (sid, sname), score
    return (best, best_score) if best_score >= 0.66 else (None, 0.0)


matched = []
unmatched = []
for excel_name, status in excel_entries:
    m, score = find_match(excel_name)
    if m is None:
        unmatched.append((excel_name, status))
        continue
    lunch = 1 if status in ('allowed', 'waiting') else 0
    waiting = 1 if status == 'waiting' else 0
    dismiss = 1 if status in ('allowed', 'waiting') else 0
    matched.append((excel_name, status, m[0], m[1], lunch, waiting, dismiss, score))

print('=' * 90)
print(f'MATCHED: {len(matched)}   UNMATCHED: {len(unmatched)}   SECTION: {SECTION}')
print('=' * 90)
for excel_name, status, sid, sname, lunch, waiting, dismiss, score in sorted(matched, key=lambda x: x[1]):
    print(f'[{status:9}] {excel_name:44s} -> {sname:40s} lunch={lunch} wait={waiting} dism={dismiss} (score={score:.2f})')

if unmatched:
    print()
    print('--- UNMATCHED (NOT in DB or fuzzy) ---')
    for excel_name, status in unmatched:
        print(f'[{status:9}] {excel_name}')

if APPLY and not unmatched:
    cur.executemany(
        'UPDATE students SET lunch_break_access = ?, waiting_area = ?, dismissal_allowed = ? WHERE id = ?',
        [(m[4], m[5], m[6], m[2]) for m in matched]
    )
    conn.commit()
    print()
    print(f'APPLIED: {len(matched)} students updated in {DB_PATH}')
else:
    print()
    print('Dry run only. Re-run with --apply to write changes.')

conn.close()