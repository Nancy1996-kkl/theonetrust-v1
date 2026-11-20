import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.ts';

/**
 * The only place a database client is created. Feature modules receive a `Db` (or a
 * repository built from one) and never read DATABASE_URL or construct clients themselves.
 *
 * Standard PostgreSQL driver adapter (`pg`) — works the same on Neon (pooled URL),
 * Supabase and plain PostgreSQL. No provider SDK in domain code.
 */
export type Db = PrismaClient;

/** Pool settings for short-lived serverless instances (Phase 2a); the long-running server keeps pg's defaults. */
export interface PoolOptions {
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}

/**
 * `schema` is the Postgres schema every query is qualified with. Prisma writes it into each
 * statement ("schema"."table"); the database role's own search_path does NOT change that, and a
 * `?schema=` in the URL is ignored by the driver (rehearsal, Phase 2b). On the shared Supabase
 * project the trust lives in `theonetrust`, next to the cafe's `public` — so production must say so.
 */
export function createDb(databaseUrl: string, pool: PoolOptions = {}, schema = 'public'): Db {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl, ...pool }, { schema }),
  });
}
