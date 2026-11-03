import { describe, expect, it } from 'vitest';
import { OwnerAccountError, checkNewPassword } from './owner-account.ts';

describe('checkNewPassword', () => {
  it('accepts a long passphrase', () => {
    expect(() => checkNewPassword('river mango lamp seventeen', 'owner@example.org')).not.toThrow();
  });

  it.each([
    ['too short', 'short-pass1'],
    ['too long', 'x'.repeat(129)],
    ['contains the email name', 'my-owner-password-2026'],
  ])('rejects a password that is %s', (_why, password) => {
    expect(() => checkNewPassword(password, 'owner@example.org')).toThrow(OwnerAccountError);
  });
});
