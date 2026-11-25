import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  inSync,
  PRIVATE_LINK_SOURCES,
  SITE_PAGES,
  vercelHeaders,
  withHeaders,
} from './sync-vercel-headers.mjs';

const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const rule = (source) => config.headers.find((r) => r.source === source);
const value = (r, key) => r?.headers.find((h) => h.key === key)?.value;

describe('vercel.json security headers (audit F-2)', () => {
  it('vercel.json is in sync with apps/web/scripts/security-headers.mjs (drift check)', () => {
    assert.ok(inSync(config), 'run: node scripts/sync-vercel-headers.mjs');
  });

  it('every page gets the CSP, Permissions-Policy, COOP and HSTS', () => {
    const all = rule(SITE_PAGES);
    for (const key of [
      'Content-Security-Policy',
      'Permissions-Policy',
      'Cross-Origin-Opener-Policy',
      'Strict-Transport-Security',
      'X-Content-Type-Options',
      'X-Frame-Options',
      'Referrer-Policy',
    ]) {
      assert.ok(value(all, key), `${key} missing`);
    }
  });

  it('the CSP never allows inline or eval scripts, and keeps framing and objects off', () => {
    const csp = value(rule(SITE_PAGES), 'Content-Security-Policy');
    const script = csp.split(';').find((d) => d.trim().startsWith('script-src'));
    assert.ok(script);
    assert.doesNotMatch(script, /unsafe-inline|unsafe-eval|\*|data:/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.match(csp, /object-src 'none'/);
    assert.match(csp, /upgrade-insecure-requests/);
  });

  it('private links and admin are never cached; admin is not indexed; assets are immutable', () => {
    for (const source of PRIVATE_LINK_SOURCES) {
      assert.equal(value(rule(source), 'Cache-Control'), 'no-store', source);
      assert.equal(value(rule(source), 'Referrer-Policy'), 'no-referrer', source);
    }
    assert.equal(value(rule('/admin(.*)'), 'Cache-Control'), 'no-store');
    assert.equal(value(rule('/admin(.*)'), 'X-Robots-Tag'), 'noindex, nofollow');
    assert.match(value(rule('/assets/(.*)'), 'Cache-Control'), /immutable/);
  });

  it('specific rules come after the catch-all, so they override it', () => {
    const order = vercelHeaders().map((r) => r.source);
    assert.equal(order[0], SITE_PAGES);
    assert.ok(order.indexOf('/receipt/(.*)') > 0);
  });

  it('site headers skip /api (the API sends its own); every page still matches', () => {
    const re = new RegExp(`^${SITE_PAGES}$`);
    for (const page of ['/', '/privacy', '/ta/privacy', '/assets/app.js', '/receipt/x', '/apix'])
      assert.ok(re.test(page), page);
    for (const api of ['/api/v1/health', '/api/v1/webhooks/cashfree'])
      assert.ok(!re.test(api), api);
  });

  it('a changed header is detected as drift; regenerating keeps every other setting', () => {
    const drifted = structuredClone(config);
    drifted.headers[0].headers[0].value = 'default-src *';
    assert.equal(inSync(drifted), false);
    const fixed = withHeaders(drifted);
    assert.ok(inSync(fixed));
    assert.deepEqual(fixed.rewrites, config.rewrites);
    assert.equal(fixed.buildCommand, config.buildCommand);
  });
});
