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
