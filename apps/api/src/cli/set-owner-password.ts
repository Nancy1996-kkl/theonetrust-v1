import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { loadEnv } from '../config/env.ts';
import { createDb } from '../db/client.ts';
import { OwnerAccountError, setOwnerPassword } from './owner-account.ts';

// Interactive: the password is typed, never passed as an argument (shell history) or env var.
const env = loadEnv();
if (!env.DATABASE_URL) {
  console.error('Set DATABASE_URL first.');
  process.exit(1);
}
const rl = createInterface({ input: stdin, output: stdout, terminal: true });
const email = await rl.question('Owner email: ');
stdout.write('New password (input hidden): ');
(rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = () => undefined;
const password = await rl.question('');
rl.close();
stdout.write('\n');

const db = createDb(env.DATABASE_URL);
try {
  const owner = await setOwnerPassword(db, email, password);
  stdout.write(
    `Owner account ready: ${owner.email}. Set up the authenticator at the next sign-in.\n`,
  );
} catch (error) {
  console.error(
    error instanceof OwnerAccountError ? error.message : 'Could not save the owner account.',
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
