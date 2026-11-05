import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scan } from './check-bundle-secrets.mjs';

const live = ['rzp', 'live', 'ABCDEFGH1234'].join('_');

test('flags server-only names, secret shapes and server code in the bundle', () => {
  const files = [
    { path: 'assets/a.js', text: 'const x = process.env.RAZORPAY_KEY_SECRET;' },
    { path: 'assets/b.js', text: `key:"${live}"` },
    { path: 'assets/c.js.map', text: '"-----BEGIN PRIVATE KEY-----"' },
    { path: 'assets/d.js', text: 'u="postgresql://user:pw@db.example/tot"' },
    { path: 'assets/e.js', text: 'import "@prisma/client"' },
    { path: 'assets/f.js', text: 'AKIAABCDEFGHIJKLMNOP' },
  ];
  assert.deepEqual(
    scan(files).map((f) => f.rule),
    [
      'server-only setting name',
      'Razorpay live key ID',
      'private key',
      'database URL',
      'server-only package',
      'AWS access key',
    ],
  );
});

test('a normal bundle passes (public key IDs and API URLs are fine)', () => {
  const files = [
    {
      path: 'assets/app.js',
      text: 'fetch("https://api.example.org/api/v1/health");key:"rzp_test_x"',
    },
    { path: 'index.html', text: '<script type="module" src="/assets/app.js"></script>' },
  ];
  assert.deepEqual(scan(files), []);
});
