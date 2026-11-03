/** "+919876543210" → "••••••3210". Only the last four digits ever leave the dashboard. */
export function maskPhone(phone: string): string {
  const last4 = phone.slice(-4);
  return /^\d{4}$/.test(last4) ? `••••••${last4}` : '••••';
}

/** "Lakshmi, Thiruvallur" → "L•••". Names and villages are personal data. */
export function maskText(value: string | null): string {
  if (!value) return '';
  const first = [...value.trim()][0] ?? '';
  return `${first}•••`;
}

/** Stops spreadsheet formula injection (=, +, -, @, tab, CR) and quotes every cell. */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function csvRow(cells: string[]): string {
  return cells.map(csvCell).join(',');
}
