import { describe, expect, it } from 'vitest';
import { rupeesToPaise } from '@theonetrust/contracts';
import { DONATION_REFERENCE_PATTERN } from './references.ts';
import { donationRepository } from './repositories/donations.ts';
import { programmeRepository } from './repositories/programmes.ts';
import { trustSettingsRepository } from './repositories/trust-settings.ts';
import { SYNTHETIC_PROGRAMMES, SeedRefusedError, seedSyntheticData } from './seed.ts';
import { unique, useTestDb } from '../test/db.ts';

const db = useTestDb();

describe('donationRepository', () => {
  const donations = donationRepository(db);

  it('creates an intent in CREATED with an unguessable public reference', async () => {
    const intent = await donations.createIntent({
      giftPaise: rupeesToPaise(1),
      donorName: 'Synthetic Donor',
      locale: 'ta',
    });
    expect(intent.status).toBe('CREATED');
    expect(intent.publicReference).toMatch(DONATION_REFERENCE_PATTERN);
    expect(intent.hideNamePublicly).toBe(true);
    expect(await donations.findByPublicReference(intent.publicReference)).toMatchObject({
      id: intent.id,
      amountPaise: 100,
      locale: 'ta',
    });
  });

  it('records a payment attempt and finds it by provider order ID', async () => {
    const intent = await donations.createIntent({
      giftPaise: rupeesToPaise(250),
      donorName: 'Synthetic Donor',
    });
    const orderId = unique('order_SYN');
    await donations.addPaymentAttempt({
      donationIntentId: intent.id,
      providerOrderId: orderId,
      amountPaise: rupeesToPaise(250),
    });
    expect(await donations.findAttemptByProviderOrderId(orderId)).toMatchObject({
      donationIntentId: intent.id,
      provider: 'RAZORPAY',
      amountPaise: 25_000,
      capturedPaise: 0,
    });
  });

  it('returns null for an unknown reference', async () => {
    expect(await donations.findByPublicReference('TOT-D-000000000000')).toBeNull();
  });
});

describe('programmeRepository', () => {
  const programmes = programmeRepository(db);

  it('lists only active programmes, in order', async () => {
    const a = unique('active-b');
    const b = unique('active-a');
    await programmes.upsertBySlug({
      slug: a,
      titleTa: 'அ',
      titleEn: 'A',
      active: true,
      sortOrder: 2,
    });
    await programmes.upsertBySlug({
      slug: b,
      titleTa: 'ஆ',
      titleEn: 'B',
      active: true,
      sortOrder: 1,
    });
    await programmes.upsertBySlug({ slug: unique('hidden'), titleTa: 'இ', titleEn: 'C' });
    const slugs = (await programmes.listActive()).map((p) => p.slug);
    expect(slugs.indexOf(b)).toBeLessThan(slugs.indexOf(a));
    expect(slugs.every((slug) => !slug.startsWith('hidden'))).toBe(true);
  });

  it('upserts by slug without duplicating', async () => {
    const slug = unique('upsert');
    await programmes.upsertBySlug({ slug, titleTa: 'அ', titleEn: 'Old' });
    await programmes.upsertBySlug({ slug, titleTa: 'அ', titleEn: 'New' });
    expect(await programmes.findBySlug(slug)).toMatchObject({ titleEn: 'New', active: false });
  });
});

describe('trustSettingsRepository', () => {
  it('returns the singleton with safe defaults', async () => {
    const settings = await trustSettingsRepository(db).get();
    expect(settings).toMatchObject({ id: 1, taxBenefitEnabled: false, foreignDonations: false });
  });
});

describe('seedSyntheticData', () => {
  it('seeds inactive, clearly synthetic programmes and is safe to run twice', async () => {
    await seedSyntheticData(db, 'development');
    await seedSyntheticData(db, 'development');
    const seeded = await db.programme.findMany({
      where: { slug: { in: SYNTHETIC_PROGRAMMES.map((p) => p.slug) } },
    });
    expect(seeded).toHaveLength(SYNTHETIC_PROGRAMMES.length);
    for (const programme of seeded) {
      expect(programme.active).toBe(false);
      expect(programme.titleEn.startsWith('[SYNTHETIC]')).toBe(true);
      expect(programme.titleTa.startsWith('[SYNTHETIC]')).toBe(true);
    }
    expect(await db.donationIntent.count({ where: { donorName: { contains: 'SYNTHETIC' } } })).toBe(
      0,
    );
  });

  it('refuses to run in production', async () => {
    await expect(seedSyntheticData(db, 'production')).rejects.toBeInstanceOf(SeedRefusedError);
  });
});
