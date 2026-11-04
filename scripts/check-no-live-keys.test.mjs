import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { scan } from './check-no-live-keys.mjs';

// Built at runtime so this test file itself never contains a key-shaped string.
const LIVE = ['rzp', 'live', 'Ab12Cd34Ef56Gh'].join('_');

describe('no live payment keys', () => {
  it('passes test keys, empty placeholders and the regex that rejects live keys', () => {
    const findings = scan([
      { path: '.env.example', text: 'RAZORPAY_KEY_ID=\nRAZORPAY_KEY_SECRET=\n' },
      { path: 'apps/api/src/x.ts', text: "keyId: 'rzp_test_abcdefgh12'\n/^rzp_(test|live)_/" },
      { path: 'docs/x.md', text: 'Live keys start with `rzp_live_`.' },
      { path: 'apps/api/src/y.ts', text: 'RAZORPAY_WEBHOOK_SECRET: SECRET,' },
    ]);
    assert.deepEqual(findings, []);
  });

  it('flags a live key ID with file and line, not the value', () => {
    const findings = scan([{ path: 'apps/web/src/a.ts', text: `ok\nconst k = '${LIVE}';` }]);
    assert.deepEqual(findings, [
      { path: 'apps/web/src/a.ts', line: 2, rule: 'Razorpay live key ID' },
    ]);
  });

  it('flags a filled-in Razorpay secret', () => {
    for (const text of [
      'RAZORPAY_KEY_SECRET=abcdEFGH1234',
      'RAZORPAY_WEBHOOK_SECRET: "whsec-0123456789"',
    ]) {
      assert.equal(scan([{ path: 'deploy/x.yml', text }])[0]?.rule, 'Razorpay secret value');
    }
  });

  it('allows made-up secrets in test files, but never a live key ID there', () => {
    const text = `RAZORPAY_KEY_SECRET: 'secret-secret-123'\nconst k = '${LIVE}';`;
    for (const path of ['apps/api/src/config/env.test.ts', 'apps/web/e2e/a.spec.ts']) {
      assert.deepEqual(
        scan([{ path, text }]).map((f) => f.rule),
        ['Razorpay live key ID'],
      );
    }
  });

  it('flags any committed .env file except .env.example', () => {
    const findings = scan([
      { path: '.env', text: '' },
      { path: 'apps/api/.env.production', text: '' },
      { path: '.env.example', text: '' },
    ]);
    assert.deepEqual(
      findings.map((f) => f.path),
      ['.env', 'apps/api/.env.production'],
    );
  });
});
