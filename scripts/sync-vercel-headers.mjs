#!/usr/bin/env node
/**
 * Vercel serves the site's response headers ONLY from vercel.json — it ignores dist/_headers (the
 * Cloudflare/Netlify format). Audit F-2 found the live site sending no Content-Security-Policy.
 *
 * This script writes the `headers` block of vercel.json from the same source the e2e tests run
 * under (apps/web/scripts/security-headers.mjs), so production and tests cannot drift:
 *
 *   node scripts/sync-vercel-headers.mjs          rewrite vercel.json's headers
 *   node scripts/sync-vercel-headers.mjs --check  exit 1 if vercel.json differs (CI drift check)
 *
 * The API is same-origin on Vercel (relative /api/v1), so no extra API origin is added.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { webSecurityHeaders } from '../apps/web/scripts/security-headers.mjs';

const VERCEL_JSON = fileURLToPath(new URL('../vercel.json', import.meta.url));

/** Private links (acknowledgements, monthly-giving management) are never cached or referred. */
export const PRIVATE_LINK_SOURCES = [
  '/receipt/(.*)',
  '/ta/receipt/(.*)',
  '/manage/(.*)',
  '/ta/manage/(.*)',
];

const entries = (headers) => Object.entries(headers).map(([key, value]) => ({ key, value }));

/** The full `headers` array for vercel.json. Later rules override earlier ones for a key. */
export function vercelHeaders() {
  const privateLink = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };
  return [
    { source: '/(.*)', headers: entries(webSecurityHeaders({ production: true })) },
    {
      source: '/assets/(.*)',
      headers: entries({ 'Cache-Control': 'public, max-age=31536000, immutable' }),
    },
    ...PRIVATE_LINK_SOURCES.map((source) => ({ source, headers: entries(privateLink) })),
    {
      source: '/admin(.*)',
      headers: entries({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' }),
    },
  ];
}

/** True when vercel.json's headers are exactly what the generator produces. */
export function inSync(config) {
  return isDeepStrictEqual(config.headers, vercelHeaders());
}

export function withHeaders(config) {
  return { ...config, headers: vercelHeaders() };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const config = JSON.parse(readFileSync(VERCEL_JSON, 'utf8'));
  if (process.argv.includes('--check')) {
    if (!inSync(config)) {
      console.error(
        'vercel.json headers are out of date: run node scripts/sync-vercel-headers.mjs',
      );
      process.exit(1);
    }
    console.log('✔ vercel.json headers match apps/web/scripts/security-headers.mjs');
  } else {
    writeFileSync(VERCEL_JSON, `${JSON.stringify(withHeaders(config), null, 2)}\n`);
    console.log('vercel.json headers written');
  }
}
