import { defineConfig } from 'vitest/config';

/**
 * Database suite: runs against a real, EMPTY PostgreSQL database named by TEST_DATABASE_URL.
 * Global setup wipes the schema and applies every committed migration from scratch, so each
 * run proves "migrate from an empty database" and the constraints the migration adds.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.db.test.ts'],
    environment: 'node',
    globalSetup: ['src/test/db-global-setup.ts'],
    // One database: files must not run in parallel.
    fileParallelism: false,
    expect: { requireAssertions: true },
    coverage: {
      provider: 'v8',
      include: ['src/db/**/*.ts', 'src/modules/**/*.ts', 'src/cli/owner-account.ts'],
      exclude: ['src/**/*.test.ts'],
      reportsDirectory: 'coverage/db',
      thresholds: { lines: 90, functions: 90, branches: 85, statements: 90 },
    },
  },
});
