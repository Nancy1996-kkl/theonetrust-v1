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
      include: [
        // Exactly what the unit suite leaves out: code that needs PostgreSQL.
        'src/db/repositories/**',
        'src/db/seed.ts',
        'src/modules/auth/http.ts',
        'src/modules/auth/repository.ts',
        'src/modules/auth/routes.ts',
        'src/modules/auth/service.ts',
        'src/modules/admin/**',
        'src/modules/audit/query.ts',
        'src/modules/public-content/repository.ts',
        'src/modules/help/admin-routes.ts',
        'src/modules/help/public-routes.ts',
        'src/modules/donations/routes.ts',
        'src/modules/payments/bank-admin-routes.ts',
        'src/modules/payments/reconcile.ts',
        'src/modules/payments/verify-routes.ts',
        'src/modules/payments/webhook-routes.ts',
        'src/modules/receipts/issue.ts',
        'src/modules/receipts/routes.ts',
        'src/modules/receipts/view.ts',
        'src/cli/owner-account.ts',
        'src/test/db-global-setup.ts',
        'src/test/db.ts',
      ],
      exclude: ['src/**/*.test.ts'],
      reportsDirectory: 'coverage/db',
      thresholds: { lines: 90, functions: 90, branches: 85, statements: 90 },
    },
  },
});
