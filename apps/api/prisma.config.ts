import { defineConfig } from 'prisma/config';

/**
 * Prisma ORM 7 configuration (pinned; see docs/decisions/0006-prisma-7-postgres.md).
 * Migrations use the DIRECT (unpooled) connection. The app runtime uses DATABASE_URL (pooled)
 * through src/db/client.ts. `prisma generate` needs no database, so the URL may be absent there.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env.DIRECT_URL ?? '',
  },
});
