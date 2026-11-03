import { describe, expect, it } from 'vitest';
import { burnPasswordCheck, hashPassword, verifyPassword } from './passwords.ts';

describe('passwords (Argon2id)', () => {
  it('hashes with Argon2id and verifies only the right password', async () => {
    const stored = await hashPassword('correct horse battery staple');
    expect(stored).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(await verifyPassword(stored, 'correct horse battery staple')).toBe(true);
    expect(await verifyPassword(stored, 'correct horse battery stapl')).toBe(false);
  });

  it('treats a malformed stored hash as a failed check, not a crash', async () => {
    expect(await verifyPassword('not-a-hash', 'anything')).toBe(false);
  });

  it('can burn a check for unknown accounts', async () => {
    await expect(burnPasswordCheck('whatever')).resolves.toBeUndefined();
  });
});
