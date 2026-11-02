import type { UiLang } from '../components/ui/ui-strings.ts';

/** ADR 0004: English at the root, Tamil mirrored under /ta/. */
const TAMIL_PREFIX = /^\/ta(?=\/|$)/;

export const LANG_STORAGE_KEY = 'theonetrust:lang';

export function langFromPath(pathname: string): UiLang {
  return TAMIL_PREFIX.test(pathname) ? 'ta' : 'en';
}

/** Home of the single page in a language: "/" or "/ta/". */
export function homePath(lang: UiLang): string {
  return lang === 'ta' ? '/ta/' : '/';
}

/** A public path (written in English form, e.g. "/privacy") in the given language. */
export function localizedPath(path: string, lang: UiLang): string {
  const english = path.replace(TAMIL_PREFIX, '') || '/';
  if (lang === 'en') return english;
  return english === '/' ? '/ta/' : `/ta${english}`;
}

/** Same page in the other language; the caller keeps the query string and hash. */
export function switchLanguagePath(pathname: string, target: UiLang): string {
  return localizedPath(pathname, target);
}

/** Remembers the visitor's choice. Storage can be blocked (private mode); that is not an error. */
export function saveLangPreference(
  lang: UiLang,
  storage: Pick<Storage, 'setItem'> | undefined,
): boolean {
  try {
    storage?.setItem(LANG_STORAGE_KEY, lang);
    return Boolean(storage);
  } catch {
    return false;
  }
}
