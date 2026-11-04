import type { Prisma } from '../../generated/prisma/client.ts';
import type { Db } from '../client.ts';

/** Singleton row (id = 1, enforced by a CHECK constraint). Defaults are the safe ones. */
export function trustSettingsRepository(db: Db) {
  return {
    /** Returns the settings, creating the default row (tax benefit OFF) on first use. */
    get() {
      return db.trustSettings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
    },
  };
}

/** The owner address for notifications: the saved setting first, then the server's. */
export async function ownerEmailFor(
  db: Pick<Db, 'trustSettings'> | Prisma.TransactionClient,
  fallback: string | undefined,
): Promise<string | undefined> {
  const row = await db.trustSettings.findUnique({
    where: { id: 1 },
    select: { ownerEmail: true },
  });
  return row?.ownerEmail ?? fallback;
}
