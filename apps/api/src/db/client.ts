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

export function createDb(databaseUrl: string): Db {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
}
