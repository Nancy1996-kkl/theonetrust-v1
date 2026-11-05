#!/usr/bin/env node
/**
 * Secrets scan of the BUILT web bundle (#38). Everything in apps/web/dist is public, source maps
 * included. Fails if a server-only setting name, a secret-shaped value or server-only code
 * reached it. Prints file and rule only, never the matched value.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Server-only settings (apps/api/src/config/env.ts). Their NAMES must not appear either. */
const SERVER_SETTINGS = [
  'RAZORPAY_KEY_SECRET',
  'RAZORPAY_WEBHOOK_SECRET',
  'AUTH_SECRET_KEY',
  'EMAIL_API_KEY',
  'DATABASE_URL',
  'DIRECT_URL',
  'OWNER_NOTIFICATION_EMAIL',
  'DOCUMENT_STORAGE_DIR',
];

export const RULES = [
  { name: 'server-only setting name', pattern: new RegExp(`\\b(${SERVER_SETTINGS.join('|')})\\b`) },
  { name: 'Razorpay live key ID', pattern: /rzp_live_[A-Za-z0-9]{8,}/ },
  { name: 'private key', pattern: /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/ },
  { name: 'database URL', pattern: /\bpostgres(?:ql)?:\/\/[^\s'"`]+/ },
  { name: 'AWS access key', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  // Server-only packages must never be bundled for the browser.
  {
    name: 'server-only package',
    pattern: /@prisma\/client|generated\/prisma|node_modules\/(?:pg|razorpay|pdfkit)\//,
  },
];

/** Returns findings for a list of { path, text }. */
export function scan(files) {
  const findings = [];
  for (const { path, text } of files) {
    for (const rule of RULES) if (rule.pattern.test(text)) findings.push({ path, rule: rule.name });
  }
  return findings;
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dist = fileURLToPath(new URL('../apps/web/dist', import.meta.url));
  let files;
  try {
    files = walk(dist)
      .filter((f) => /\.(js|mjs|map|html|css|json|txt|xml|webmanifest)$|_headers$/.test(f))
      .map((f) => ({ path: relative(dist, f), text: readFileSync(f, 'utf8') }));
  } catch {
    console.error('✖ apps/web/dist not found — run `pnpm build` first');
    process.exit(1);
  }
  const findings = scan(files);
  for (const f of findings) console.error(`✖ dist/${f.path} — ${f.rule}`);
  if (findings.length) {
    console.error('Server-only values or code reached the public web bundle.');
    process.exit(1);
  }
  console.log(`✔ web bundle clean (${files.length} files scanned, source maps included)`);
}
