import { decrypt, encrypt } from '../../security/crypto.ts';

/**
 * Tax opt-in identity (#34). PAN is stored only as AES-256-GCM ciphertext + key version + last
 * four characters; the address is encrypted the same way. Neither ever appears in a URL, an
 * email, a log line, a public page or an API response — the owner sees a masked PAN only.
 */
export const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const ADDRESS_PREFIX = 'enc:v1:';

export function normalizePan(raw: string): string | null {
  const pan = raw.replace(/\s/g, '').toUpperCase();
  return PAN_PATTERN.test(pan) ? pan : null;
}

/** "ABCDE1234F" → "••••••234F" (last four only). */
export function maskPan(last4: string | null): string | null {
  return last4 ? `••••••${last4}` : null;
}

export function sealPan(pan: string, key: Buffer, version: number) {
  return {
    panCiphertext: new Uint8Array(encrypt(pan, key)),
    panKeyVersion: version,
    panLast4: pan.slice(-4),
  };
}

export function openPan(ciphertext: Uint8Array, key: Buffer): string {
  return decrypt(ciphertext, key);
}

export function sealAddress(address: string, key: Buffer): string {
  return `${ADDRESS_PREFIX}${encrypt(address, key).toString('base64')}`;
}

export function openAddress(stored: string, key: Buffer): string {
  if (!stored.startsWith(ADDRESS_PREFIX)) throw new Error('address not sealed');
  return decrypt(Buffer.from(stored.slice(ADDRESS_PREFIX.length), 'base64'), key);
}

const IST_OFFSET_MS = 330 * 60_000;

/**
 * Tax benefit is offered only when the owner switched it on AND the RNPO reference and the
 * Section 354 approval are recorded AND the approval is still valid today (IST). Default: off.
 */
export function taxOptInOffered(
  settings: {
    taxBenefitEnabled: boolean;
    rnpoReference: string | null;
    section354Approval: string | null;
    approvalValidUntil: Date | null;
  } | null,
  now: Date,
): boolean {
  if (!settings?.taxBenefitEnabled) return false;
  if (!settings.rnpoReference || !settings.section354Approval || !settings.approvalValidUntil) {
    return false;
  }
  const today = new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
  return settings.approvalValidUntil.toISOString().slice(0, 10) >= today;
}
