export type AmountParse =
  { ok: true; rupees: number } | { ok: false; reason: 'empty' | 'format' | 'min' | 'max' };

/**
 * Parses what a donor typed as whole rupees. Accepts Indian digit grouping ("1,00,000") and
 * surrounding spaces; rejects decimals, signs, exponents and non-digits. Pure — unit tested.
 */
export function parseRupees(raw: string, minRupees = 1, maxRupees?: number): AmountParse {
  const trimmed = raw.replace(/[\s,]/g, '').replace(/^₹/, '');
  if (trimmed === '') return { ok: false, reason: 'empty' };
  if (!/^\d+$/.test(trimmed)) return { ok: false, reason: 'format' };
  const rupees = Number(trimmed);
  if (!Number.isSafeInteger(rupees)) return { ok: false, reason: 'format' };
  if (rupees < minRupees) return { ok: false, reason: 'min' };
  if (maxRupees !== undefined && rupees > maxRupees) return { ok: false, reason: 'max' };
  return { ok: true, rupees };
}
