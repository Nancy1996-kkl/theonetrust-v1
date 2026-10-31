import { describe, expect, it } from 'vitest';
import { LANGUAGE_NAMES, UI_STRINGS } from './ui-strings.ts';

describe('built-in UI strings', () => {
  it('have the same keys in Tamil and English', () => {
    expect(Object.keys(UI_STRINGS.ta).sort()).toEqual(Object.keys(UI_STRINGS.en).sort());
  });

  it.each(['en', 'ta'] as const)('has no empty %s strings', (lang) => {
    for (const [key, value] of Object.entries(UI_STRINGS[lang])) {
      const text = typeof value === 'function' ? value(2, 4) : value;
      expect(text.trim(), key).not.toBe('');
    }
  });

  it('Tamil strings are written in Tamil script (not copied English)', () => {
    for (const [key, value] of Object.entries(UI_STRINGS.ta)) {
      const text = typeof value === 'function' ? value(2, 4) : value;
      expect(text, key).toMatch(/[஀-௿]/);
    }
  });

  it('formats the step counter with both numbers in each language', () => {
    expect(UI_STRINGS.en.stepOf(2, 4)).toBe('Step 2 of 4');
    expect(UI_STRINGS.ta.stepOf(2, 4)).toContain('2');
    expect(UI_STRINGS.ta.stepOf(2, 4)).toContain('4');
  });

  it('names each language in its own script', () => {
    expect(LANGUAGE_NAMES).toEqual({ en: 'English', ta: 'தமிழ்' });
  });
});
