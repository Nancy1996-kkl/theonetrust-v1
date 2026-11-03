import { describe, expect, it } from 'vitest';
import {
  RECOVERY_CODE_COUNT,
  RECOVERY_CODE_PATTERN,
  generateRecoveryCodes,
  hashRecoveryCode,
  normalizeRecoveryCode,
} from './recovery-codes.ts';

describe('recovery codes', () => {
  it('generates ten unique, readable codes', () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(RECOVERY_CODE_COUNT);
    expect(new Set(codes).size).toBe(RECOVERY_CODE_COUNT);
    for (const code of codes) expect(code).toMatch(RECOVERY_CODE_PATTERN);
  });

  it.each([
    ['abcde-23456', 'ABCDE-23456'],
    [' ABCDE 23456 ', 'ABCDE-23456'],
    ['abcde23456', 'ABCDE-23456'],
  ])('normalizes %j', (input, expected) => {
    expect(normalizeRecoveryCode(input)).toBe(expected);
  });

  it.each(['ABCDE-2345', 'ABCDE-234567', 'ABCD0-23456', 'OILUU-23456', '123456'])(
    'rejects %j',
    (input) => {
      expect(normalizeRecoveryCode(input)).toBeNull();
    },
  );

  it('stores only a hash, which differs per code', () => {
    expect(hashRecoveryCode('ABCDE-23456')).toMatch(/^[0-9a-f]{64}$/);
    expect(hashRecoveryCode('ABCDE-23456')).not.toBe(hashRecoveryCode('ABCDE-23457'));
  });
});
