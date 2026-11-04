import type { Db } from './client.ts';
import { programmeRepository } from './repositories/programmes.ts';
import { trustSettingsRepository } from './repositories/trust-settings.ts';

/**
 * Synthetic development data only. Every value is visibly fake ("[SYNTHETIC]") and inactive,
 * so it can never be mistaken for a real programme. No donors, payments or admin users.
 */
export const SYNTHETIC_PROGRAMMES = [
  {
    slug: 'synthetic-education',
    titleEn: '[SYNTHETIC] Education support',
    titleTa: '[SYNTHETIC] கல்வி உதவி',
    sortOrder: 1,
  },
  {
    slug: 'synthetic-food',
    titleEn: '[SYNTHETIC] Food and essentials',
    titleTa: '[SYNTHETIC] உணவு மற்றும் அத்தியாவசியம்',
    sortOrder: 2,
  },
  {
    slug: 'synthetic-health',
    titleEn: '[SYNTHETIC] Health support',
    titleTa: '[SYNTHETIC] மருத்துவ உதவி',
    sortOrder: 3,
  },
] as const;

export class SeedRefusedError extends Error {
  constructor() {
    super('Refusing to seed: synthetic data is for development and test databases only.');
    this.name = 'SeedRefusedError';
  }
}

export async function seedSyntheticData(db: Db, nodeEnv: string | undefined): Promise<void> {
  if (nodeEnv === 'production') throw new SeedRefusedError();
  const programmes = programmeRepository(db);
  for (const programme of SYNTHETIC_PROGRAMMES) {
    await programmes.upsertBySlug({ ...programme, active: false, designation: 'GENERAL' });
  }
  await trustSettingsRepository(db).get();
}
