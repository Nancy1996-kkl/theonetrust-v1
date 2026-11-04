import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  maskPan,
  normalizePan,
  openAddress,
  openPan,
  sealAddress,
  sealPan,
  taxOptInOffered,
} from './identity.ts';

const key = randomBytes(32);

describe('PAN', () => {
  it('accepts only the PAN format (spaces and case normalised)', () => {
    expect(normalizePan('abcde 1234 f')).toBe('ABCDE1234F');
    for (const bad of ['', 'ABCDE1234', 'ABCD12345F', '1BCDE1234F', 'ABCDE1234FF']) {
      expect(normalizePan(bad)).toBeNull();
    }
  });

  it('is encrypted at rest (fresh IV), decrypts only with the key, and is masked to 4 characters', () => {
    const a = sealPan('ABCDE1234F', key, 1);
    const b = sealPan('ABCDE1234F', key, 1);
    expect(Buffer.from(a.panCiphertext).toString('latin1')).not.toContain('ABCDE');
    expect(Buffer.from(a.panCiphertext).equals(Buffer.from(b.panCiphertext))).toBe(false);
    expect(openPan(a.panCiphertext, key)).toBe('ABCDE1234F');
    expect(() => openPan(a.panCiphertext, randomBytes(32))).toThrow();
    expect(a).toMatchObject({ panKeyVersion: 1, panLast4: '234F' });
    expect(maskPan('234F')).toBe('••••••234F');
    expect(maskPan(null)).toBeNull();
  });

  it('the address is encrypted too', () => {
    const sealed = sealAddress('12 Synthetic Street, Chennai 600001', key);
    expect(sealed).toMatch(/^enc:v1:/);
    expect(sealed).not.toContain('Chennai');
    expect(openAddress(sealed, key)).toBe('12 Synthetic Street, Chennai 600001');
    expect(() => openAddress('plain text', key)).toThrow();
  });
});

describe('tax opt-in is offered only when everything is confirmed', () => {
  const ok = {
    taxBenefitEnabled: true,
    rnpoReference: 'RNPO-TEST',
    section354Approval: 'APPROVAL-TEST',
    approvalValidUntil: new Date('2027-03-31T00:00:00Z'),
  };
  const now = new Date('2026-11-04T05:00:00Z');
  it.each([
    ['everything confirmed', ok, true],
    ['switched off (the default)', { ...ok, taxBenefitEnabled: false }, false],
    ['no RNPO reference', { ...ok, rnpoReference: null }, false],
    ['no approval number', { ...ok, section354Approval: null }, false],
    ['no validity date', { ...ok, approvalValidUntil: null }, false],
    ['approval expired', { ...ok, approvalValidUntil: new Date('2026-11-03T00:00:00Z') }, false],
    [
      'valid until today (IST)',
      { ...ok, approvalValidUntil: new Date('2026-11-04T00:00:00Z') },
      true,
    ],
  ])('%s → %s', (_label, settings, offered) => {
    expect(taxOptInOffered(settings, now)).toBe(offered);
  });
  it('no settings → off', () => {
    expect(taxOptInOffered(null, now)).toBe(false);
  });
});
