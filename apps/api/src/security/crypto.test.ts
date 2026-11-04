import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  CURRENT_KEY_VERSION,
  decrypt,
  deriveAuthKeys,
  encrypt,
  hmacBase64Url,
  randomToken,
  safeEqual,
  sha256Hex,
} from './crypto.ts';

const secret = randomBytes(32).toString('base64');

describe('deriveAuthKeys', () => {
  it('derives separate 32-byte keys per purpose, deterministically', () => {
    const a = deriveAuthKeys(secret);
    const b = deriveAuthKeys(secret);
    expect(a.encryption).toHaveLength(32);
    expect(a.csrf).toHaveLength(32);
    expect(a.receipt).toHaveLength(32);
    expect(a.encryption.equals(a.csrf)).toBe(false);
    expect(a.receipt.equals(a.csrf) || a.receipt.equals(a.encryption)).toBe(false);
    expect(a.encryption.equals(b.encryption)).toBe(true);
    expect(a.version).toBe(CURRENT_KEY_VERSION);
  });

  it('refuses a key that is not 32 bytes', () => {
    expect(() => deriveAuthKeys(randomBytes(16).toString('base64'))).toThrow('32 bytes');
  });
});

describe('encrypt / decrypt (AES-256-GCM)', () => {
  const { encryption } = deriveAuthKeys(secret);

  it('round-trips and uses a fresh IV each time', () => {
    const one = encrypt('JBSWY3DPEHPK3PXP', encryption);
    const two = encrypt('JBSWY3DPEHPK3PXP', encryption);
    expect(one.equals(two)).toBe(false);
    expect(one.toString('utf8')).not.toContain('JBSWY3DPEHPK3PXP');
    expect(decrypt(one, encryption)).toBe('JBSWY3DPEHPK3PXP');
  });

  it('detects tampering', () => {
    const sealed = encrypt('secret', encryption);
    sealed[sealed.length - 1]! ^= 1;
    expect(() => decrypt(sealed, encryption)).toThrow();
  });

  it('fails with the wrong key', () => {
    const other = deriveAuthKeys(randomBytes(32).toString('base64')).encryption;
    expect(() => decrypt(encrypt('secret', encryption), other)).toThrow();
  });
});

describe('helpers', () => {
  it('hashes, signs and compares', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(randomToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const key = Buffer.alloc(32, 1);
    expect(hmacBase64Url(key, 'x')).toBe(hmacBase64Url(key, 'x'));
    expect(hmacBase64Url(key, 'x')).not.toBe(hmacBase64Url(key, 'y'));
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});
