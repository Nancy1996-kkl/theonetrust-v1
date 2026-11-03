import { hash, verify } from '@node-rs/argon2';

/** Argon2id with OWASP-recommended parameters (19 MiB, 2 iterations, 1 lane). */
const OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    // A malformed stored hash is a failed login, never a crash or a bypass.
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/**
 * Verifies against a throwaway hash when the email is unknown, so the response time does not
 * reveal whether an account exists.
 */
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= hashPassword('not-a-real-account-password');
  await verifyPassword(await dummyHash, password);
}
