import { createHmac, randomBytes } from 'node:crypto';
import { sha256Hex } from '../../security/crypto.ts';

/** Bumped whenever the acknowledgement layout or wording changes; stored on every receipt. */
export const RECEIPT_TEMPLATE_VERSION = 'ack-v1';

const IST_OFFSET_MS = 330 * 60_000;

/** Indian financial year (April–March, IST) of a moment, as `2026-27`. */
export function financialYear(at: Date): string {
  const ist = new Date(at.getTime() + IST_OFFSET_MS);
  const year = ist.getUTCMonth() >= 3 ? ist.getUTCFullYear() : ist.getUTCFullYear() - 1;
  return `${year}-${String((year + 1) % 100).padStart(2, '0')}`;
}

/** `TOT-R-2026-27-000123`. The sequence comes from the database, never the browser. */
export function formatReceiptNumber(at: Date, sequence: number | bigint): string {
  return `TOT-R-${financialYear(at)}-${String(sequence).padStart(6, '0')}`;
}

/** 128 random bits, base64url (22 chars). Stored; useless without the receipt key. */
export function newTokenSalt(): string {
  return randomBytes(16).toString('base64url');
}

/**
 * The share-link token: HMAC(receipt key, salt), base64url (43 chars). Never stored — the server
 * re-derives it when the donor, an email or the owner needs the link; only its SHA-256 is kept.
 */
export function receiptToken(key: Buffer, salt: string): string {
  return createHmac('sha256', key).update(`receipt:${salt}`).digest('base64url');
}

export function receiptTokenHash(token: string): string {
  return sha256Hex(token);
}
