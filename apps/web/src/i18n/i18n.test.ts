import { describe, expect, it, vi } from 'vitest';
import { draftFromSearch } from '../state/donation-draft.ts';
import {
  LANG_STORAGE_KEY,
  homePath,
  langFromPath,
  localizedPath,
  saveLangPreference,
  switchLanguagePath,
} from './lang.ts';
import { MESSAGES } from './messages.ts';

describe('translation dictionaries (CI fails on a missing key)', () => {
  const en = Object.keys(MESSAGES.en).sort();
  const ta = Object.keys(MESSAGES.ta).sort();

  it('Tamil and English have exactly the same keys', () => {
    expect(
      ta.filter((k) => !en.includes(k)),
      'only in Tamil',
    ).toEqual([]);
    expect(
      en.filter((k) => !ta.includes(k)),
      'missing in Tamil',
    ).toEqual([]);
  });

  it.each(['en', 'ta'] as const)('%s has no empty strings', (lang) => {
    for (const [key, text] of Object.entries(MESSAGES[lang])) expect(text.trim(), key).not.toBe('');
  });

  it('every Tamil string contains Tamil script (nothing left untranslated)', () => {
    for (const [key, text] of Object.entries(MESSAGES.ta)) {
      expect(text, key).toMatch(/[஀-௿]/);
    }
  });
});

describe('language from the URL (ADR 0004)', () => {
  it.each([
    ['/', 'en'],
    ['/privacy', 'en'],
    ['/tamil', 'en'],
    ['/taxes', 'en'],
    ['/ta', 'ta'],
    ['/ta/', 'ta'],
    ['/ta/privacy', 'ta'],
  ] as const)('%s → %s', (path, lang) => {
    expect(langFromPath(path)).toBe(lang);
  });

  it('home paths', () => {
    expect(homePath('en')).toBe('/');
    expect(homePath('ta')).toBe('/ta/');
  });

  it.each([
    ['/', 'ta', '/ta/'],
    ['/privacy', 'ta', '/ta/privacy'],
    ['/ta/privacy', 'ta', '/ta/privacy'],
    ['/ta/', 'en', '/'],
    ['/ta', 'en', '/'],
    ['/ta/terms', 'en', '/terms'],
    ['/terms', 'en', '/terms'],
  ] as const)('localizedPath(%s, %s) = %s', (path, lang, expected) => {
    expect(localizedPath(path, lang)).toBe(expected);
    expect(switchLanguagePath(path, lang)).toBe(expected);
  });
});

describe('saving the language choice', () => {
  it('stores the choice', () => {
    const setItem = vi.fn();
    expect(saveLangPreference('ta', { setItem })).toBe(true);
    expect(setItem).toHaveBeenCalledWith(LANG_STORAGE_KEY, 'ta');
  });

  it('tolerates blocked or missing storage', () => {
    const setItem = vi.fn(() => {
      throw new Error('QuotaExceeded');
    });
    expect(saveLangPreference('en', { setItem })).toBe(false);
    expect(saveLangPreference('en', undefined)).toBe(false);
  });
});

describe('donation draft pre-fill (sitemap URL rules)', () => {
  it('reads the approved keys', () => {
    expect(draftFromSearch('?programme=education&amount=500&frequency=monthly')).toEqual({
      programme: 'education',
      amountPaise: 50000,
      frequency: 'monthly',
    });
  });

  it('defaults to nothing chosen, one-time', () => {
    expect(draftFromSearch('')).toEqual({ programme: null, amountPaise: null, frequency: 'once' });
  });

  it.each([
    '?programme=../../etc&amount=12.5&frequency=weekly',
    '?programme=<script>&amount=-5',
    '?programme=-edu&amount=0',
    `?programme=${'a'.repeat(41)}&amount=abc`,
  ])('ignores invalid values: %s', (search) => {
    expect(draftFromSearch(search)).toEqual({
      programme: null,
      amountPaise: null,
      frequency: 'once',
    });
  });

  it('normalises programme case and ignores unknown keys like name or phone', () => {
    const draft = draftFromSearch('?programme=Education&name=Someone&phone=999');
    expect(draft).toEqual({ programme: 'education', amountPaise: null, frequency: 'once' });
  });
});
