import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  apiOrigin,
  contentSecurityPolicy,
  headersFile,
  webSecurityHeaders,
} from './security-headers.mjs';

test('the CSP allows only our origin, the API origin and Cashfree; never inline script', () => {
  const csp = contentSecurityPolicy({
    apiBaseUrl: 'https://api.theonetrust.in/api/v1',
    production: true,
  });
  assert.match(csp, /script-src 'self' https:\/\/sdk\.cashfree\.com;/);
  assert.doesNotMatch(csp, /script-src[^;]*unsafe/);
  assert.match(
    csp,
    /connect-src 'self' https:\/\/api\.theonetrust\.in https:\/\/sdk\.cashfree\.com/,
  );
  assert.match(csp, /img-src 'self' data: https:\/\/\*\.cashfree\.com;/);
  // Cashfree's pop-up (Phase 5): its script host, and the sandbox and live API hosts.
  assert.match(
    csp,
    /connect-src [^;]*https:\/\/sdk\.cashfree\.com https:\/\/sandbox\.cashfree\.com https:\/\/api\.cashfree\.com;/,
  );
  assert.match(
    csp,
    /frame-src https:\/\/sdk\.cashfree\.com https:\/\/sandbox\.cashfree\.com https:\/\/api\.cashfree\.com;/,
  );
  // Nothing wider than the plan's narrow list: no wildcard script, frame or connect host.
  assert.doesNotMatch(csp, /(script|frame|connect)-src[^;]*\*\.cashfree/);
  // Razorpay is retired: none of its hosts (nor the fonts its button pulled in) are allowed.
  assert.doesNotMatch(csp, /razorpay|googleapis|gstatic/);
  const headers = webSecurityHeaders({ apiBaseUrl: undefined, production: true });
  assert.equal(
    headers['Permissions-Policy'],
    'camera=(), microphone=(), geolocation=(), payment=(self "https://sdk.cashfree.com")',
  );
  assert.match(csp, /style-src 'self' 'unsafe-inline';/);
  assert.match(csp, /font-src 'self';/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /upgrade-insecure-requests$/);
});

test('a relative or missing API URL adds nothing; development has no HSTS or upgrade', () => {
  assert.equal(apiOrigin('/api/v1'), null);
  assert.equal(apiOrigin(undefined), null);
  const csp = contentSecurityPolicy({ apiBaseUrl: '/api/v1', production: false });
  assert.match(csp, /connect-src 'self' https:\/\/sdk\.cashfree\.com/);
  assert.match(csp, /img-src 'self' data: https:\/\/\*\.cashfree\.com;/);
  assert.doesNotMatch(csp, /upgrade-insecure-requests/);
  const dev = webSecurityHeaders({ apiBaseUrl: undefined, production: false });
  assert.equal(dev['Strict-Transport-Security'], undefined);
  assert.equal(dev['X-Frame-Options'], 'DENY');
});

test('_headers covers every path and keeps receipts, manage links and admin out of caches', () => {
  const file = headersFile(webSecurityHeaders({ apiBaseUrl: undefined, production: true }));
  assert.match(file, /^\/\*\n {2}Content-Security-Policy: /);
  assert.match(file, /Strict-Transport-Security: max-age=63072000/);
  for (const path of ['/receipt/*', '/ta/receipt/*', '/manage/*', '/ta/manage/*', '/admin/*']) {
    assert.ok(file.includes(`${path}\n  Cache-Control: no-store`), path);
  }
});
