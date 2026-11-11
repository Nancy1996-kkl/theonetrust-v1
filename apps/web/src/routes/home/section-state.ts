import { useLang } from '../../i18n/use-lang.ts';
import type { SectionState } from './ProofSections.tsx';

/** Static content is always ready; API data (#21) can also be loading or failed. */
export const READY: SectionState = { status: 'ready' };

/** Dates on the home page, in India time and the reader's language. */
export function useDate() {
  const lang = useLang();
  const format = new Intl.DateTimeFormat(lang === 'ta' ? 'ta-IN' : 'en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
  return (iso: string) => format.format(new Date(iso));
}
