import { randomBytes } from 'node:crypto';

/** Crockford base32 without I, L, O, U — easy to read aloud on a phone call, no look-alikes. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Random characters per reference: 32^12 ≈ 1.2e18 — unguessable and practically collision-free. */
export const REFERENCE_LENGTH = 12;

export const DONATION_REFERENCE_PATTERN = /^TOT-D-[0-9A-HJKMNP-TV-Z]{12}$/;

function randomCode(length: number, bytes: (size: number) => Buffer = randomBytes): string {
  const source = bytes(length);
  let out = '';
  // 256 is a multiple of 32, so `byte % 32` is unbiased.
  for (const byte of source) out += ALPHABET[byte % ALPHABET.length];
  return out;
}

/** Public donation reference shown to donors. Never the database UUID. */
export function newDonationReference(bytes?: (size: number) => Buffer): string {
  return `TOT-D-${randomCode(REFERENCE_LENGTH, bytes)}`;
}
