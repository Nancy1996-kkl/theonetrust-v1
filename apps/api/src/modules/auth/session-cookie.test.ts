import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { deriveAuthKeys } from '../../security/crypto.ts';
import { csrfTokenFor } from './session-cookie.ts';

describe('csrfTokenFor', () => {
  const keys = deriveAuthKeys(randomBytes(32).toString('base64'));

  it('is bound to one session: stable for it, different for any other session or key', () => {
    const token = csrfTokenFor(keys, 'session-a');
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(csrfTokenFor(keys, 'session-a')).toBe(token);
    expect(csrfTokenFor(keys, 'session-b')).not.toBe(token);
    const otherKeys = deriveAuthKeys(randomBytes(32).toString('base64'));
    expect(csrfTokenFor(otherKeys, 'session-a')).not.toBe(token);
  });

  it('never contains the session token it is derived from', () => {
    const session = randomBytes(32).toString('base64url');
    expect(csrfTokenFor(keys, session)).not.toContain(session.slice(0, 12));
  });
});
