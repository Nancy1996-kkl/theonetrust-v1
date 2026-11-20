#!/usr/bin/env node
/**
 * Turns a database password into a SCRAM-SHA-256 verifier on YOUR computer (Phase 2b).
 *
 * The Supabase project logs DDL statements, so `ALTER ROLE … PASSWORD 'plain text'` in the SQL
 * editor would write the password into the database logs and the editor history. Postgres accepts
 * a ready-made verifier instead: the password itself never leaves this computer.
 *
 *   node apps/api/ops/supabase/scram-verifier.mjs theonetrust_app
 *     → asks for the password (typing is hidden), prints one line:
 *       ALTER ROLE theonetrust_app PASSWORD 'SCRAM-SHA-256$4096:…';
 *
 * Paste that line into the SQL editor. It contains no password: only a one-way verifier.
 * Standard: RFC 5802 / RFC 7677, as Postgres stores it (4096 iterations, 16-byte salt).
 */
import { createHash, createHmac, pbkdf2Sync, randomBytes } from 'node:crypto';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ITERATIONS = 4096;

export function scramVerifier(password, salt = randomBytes(16), iterations = ITERATIONS) {
  const salted = pbkdf2Sync(password.normalize('NFKC'), salt, iterations, 32, 'sha256');
  const clientKey = createHmac('sha256', salted).update('Client Key').digest();
  const storedKey = createHash('sha256').update(clientKey).digest();
  const serverKey = createHmac('sha256', salted).update('Server Key').digest();
  return `SCRAM-SHA-256$${iterations}:${salt.toString('base64')}$${storedKey.toString('base64')}:${serverKey.toString('base64')}`;
}

const ROLES = new Set(['theonetrust_app', 'theonetrust_owner']);

async function readHidden(prompt) {
  process.stderr.write(prompt);
  const { stdin } = process;
  if (!stdin.isTTY) {
    let data = '';
    for await (const chunk of stdin) data += chunk;
    return data.replace(/\r?\n$/, '');
  }
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding('utf8');
  return new Promise((resolve) => {
    let value = '';
    stdin.on('data', function onData(ch) {
      if (ch === '\r' || ch === '\n' || ch === '\u0004') {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.off('data', onData);
        process.stderr.write('\n');
        resolve(value);
      } else if (ch === '\u0003') {
        process.exit(130);
      } else if (ch === '\u007f') {
        value = value.slice(0, -1);
      } else {
        value += ch;
      }
    });
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const role = process.argv[2];
  if (!ROLES.has(role)) {
    process.stderr.write('Usage: node scram-verifier.mjs theonetrust_app|theonetrust_owner\n');
    process.exit(1);
  }
  const password = await readHidden(`Password for ${role} (hidden): `);
  if (password.length < 20) {
    process.stderr.write('Use a generated password of at least 20 characters.\n');
    process.exit(1);
  }
  process.stdout.write(`ALTER ROLE ${role} PASSWORD '${scramVerifier(password)}';\n`);
}
