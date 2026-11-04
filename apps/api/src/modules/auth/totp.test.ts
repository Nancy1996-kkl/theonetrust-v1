import { describe, expect, it } from 'vitest';
import {
  base32Decode,
  base32Encode,
  generateTotpSecret,
  hotp,
  otpauthUri,
  timeStep,
  verifyTotp,
} from './totp.ts';

// RFC 6238 Appendix B (SHA-1 seed), last 6 of the 8-digit values.
const RFC_SECRET = Buffer.from('12345678901234567890');
const RFC_VECTORS: Array<[number, string]> = [
  [59, '287082'],
  [1111111109, '081804'],
  [1111111111, '050471'],
  [1234567890, '005924'],
  [2000000000, '279037'],
];

describe('TOTP (RFC 6238)', () => {
  it.each(RFC_VECTORS)('t=%i → %s', (seconds, code) => {
    expect(hotp(RFC_SECRET, timeStep(new Date(seconds * 1000)))).toBe(code);
  });

  it('round-trips base32 and ignores spaces, dashes, padding and case', () => {
    const bytes = Buffer.from('hello world, 160 bits!');
    const text = base32Encode(bytes);
    expect(base32Decode(text)).toEqual(bytes);
    expect(base32Decode(text.toLowerCase().replace(/(.{4})/g, '$1 ') + '==')).toEqual(bytes);
    expect(() => base32Decode('abc1')).toThrow('Invalid base32');
  });

  it('generates 160-bit secrets', () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Decode(secret)).toHaveLength(20);
    expect(generateTotpSecret()).not.toBe(secret);
  });

  describe('verifyTotp', () => {
    const secret = base32Encode(RFC_SECRET);
    const at = new Date(1111111111 * 1000);
    const step = timeStep(at);

    it('accepts the current code and returns its step', () => {
      expect(verifyTotp(secret, '050471', at, null)).toBe(step);
    });

    it('accepts one step of clock drift either way, not two', () => {
      const prev = hotp(RFC_SECRET, step - 1);
      const next = hotp(RFC_SECRET, step + 1);
      const far = hotp(RFC_SECRET, step + 2);
      expect(verifyTotp(secret, prev, at, null)).toBe(step - 1);
      expect(verifyTotp(secret, next, at, null)).toBe(step + 1);
      expect(verifyTotp(secret, far, at, null)).toBeNull();
    });

    it('refuses a replayed or older code', () => {
      expect(verifyTotp(secret, '050471', at, step)).toBeNull();
      expect(verifyTotp(secret, hotp(RFC_SECRET, step - 1), at, step - 1)).toBeNull();
      expect(verifyTotp(secret, '050471', at, step - 1)).toBe(step);
    });

    it.each(['', '12345', '1234567', 'abcdef', '05047 '])('rejects malformed code %j', (code) => {
      expect(verifyTotp(secret, code, at, null)).toBeNull();
    });
  });

  it('builds an otpauth URI authenticator apps understand', () => {
    const uri = new URL(otpauthUri('JBSWY3DPEHPK3PXP', 'owner@example.org', 'Theonetrust.in'));
    expect(uri.protocol).toBe('otpauth:');
    expect(uri.host).toBe('totp');
    expect(decodeURIComponent(uri.pathname)).toBe('/Theonetrust.in:owner@example.org');
    expect(Object.fromEntries(uri.searchParams)).toEqual({
      secret: 'JBSWY3DPEHPK3PXP',
      issuer: 'Theonetrust.in',
      algorithm: 'SHA1',
      digits: '6',
      period: '30',
    });
  });
});
