import { loadEnv, type Env } from '../config/env.ts';
import { formatReport, launchReadiness } from './launch-check.ts';

// Prints yes/no per item, never a value. Exit 1 if anything is not ready.
let env: Env;
try {
  env = loadEnv();
} catch (error) {
  const keys = (error as { invalidKeys?: string[] }).invalidKeys ?? [];
  process.stderr.write(
    `✖ configuration is not valid: ${keys.join(', ') || 'see the error above'}\n`,
  );
  process.exit(1);
}
const checks = launchReadiness(env);
process.stdout.write(`${formatReport(checks)}\n`);
process.exit(checks.every((c) => c.ok) ? 0 : 1);
