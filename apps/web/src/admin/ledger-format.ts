import { formatInr, type LedgerFilters, type Paise } from '@theonetrust/contracts';
import type { UiLang } from '../components/ui/ui-strings.ts';

/** Money and IST time for the owner ledger (#31). */
export function moneyFor(lang: UiLang) {
  return (paise: number) => formatInr(paise as Paise, lang === 'ta' ? 'ta-IN' : 'en-IN');
}

export function istFor(lang: UiLang) {
  const fmt = new Intl.DateTimeFormat(lang === 'ta' ? 'ta-IN' : 'en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  return (iso: string | null) => (iso ? fmt.format(new Date(iso)) : '—');
}

export const LEDGER_KEYS = [
  'q',
  'from',
  'to',
  'programme',
  'status',
  'method',
  'receipt',
  'sort',
  'page',
] as const;

export function filtersFrom(params: URLSearchParams): LedgerFilters {
  const out: Record<string, string | number> = {};
  for (const key of LEDGER_KEYS) {
    const value = params.get(key);
    if (value) out[key] = key === 'page' ? Math.max(1, Number(value) || 1) : value;
  }
  return out as LedgerFilters;
}

/** The last few financial years, newest first ("2026-27"). */
export function recentYears(now: Date, count = 4): string[] {
  const ist = new Date(now.getTime() + 330 * 60_000);
  const start = ist.getUTCMonth() >= 3 ? ist.getUTCFullYear() : ist.getUTCFullYear() - 1;
  return Array.from(
    { length: count },
    (_, i) => `${start - i}-${String((start - i + 1) % 100).padStart(2, '0')}`,
  );
}
