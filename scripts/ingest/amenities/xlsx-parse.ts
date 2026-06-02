import * as XLSX from 'xlsx';

export function readXlsxRows(filePath: string): Record<string, unknown>[] {
  const wb = XLSX.readFile(filePath, { cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });
}
