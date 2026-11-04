import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { isReceiptToken, type ReceiptView } from '@theonetrust/contracts';
import { loadEnv } from '../../config/env.ts';
import {
  RECEIPT_TEMPLATE_VERSION,
  financialYear,
  formatReceiptNumber,
  newTokenSalt,
  receiptToken,
  receiptTokenHash,
} from './numbering.ts';
import { RECEIPT_STRINGS, formatReceiptDate, receiptRows, renderReceiptPdf } from './pdf.ts';
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

const view: ReceiptView = {
  receiptNumber: 'TOT-R-2026-27-000001',
  donationReference: 'TOT-D-ABCDEFGHJKMN',
  issuedAt: '2026-11-04T10:00:00.000Z',
  amountPaise: 150_000,
  currency: 'INR',
  method: 'upi',
  purpose: null,
  donorName: 'Synthetic Donor',
  trust: { legalName: null, registration: null },
  approval: null,
  state: 'VALID',
  replacementToken: null,
  templateVersion: RECEIPT_TEMPLATE_VERSION,
};

describe('acknowledgement template', () => {
  it('lists the minimal fields in English and Tamil', () => {
    expect(receiptRows(view, 'en')).toEqual([
      ['Receipt number', 'TOT-R-2026-27-000001'],
      ['Donation reference', 'TOT-D-ABCDEFGHJKMN'],
      ['Received from', 'Synthetic Donor'],
      ['Date', '4 November 2026'],
      ['Amount', '₹1,500'],
      ['Payment method', 'UPI'],
      ['Purpose', 'General fund — used where the need is greatest'],
    ]);
    const ta = receiptRows(
      { ...view, method: 'bank_transfer', purpose: { en: 'Food', ta: 'உணவு' } },
      'ta',
    );
    expect(ta.map(([label]) => label)).toEqual([
      'ரசீது எண்',
      'நன்கொடை குறிப்பு எண்',
      'வழங்கியவர்',
      'தேதி',
      'தொகை',
      'கட்டண முறை',
      'நோக்கம்',
    ]);
    expect(ta[5]?.[1]).toBe('வங்கிப் பரிமாற்றம்');
    expect(ta[6]?.[1]).toBe('உணவு');
  });

  it('dates are shown in IST', () => {
    expect(formatReceiptDate('2026-03-31T19:00:00Z', 'en')).toBe('1 April 2026');
  });

  it('English and Tamil have the same strings, and none names a tax form, GST or a benefit', () => {
    const keys = (o: object) => Object.keys(o).sort();
    expect(keys(RECEIPT_STRINGS.ta)).toEqual(keys(RECEIPT_STRINGS.en));
    expect(keys(RECEIPT_STRINGS.ta.methods)).toEqual(keys(RECEIPT_STRINGS.en.methods));
    const all = JSON.stringify(RECEIPT_STRINGS);
    expect(all).not.toMatch(/form\s*1\d\d|80G|GST|deduct|exempt|tax benefit|tax saving/i);
    expect(RECEIPT_STRINGS.en.title).toBe('Donation acknowledgement');
  });

  it.each(['en', 'ta'] as const)('renders a one-page PDF (%s)', async (lang) => {
    const pdf = await renderReceiptPdf(view, lang, 'https://theonetrust.in/receipt/x');
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.toString('latin1').match(/\/Type \/Page\b/g)).toHaveLength(1);
  });

  it('renders refunded, replaced and approval variants on one page', async () => {
    for (const variant of [
      { state: 'REFUNDED' as const },
      { state: 'REPLACED' as const },
      {
        approval: { reference: 'APPROVAL-REF-1', validUntil: '2029-03-31' },
        trust: { legalName: 'Synthetic Trust', registration: 'Registration line [test]' },
        method: 'other' as const,
      },
    ]) {
      const pdf = await renderReceiptPdf({ ...view, ...variant }, 'ta', 'https://x.test/r');
      expect(pdf.toString('latin1').match(/\/Type \/Page\b/g)).toHaveLength(1);
    }
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
