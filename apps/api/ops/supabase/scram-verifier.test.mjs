import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { describe, it } from 'node:test';
import { scramVerifier } from './scram-verifier.mjs';

const SALT = Buffer.from('W22ZaJ0SNY7soEsUEjb6gQ==', 'base64');

describe('scram-verifier (Phase 2b): the password never reaches Supabase', () => {
  it('matches an independent RFC 5802/7677 computation (Python hashlib, same salt)', () => {
    assert.equal(
      scramVerifier('pencil', SALT),
      'SCRAM-SHA-256$4096:W22ZaJ0SNY7soEsUEjb6gQ==$WG5d8oPm3OtcPnkdi4Uo7BkeZkBFzpcXkuLmtbsT4qY=:wfPLwcE6nTWhTAmQ7tl2KeoiWGPlZqQxSrmfPwDl2dU=',
    );
  });

  it('never contains the password, uses a fresh salt each time, and has Postgres’s format', () => {
    const password = 'a-long-generated-password-for-tests';
    const a = scramVerifier(password);
    const b = scramVerifier(password);
    assert.notEqual(a, b);
    for (const v of [a, b]) {
      assert.match(
        v,
        /^SCRAM-SHA-256\$4096:[A-Za-z0-9+/]{22}==\$[A-Za-z0-9+/]{43}=:[A-Za-z0-9+/]{43}=$/,
      );
      assert.ok(!v.includes(password));
    }
  });
});
