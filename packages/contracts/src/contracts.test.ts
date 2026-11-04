import { describe, expect, it } from 'vitest';
import {
  API_ERROR_CODES,
  DONATION_STATUSES,
  InvalidAmountError,
  TERMINAL_DONATION_STATUSES,
  formatInr,
  isApiErrorCode,
  isDonationStatus,
  isLocale,
  rupeesToPaise,
  toPaise,
} from './index.ts';

describe('locales', () => {
  it.each(['ta', 'en'])('accepts supported locale %s', (value) => {
    expect(isLocale(value)).toBe(true);
  });

  it.each(['fr', '', 'TA', null, undefined, 1])('rejects unsupported locale %s', (value) => {
    expect(isLocale(value)).toBe(false);
  });
});

describe('donation statuses', () => {
  it('matches the spec state model exactly', () => {
    expect(DONATION_STATUSES).toEqual([
      'CREATED',
      'PENDING',
      'AUTHORIZED',
      'PAID',
      'FAILED',
      'REFUND_PENDING',
      'REFUNDED',
      'MANUAL_REVIEW',
    ]);
  });

  it('only lists known statuses as terminal', () => {
    for (const status of TERMINAL_DONATION_STATUSES) expect(isDonationStatus(status)).toBe(true);
  });

  it.each(['paid', 'SUCCESS', '', 42])('rejects unknown status %s', (value) => {
    expect(isDonationStatus(value)).toBe(false);
  });
});

describe('money', () => {
  it('converts rupees to integer paise', () => {
    expect(rupeesToPaise(1)).toBe(100);
    expect(rupeesToPaise(1500)).toBe(150000);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER])(
    'rejects invalid rupee amount %s',
    (value) => {
      expect(() => rupeesToPaise(value)).toThrow(InvalidAmountError);
    },
  );

  it.each([0, -100, 10.5])('rejects invalid paise amount %s', (value) => {
    expect(() => toPaise(value)).toThrow(InvalidAmountError);
  });

  it('formats INR with Indian digit grouping', () => {
    expect(formatInr(toPaise(10000000))).toBe('₹1,00,000');
    expect(formatInr(toPaise(150))).toBe('₹1.50');
  });

  it('formats INR for Tamil locale without losing the amount', () => {
    expect(formatInr(toPaise(50000), 'ta-IN')).toContain('500');
  });
});

describe('API error codes', () => {
  it('are unique upper-snake-case identifiers', () => {
    expect(new Set(API_ERROR_CODES).size).toBe(API_ERROR_CODES.length);
    for (const code of API_ERROR_CODES) expect(code).toMatch(/^[A-Z]+(_[A-Z]+)*$/);
  });

  it('recognises only known codes', () => {
    expect(isApiErrorCode('RATE_LIMITED')).toBe(true);
    expect(isApiErrorCode('rate_limited')).toBe(false);
    expect(isApiErrorCode(429)).toBe(false);
  });
});

describe('admin session stages', () => {
  it('start signed out and end active', async () => {
    const { ADMIN_SESSION_STAGES, CSRF_HEADER } = await import('./index.ts');
    expect(ADMIN_SESSION_STAGES[0]).toBe('SIGNED_OUT');
    expect(ADMIN_SESSION_STAGES.at(-1)).toBe('ACTIVE');
    expect(CSRF_HEADER).toBe(CSRF_HEADER.toLowerCase());
  });
});

describe('site text keys', () => {
  it('are unique section.slot names', async () => {
    const { SITE_TEXT_KEYS } = await import('./index.ts');
    expect(new Set(SITE_TEXT_KEYS).size).toBe(SITE_TEXT_KEYS.length);
    for (const key of SITE_TEXT_KEYS) expect(key).toMatch(/^[a-z_]+\.[a-z_]+$/);
  });
});

describe('receipt contracts (#29)', () => {
  it('accepts only 43-character url-safe tokens and lists the payment methods', async () => {
    const { isReceiptToken, RECEIPT_METHODS } = await import('./index.ts');
    expect(isReceiptToken('A'.repeat(43))).toBe(true);
    expect(isReceiptToken('a-_'.repeat(14) + 'Z')).toBe(true);
    for (const bad of ['', 'A'.repeat(42), 'A'.repeat(44), `${'A'.repeat(42)}/`]) {
      expect(isReceiptToken(bad)).toBe(false);
    }
    expect(RECEIPT_METHODS).toContain('bank_transfer');
  });
});

describe('monthly giving contracts (#32)', () => {
  it('routes by amount and never starts on the 29th–31st (IST)', async () => {
    const { methodRouteFor, methodsFor, monthlyStartDate } = await import('./index.ts');
    expect(methodRouteFor(1_500_000)).toBe('upi_autopay');
    expect(methodRouteFor(1_500_001)).toBe('emandate_card');
    expect(methodsFor('emandate_card')).toEqual(['emandate', 'card']);
    expect(methodsFor('upi_autopay')).toEqual(['upi', 'emandate', 'card']);
    expect(monthlyStartDate(new Date('2026-11-28T18:29:59Z'))).toBeNull();
    expect(monthlyStartDate(new Date('2026-11-28T18:30:00Z'))).toBe('2026-12-01');
    expect(monthlyStartDate(new Date('2026-12-30T05:00:00Z'))).toBe('2027-01-01');
  });
});

describe('content management contracts (#36)', () => {
  it('allows only documents, never executables', async () => {
    const { DOCUMENT_FILE_TYPES } = await import('./index.ts');
    expect(DOCUMENT_FILE_TYPES).toEqual(['application/pdf', 'image/png', 'image/jpeg']);
  });
});
