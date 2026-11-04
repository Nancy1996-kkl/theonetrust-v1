import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Database tests need PostgreSQL and run separately: `pnpm test:db` (vitest.db.config.ts).
    exclude: ['src/**/*.db.test.ts', 'node_modules/**'],
    environment: 'node',
    // A test that never asserts is a test that never fails.
    expect: { requireAssertions: true },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/server.ts',
        'src/generated/**',
        // Covered by the database suite, which has its own thresholds.
        'src/db/repositories/**',
        'src/db/seed.ts',
        'src/test/db-global-setup.ts',
        'src/test/db.ts',
      ],
      thresholds: { lines: 90, functions: 90, branches: 85, statements: 90 },
    },
  },
});
