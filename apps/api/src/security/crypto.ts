import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

/** Purpose-specific keys derived from AUTH_SECRET_KEY, so one leak cannot be reused elsewhere. */
export interface AuthKeys {
  /** AES-256-GCM key for secrets at rest (authenticator secrets; PAN later). */
  encryption: Buffer;
  /** HMAC key for CSRF tokens. */
  csrf: Buffer;
  /** HMAC key that turns a receipt's random salt into its share-link token (#29). */
  receipt: Buffer;
  /** HMAC key that turns a subscription's random salt into its manage-link token (#32). */
  manage: Buffer;
  /** Version stored next to every ciphertext, for key rotation. */
  version: number;
}

export const CURRENT_KEY_VERSION = 1;

export function deriveAuthKeys(base64Secret: string): AuthKeys {
  const master = Buffer.from(base64Secret, 'base64');
  if (master.length !== 32) throw new Error('AUTH_SECRET_KEY must decode to 32 bytes');
  const derive = (info: string) =>
    Buffer.from(hkdfSync('sha256', master, Buffer.alloc(0), `theonetrust:${info}`, 32));
  return {
    encryption: derive('encryption:v1'),
    csrf: derive('csrf:v1'),
    receipt: derive('receipt-link:v1'),
    manage: derive('manage-link:v1'),
    version: CURRENT_KEY_VERSION,
  };
}

const IV_BYTES = 12;
const TAG_BYTES = 16;

/** iv ‖ tag ‖ ciphertext. A fresh random IV every time. */
export function encrypt(plain: string, key: Buffer): Buffer {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
}

/** Throws if the data was tampered with or the key is wrong. */
export function decrypt(sealed: Uint8Array, key: Buffer): string {
  const data = Buffer.from(sealed);
  const iv = data.subarray(0, IV_BYTES);
  const tag = data.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(data.subarray(IV_BYTES + TAG_BYTES)),
    decipher.final(),
  ]).toString('utf8');
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function hmacBase64Url(key: Buffer, value: string): string {
  return createHmac('sha256', key).update(value, 'utf8').digest('base64url');
}

/** Constant-time string comparison (length is not secret here). */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
