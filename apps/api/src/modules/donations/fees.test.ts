import { describe, expect, it } from 'vitest';
import { feeCoverFor, feeOn, parseFeeTable, type FeeTable } from './fees.ts';

// Example table for tests only — the trust enters its real pricing in settings.
const TABLE: FeeTable = {
  version: 'test-2026-11',
  defaultMethod: 'card',
  methods: {
    card: { rateBps: 200, fixedPaise: 0, gstBps: 1800 },
    upi: {
      rateBps: 40,
      fixedPaise: 0,
      gstBps: 0,
      abovePaise: 200_000,
      capPaise: 30_000,
      effectiveFrom: '2026-10-15',
    },
  },
};
const NOW = new Date('2026-11-03T06:00:00Z');

describe('feeOn', () => {
  it('applies rate + GST, rounding up', () => {
    // 2% of ₹1,000 = ₹20, + 18% GST = ₹23.60
    expect(feeOn(100_000, TABLE.methods.card!, NOW)).toBe(2_360);
    expect(feeOn(101, TABLE.methods.card!, NOW)).toBe(3 + 1);
  });

  it('UPI MDR: nothing up to ₹2,000, 0.4% above, capped at ₹300', () => {
    const upi = TABLE.methods.upi!;
    expect(feeOn(200_000, upi, NOW)).toBe(0);
    expect(feeOn(200_100, upi, NOW)).toBe(801);
    expect(feeOn(7_500_000, upi, NOW)).toBe(30_000);
    expect(feeOn(50_000_000, upi, NOW)).toBe(30_000);
  });

  it('does not apply before its effective date (IST)', () => {
    const upi = TABLE.methods.upi!;
    expect(feeOn(500_000, upi, new Date('2026-10-14T18:29:00Z'))).toBe(0); // 14 Oct 23:59 IST
    expect(feeOn(500_000, upi, new Date('2026-10-14T18:30:00Z'))).toBe(2_000); // 15 Oct 00:00 IST
  });

  it('adds a fixed fee', () => {
    expect(feeOn(10_000, { rateBps: 0, fixedPaise: 300, gstBps: 0 }, NOW)).toBe(300);
  });
});

describe('feeCoverFor', () => {
  it('covers the fee on the total so the trust receives the whole gift', () => {
    const cover = feeCoverFor(100_000, TABLE, 'card', NOW)!;
    const total = 100_000 + cover;
    expect(total - feeOn(total, TABLE.methods.card!, NOW)).toBeGreaterThanOrEqual(100_000);
    expect(cover).toBe(2_418);
  });

  it('uses the default method and returns 0 when nothing is charged', () => {
    expect(feeCoverFor(100_000, TABLE, undefined, NOW)).toBe(
      feeCoverFor(100_000, TABLE, 'card', NOW),
    );
    expect(feeCoverFor(150_000, TABLE, 'upi', NOW)).toBe(0);
  });

  it('is not offered for a method without a rule', () => {
    expect(feeCoverFor(100_000, TABLE, 'netbanking', NOW)).toBeNull();
  });
});

describe('parseFeeTable', () => {
  it('accepts a valid table and fills defaults', () => {
    const parsed = parseFeeTable({
      version: 'v1',
      defaultMethod: 'upi',
      methods: { upi: { rateBps: 40 } },
    });
    expect(parsed?.methods.upi).toEqual({ rateBps: 40, fixedPaise: 0, gstBps: 0 });
  });

  it.each([
    null,
    undefined,
    { version: 'v1', defaultMethod: 'cash', methods: {} },
    { version: 'v1', defaultMethod: 'upi', methods: { upi: { rateBps: -1 } } },
    { version: 'v1', defaultMethod: 'upi', methods: { upi: { rateBps: 1, surprise: 1 } } },
    'not a table',
  ])('treats %j as "fee cover not offered"', (value) => {
    expect(parseFeeTable(value)).toBeNull();
  });
});
