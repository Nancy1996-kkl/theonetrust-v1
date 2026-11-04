import { randomBytes } from 'node:crypto';
import { sha256Hex } from '../../security/crypto.ts';

export const RECOVERY_CODE_COUNT = 10;
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ'; // no 0/O, 1/I/L, U
export const RECOVERY_CODE_PATTERN = /^[2-9A-HJKMNP-TV-Z]{5}-[2-9A-HJKMNP-TV-Z]{5}$/;

function randomChars(count: number): string {
  let out = '';
  // Rejection sampling keeps every character equally likely (256 is not a multiple of 30).
  while (out.length < count) {
    for (const byte of randomBytes(count * 2)) {
      if (byte < 240 && out.length < count) out += ALPHABET[byte % ALPHABET.length];
    }
  }
  return out;
}

export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  return Array.from({ length: count }, () => `${randomChars(5)}-${randomChars(5)}`);
}

/** Accepts lower case, spaces and a missing dash: what people actually type. */
export function normalizeRecoveryCode(input: string): string | null {
  const compact = input.replace(/[\s-]/g, '').toUpperCase();
  const code = `${compact.slice(0, 5)}-${compact.slice(5)}`;
  return RECOVERY_CODE_PATTERN.test(code) ? code : null;
}

export function hashRecoveryCode(code: string): string {
  return sha256Hex(`recovery:${code}`);
}
