#!/usr/bin/env node
/**
 * Payments run in Razorpay test mode until launch (#28, #39): no live key may be committed.
 * Scans every tracked file for a Razorpay live key ID, a filled-in Razorpay secret assignment,
 * and any committed .env file other than .env.example. Prints file:line only, never the value.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const RULES = [
  { name: 'Razorpay live key ID', pattern: /rzp_live_[A-Za-z0-9]{8,}/ },
  {
    name: 'Razorpay secret value',
    pattern: /\bRAZORPAY_(?:KEY|WEBHOOK)_SECRET\s*[=:]\s*['"]?[A-Za-z0-9+/_-]{8,}/,
    // Test files pass made-up secrets to the env parser on purpose; a live key ID is never allowed.
    skip: (path) => TEST_FILE.test(path),
  },
];
const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$|(^|\/)src\/test\//;
const ENV_FILE = /(^|\/)\.env(\.[\w-]+)?$/;

/** Returns the findings for a list of { path, text } files. */
export function scan(files) {
  const findings = [];
  for (const { path, text } of files) {
    if (ENV_FILE.test(path) && !path.endsWith('.env.example')) {
      findings.push({ path, line: 0, rule: 'committed .env file' });
    }
    text.split('\n').forEach((line, index) => {
      for (const rule of RULES) {
        if (rule.skip?.(path)) continue;
        if (rule.pattern.test(line)) findings.push({ path, line: index + 1, rule: rule.name });
      }
    });
  }
  return findings;
}

function trackedFiles() {
  const out = spawnSync('git', ['ls-files', '-z'], { encoding: 'utf8' });
  if (out.status !== 0) throw new Error('git ls-files failed');
  return out.stdout
    .split('\0')
    .filter(Boolean)
    .flatMap((path) => {
      try {
        const buffer = readFileSync(path);
        return buffer.includes(0) ? [] : [{ path, text: buffer.toString('utf8') }];
      } catch {
        return []; // deleted in the working tree
      }
    });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const findings = scan(trackedFiles());
  for (const f of findings) console.error(`✖ ${f.path}:${f.line} — ${f.rule}`);
  if (findings.length) {
    console.error('Live payment credentials must never be committed (Razorpay test mode only).');
    process.exit(1);
  }
  console.log('✔ no live payment keys or secrets in tracked files');
}
