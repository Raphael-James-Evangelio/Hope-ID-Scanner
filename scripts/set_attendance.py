import argparse, json, os, re, sqlite3, sys

DB_PATH = os.path.join(os.environ.get('APPDATA', ''), 'hope-id-scanner', 'hope-scanner.db')

FIELDS = {
    'am-in': 'amIn',
    'am-out': 'amOut',
    'pm-in': 'pmIn',
    'pm-out': 'pmOut',
}
TIME_RE = re.compile(r'^([01]\d|2[0-3]):[0-5]\d$')
DAYS = {'mon': 1, 'tue': 2, 'wed': 3, 'thu': 4, 'fri': 5}


def load_schedule(cur):
    row = cur.execute("SELECT value FROM settings WHERE key='attendanceSchedule'").fetchone()
    if not row or not row[0]:
        return {}
    try:
        parsed = json.loads(row[0])
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def fmt12(hm):
    h, m = int(hm[:2]), int(hm[3:])
    ap = 'AM' if h < 12 else 'PM'
    return f'{h % 12 or 12}:{m:02d} {ap}'


def main():
    ap = argparse.ArgumentParser(description='Set per-grade attendance times on the live scanner database.')
    ap.add_argument('--grade', required=True, help='Grade level, e.g. "Grade 4"')
    ap.add_argument('--day', default='every',
                    help='every (default), mon, tue, wed, thu, or fri')
    ap.add_argument('--set', dest='field', choices=sorted(FIELDS), action='append', default=[],
                    help='Which time to change. Repeat with --value for each.')
    ap.add_argument('--value', dest='values', action='append', default=[],
                    help='HH:MM value for the matching --set. Use "off" to clear a time.')
    args = ap.parse_args()

    if len(args.field) != len(args.values):
        ap.error('each --set needs a matching --value')

    day = args.day.strip().lower()
    if day == 'every':
        scope = 'base'
    elif day in DAYS:
        scope = str(DAYS[day])
    else:
        ap.error(f'invalid --day "{args.day}" (use every, mon, tue, wed, thu, or fri)')

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    schedule = load_schedule(cur)
    entry = schedule.get(args.grade) or {}
    entry = {'base': dict(entry.get('base') or {}), 'days': dict(entry.get('days') or {})}

    target = entry['base'] if scope == 'base' else entry['days'].setdefault(scope, {})

    for name, value in zip(args.field, args.values):
        key = FIELDS[name]
        if value.lower() == 'off':
            target.pop(key, None)
        elif TIME_RE.match(value):
            target[key] = value
        else:
            ap.error(f'invalid time "{value}" for --{name} (expected HH:MM or "off")')

    if scope != 'base' and not target:
        del entry['days'][scope]

    if entry['base'] or entry['days']:
        schedule[args.grade] = entry
    else:
        schedule.pop(args.grade, None)

    cur.execute(
        "INSERT INTO settings (key, value) VALUES ('attendanceSchedule', ?) "
        'ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        (json.dumps(schedule),),
    )
    conn.commit()
    conn.close()

    print(f'{args.grade} ({args.day}):')
    for key, label in (('amIn', 'Morning Time In'), ('amOut', 'Morning Time Out'),
                       ('pmIn', 'Afternoon Time In'), ('pmOut', 'Afternoon Time Out')):
        value = target.get(key)
        print(f'  {label}: {fmt12(value) if value else "(not set)"}')

    if scope != 'base':
        print('\n  other days:')
        for name, dow in DAYS.items():
            if str(dow) == scope:
                continue
            other = entry['days'].get(str(dow))
            if other:
                print(f'    {name.capitalize():4}: {other.get("pmOut", "-")}')


if __name__ == '__main__':
    sys.exit(main())
