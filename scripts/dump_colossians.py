import openpyxl, sys
sys.stdout.reconfigure(encoding='utf-8')

wb = openpyxl.load_workbook(r'C:\Users\HowardKevinVelos\Downloads\Lunch_Break_Summary_Colossians.xlsx', read_only=True)
ws = wb.active
rows = list(ws.iter_rows(values_only=True))
print('Total rows:', len(rows))
for i, row in enumerate(rows):
    print(f'Row {i}: {row}')
