import XLSX from 'xlsx';
const workbook = XLSX.readFile('C:/Users/EL-Mostwred/Downloads/19 sept 2026.xlsx');
const rows = XLSX.utils.sheet_to_json(workbook.Sheets.Sheet1, { defval: '' });
const normalizeHeader = value => value.toLowerCase().replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/[\s_-]+/g, '').replace(/[؟?،,:؛()./\\]/g, '');
const cell = (row, keys) => Object.entries(row).find(([key]) => keys.some(alias => normalizeHeader(key) === normalizeHeader(alias)))?.[1];
const text = value => value == null ? '' : String(value).trim().replace(/\s+/g, ' ');
const phone = value => { const digits = text(value).replace(/\D/g, ''); return /^1\d{9}$/.test(digits) ? `0${digits}` : digits; };
let current = null; const consolidated = [];
rows.forEach((row, index) => { const name = text(cell(row, ['الاسم'])); const rawPhone = cell(row, ['التلفون', 'الهاتف']); if (name || text(rawPhone)) { if (current) consolidated.push(current); current = { row: index + 2, ...row }; } else if (current && text(cell(row, ['التفاصيل']))) current = { ...current, التفاصيل: `${text(current.التفاصيل)}، ${text(cell(row, ['التفاصيل']))}` }; });
if (current) consolidated.push(current);
for (const item of consolidated) { const raw = cell(item, ['التلفون', 'الهاتف']); console.log(JSON.stringify({ sourceRow: item.row, name: cell(item, ['الاسم']), rawPhone: raw, normalizedPhone: phone(raw), order: cell(item, ['الاوردر']), details: cell(item, ['التفاصيل']), price: cell(item, ['السعر']), delivery: cell(item, ['التوصيل']) }, null, 2)); }
