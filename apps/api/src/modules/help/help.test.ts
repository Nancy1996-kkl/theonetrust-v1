import { describe, expect, it } from 'vitest';
import { HELP_REFERENCE_PATTERN } from '@theonetrust/contracts';
import { buildApp } from '../../app.ts';
import { loadEnv } from '../../config/env.ts';
import { csvCell, csvRow, maskPhone, maskText } from './masking.ts';
import { newHelpReference } from './reference.ts';

describe('newHelpReference', () => {
  it('matches the pattern the form shows, without I or O', () => {
    for (let i = 0; i < 200; i += 1) {
      const ref = newHelpReference();
      expect(ref).toMatch(HELP_REFERENCE_PATTERN);
      expect(ref.slice(4)).toHaveLength(6);
      expect(ref.slice(4)).not.toMatch(/[IO]/);
    }
  });

  it('skips biased bytes', () => {
    let call = 0;
    const bytes = (n: number) => Buffer.alloc(n, call++ === 0 ? 250 : 1);
    expect(newHelpReference(bytes)).toBe('HLP-111111');
  });
});

describe('masking', () => {
  it('keeps only the last four phone digits', () => {
    expect(maskPhone('+919876543210')).toBe('••••••3210');
    expect(maskPhone('x')).toBe('••••');
  });

  it('keeps only the first letter of a name or village', () => {
    expect(maskText('Lakshmi, Thiruvallur')).toBe('L•••');
    expect(maskText('  திருவள்ளூர்')).toBe('த•••');
    expect(maskText(null)).toBe('');
  });

  it('quotes CSV cells and neutralises formulas', () => {
    expect(csvCell('a"b')).toBe('"a""b"');
    for (const bad of ['=SUM(A1)', '+1', '-1', '@x', '\tx'])
      expect(csvCell(bad).startsWith(`"'`)).toBe(true);
    expect(csvRow(['a', 'b'])).toBe('"a","b"');
  });
});

describe('help endpoints without a database', () => {
  it('answer 503 for a valid request and still trap the honeypot', async () => {
    const app = buildApp(loadEnv({ NODE_ENV: 'test' }));
    const ok = await app.inject({
      method: 'POST',
      url: '/api/v1/help-requests/callback',
      payload: {
        mode: 'callback',
        phone: '98765 43210',
        consentContact: true,
        pageLanguage: 'ta',
        website: '',
      },
    });
    expect(ok.statusCode).toBe(503);
    const bot = await app.inject({
      method: 'POST',
      url: '/api/v1/help-requests/callback',
      payload: {
        mode: 'callback',
        phone: '1',
        consentContact: true,
        pageLanguage: 'ta',
        website: 'http://spam',
      },
    });
    expect(bot.statusCode).toBe(201);
    expect(bot.json().reference).toMatch(HELP_REFERENCE_PATTERN);
    await app.close();
  });
});
