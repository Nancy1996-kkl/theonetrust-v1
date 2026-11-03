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
