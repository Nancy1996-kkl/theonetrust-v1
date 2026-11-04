import { execFileSync } from 'node:child_process';
import pg from 'pg';

/** Refuse anything that looks like a hosted database: this setup DROPS the whole schema. */
const LOCAL_HOST = /^postgres(ql)?:\/\/[^@]*@(localhost|127\.0\.0\.1|postgres)(:\d+)?\//;

export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      'TEST_DATABASE_URL is not set. The database suite needs an empty local PostgreSQL ' +
        '(see docs/database-provider-switch.md → "Run the database tests").',
    );
  }
  if (!LOCAL_HOST.test(url)) {
    throw new Error('TEST_DATABASE_URL must point at a local/CI PostgreSQL, never a hosted one.');
  }
  return url;
}

export default async function setup(): Promise<void> {
  const url = testDatabaseUrl();
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
  } finally {
    await client.end();
  }
  // Same command production uses: every committed migration, in order, on an empty schema.
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    stdio: 'inherit',
    env: { ...process.env, DIRECT_URL: url },
  });
}
