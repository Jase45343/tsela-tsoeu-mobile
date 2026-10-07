/** RFC 4180 CSV with a header row. Formula-like cells are prefixed with ' to stop spreadsheet injection. */
export function toCsv<T>(rows: T[], columns: { header: string; value: (row: T) => string | number | null | undefined }[]): string {
  const cell = (v: string | number | null | undefined): string => {
    if (v === null || v === undefined) return '';
    let s = String(v);
    if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.map((c) => cell(c.header)).join(',')];
  for (const r of rows) lines.push(columns.map((c) => cell(c.value(r))).join(','));
  return lines.join('\r\n') + '\r\n';
}

/** Lisente to a plain decimal string for spreadsheets: 50050 -> "500.50". */
export function csvAmount(lisente: number): string {
  const sign = lisente < 0 ? '-' : '';
  const abs = Math.abs(lisente);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}
