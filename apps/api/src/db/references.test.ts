import { describe, expect, it } from 'vitest';
import {
  DONATION_REFERENCE_PATTERN,
  REFERENCE_LENGTH,
  newDonationReference,
} from './references.ts';

describe('newDonationReference', () => {
  it('matches the public pattern', () => {
    expect(newDonationReference()).toMatch(DONATION_REFERENCE_PATTERN);
  });

  it('never uses look-alike letters (I, L, O, U)', () => {
    const codes = Array.from({ length: 200 }, () => newDonationReference().slice('TOT-D-'.length));
    expect(codes.join('')).not.toMatch(/[ILOU]/);
  });

  it('maps every byte into the alphabet deterministically', () => {
    const bytes = (size: number) => Buffer.from(Array.from({ length: size }, (_, i) => i * 31));
    const ref = newDonationReference(bytes);
    expect(ref).toBe(newDonationReference(bytes));
    expect(ref).toHaveLength('TOT-D-'.length + REFERENCE_LENGTH);
    expect(ref).toMatch(DONATION_REFERENCE_PATTERN);
  });

  it('is effectively unique', () => {
    const refs = new Set(Array.from({ length: 5000 }, () => newDonationReference()));
    expect(refs.size).toBe(5000);
  });
});
