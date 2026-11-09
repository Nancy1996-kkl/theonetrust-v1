import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { isReceiptToken } from '@theonetrust/contracts';
import { loadEnv } from '../../config/env.ts';
import {
  financialYear,
  formatReceiptNumber,
  newTokenSalt,
  receiptToken,
  receiptTokenHash,
} from './numbering.ts';
import { verifyUrl } from './routes.ts';

describe('financial year (April–March, IST)', () => {
  it.each([
    ['2026-03-31T18:29:59Z', '2025-26'], // 23:59:59 IST on 31 March
    ['2026-03-31T18:30:00Z', '2026-27'], // 00:00 IST on 1 April
    ['2026-11-04T10:00:00Z', '2026-27'],
    ['2027-01-15T00:00:00Z', '2026-27'],
    ['2099-12-31T00:00:00Z', '2099-00'],
  ])('%s → %s', (iso, fy) => {
    expect(financialYear(new Date(iso))).toBe(fy);
  });

  it('formats receipt numbers with the year and a zero-padded sequence', () => {
    expect(formatReceiptNumber(new Date('2026-11-04T10:00:00Z'), 7)).toBe('TOT-R-2026-27-000007');
    expect(formatReceiptNumber(new Date('2026-11-04T10:00:00Z'), 1234567n)).toBe(
      'TOT-R-2026-27-1234567',
    );
  });
});

describe('share token', () => {
  const key = randomBytes(32);

  it('is 43 url-safe characters, derived from a random salt, and only its hash is kept', () => {
    const salt = newTokenSalt();
    expect(salt).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(newTokenSalt()).not.toBe(salt);
    const token = receiptToken(key, salt);
    expect(isReceiptToken(token)).toBe(true);
    expect(receiptToken(key, salt)).toBe(token); // re-derivable for emails / owner links
    expect(receiptToken(randomBytes(32), salt)).not.toBe(token); // useless without the key
    expect(receiptTokenHash(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(receiptTokenHash(token)).not.toContain(token);
  });

  it('rejects anything that is not a token', () => {
    for (const bad of ['', 'abc', 'x'.repeat(44), `${'a'.repeat(42)}=`, '../../etc/passwd']) {
      expect(isReceiptToken(bad)).toBe(false);
    }
  });

  it('verification links never carry personal data, only the token', () => {
    const token = receiptToken(key, newTokenSalt());
    expect(verifyUrl('https://theonetrust.in/', token, 'en')).toBe(
      `https://theonetrust.in/receipt/${token}`,
    );
    expect(verifyUrl('https://theonetrust.in', token, 'ta')).toBe(
      `https://theonetrust.in/ta/receipt/${token}`,
    );
  });
});

describe('env', () => {
  it('PUBLIC_SITE_URL is optional and must be http(s); receipt rate limit has a default', () => {
    expect(loadEnv({}).PUBLIC_SITE_URL).toBeUndefined();
    expect(loadEnv({}).RECEIPT_RATE_LIMIT_PER_HOUR).toBe(60);
    expect(loadEnv({ PUBLIC_SITE_URL: 'https://theonetrust.in' }).PUBLIC_SITE_URL).toBe(
      'https://theonetrust.in',
    );
    expect(() => loadEnv({ PUBLIC_SITE_URL: 'ftp://x' })).toThrow();
  });
});
