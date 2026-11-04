import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.ts';
import { loadEnv } from '../../config/env.ts';
import { unique, useTestDb } from '../../test/db.ts';

const db = useTestDb();
let app: FastifyInstance;
const tag = unique('pc');
const slug = (s: string) => `${tag}-${s}`;

beforeAll(async () => {
  app = buildApp(
    loadEnv({ NODE_ENV: 'test', PUBLIC_DOCUMENTS_BASE_URL: 'https://files.example/public' }),
    { db },
  );
  // Programmes: one active, one inactive (draft).
  await db.programme.createMany({
    data: [
      { slug: slug('live'), titleTa: 'நேரலை', titleEn: 'Live', active: true, sortOrder: -100 },
      { slug: slug('hidden'), titleTa: 'மறை', titleEn: 'Hidden', active: false },
    ],
  });
  // Site content: published v1 + newer published v2 (wins), a draft v3, and an archived FAQ.
  await db.contentSection.createMany({
    data: [
      {
        sectionKey: 'hero.headline',
        locale: 'en',
        version: 1,
        status: 'PUBLISHED',
        content: { text: 'Old headline' },
      },
      {
        sectionKey: 'hero.headline',
        locale: 'en',
        version: 2,
        status: 'PUBLISHED',
        content: { text: 'Published headline' },
      },
      {
        sectionKey: 'hero.headline',
        locale: 'en',
        version: 3,
        status: 'DRAFT',
        content: { text: 'DRAFT headline' },
      },
      {
        sectionKey: 'hero.headline',
        locale: 'ta',
        version: 1,
        status: 'PUBLISHED',
        content: { text: 'தமிழ் தலைப்பு' },
      },
      {
        sectionKey: 'faq.receipts',
        locale: 'en',
        version: 1,
        status: 'PUBLISHED',
        content: { question: 'Receipt?', answer: 'After verified payment.' },
      },
      {
        sectionKey: 'faq.old',
        locale: 'en',
        version: 1,
        status: 'ARCHIVED',
        content: { question: 'Old?', answer: 'Archived.' },
      },
      {
        sectionKey: 'hero.unknown_slot',
        locale: 'en',
        version: 1,
        status: 'PUBLISHED',
        content: { text: 'Unknown slot' },
      },
    ],
  });
  const sourced = {
    sourceTa: 'கணக்குகள்',
    sourceEn: 'Trust accounts',
    periodTa: '2025-26',
    periodEn: 'FY 2025-26',
    asOf: new Date('2026-03-31'),
    approvedAt: new Date('2026-04-15'),
  };
  await db.impactMetric.createMany({
    data: [
      {
        labelTa: 'வெளியிடப்பட்டது',
        labelEn: `${tag} published`,
        value: 42n,
        status: 'PUBLISHED',
        ...sourced,
      },
      { labelTa: 'வரைவு', labelEn: `${tag} draft`, value: 999n, status: 'DRAFT', ...sourced },
      { labelTa: 'ஆதாரமில்லை', labelEn: `${tag} unsourced draft`, value: 7n },
    ],
  });
  await db.transparencyDocument.createMany({
    data: [
      {
        title: `${tag} Annual report`,
        locale: 'en',
        storageKey: `${tag}/annual.pdf`,
        fileType: 'PDF',
        fileSize: 1000,
        status: 'PUBLISHED',
        approvedAt: new Date('2026-06-01'),
      },
      {
        title: `${tag} ஆண்டறிக்கை`,
        locale: 'ta',
        storageKey: `${tag}/annual-ta.pdf`,
        fileType: 'PDF',
        fileSize: 1000,
        status: 'PUBLISHED',
        approvedAt: new Date('2026-05-01'),
      },
      {
        title: `${tag} Draft statement`,
        locale: 'en',
        storageKey: `${tag}/draft.pdf`,
        fileType: 'PDF',
        fileSize: 1000,
        status: 'DRAFT',
      },
    ],
  });
});

afterAll(async () => {
  await app.close();
});

const get = (url: string, headers: Record<string, string> = {}) =>
  app.inject({ method: 'GET', url: `/api/v1/public${url}`, headers });

describe('unpublished or unsourced items are never returned', () => {
  it('site content: newest published version only; drafts, archived and unknown slots never', async () => {
    const res = await get('/site-content?locale=en');
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.texts['hero.headline']).toBe('Published headline');
    expect(body.faqs).toContainEqual({
      id: 'receipts',
      question: 'Receipt?',
      answer: 'After verified payment.',
    });
    expect(res.body).not.toMatch(/DRAFT headline|Old headline|Archived|Unknown slot/);
  });

  it('site content is per language', async () => {
    const body = (await get('/site-content?locale=ta')).json();
    expect(body.locale).toBe('ta');
    expect(body.texts['hero.headline']).toBe('தமிழ் தலைப்பு');
  });

  it('impact metrics: only published + sourced + dated + approved', async () => {
    const body = (await get('/site-content?locale=en')).json();
    const mine = body.impactMetrics.filter((m: { label: string }) => m.label.startsWith(tag));
    expect(mine).toEqual([
      {
        id: expect.any(String),
        label: `${tag} published`,
        value: '42',
        valueFormat: 'count',
        source: 'Trust accounts',
        period: 'FY 2025-26',
        asOf: '2026-03-31',
      },
    ]);
  });

  it('the database refuses to publish a metric without source, period or date', async () => {
    await expect(
      db.impactMetric.create({
        data: {
          labelTa: 'x',
          labelEn: 'x',
          value: 1n,
          status: 'PUBLISHED',
          approvedAt: new Date(),
          sourceEn: 'S',
          sourceTa: 'S',
        },
      }),
    ).rejects.toThrow(/impact_metrics_published_evidence/);
  });

  it('programmes: active only, in order, in the visitor language', async () => {
    const body = (await get('/programmes?locale=ta')).json();
    const mine = body.programmes.filter((p: { slug: string }) => p.slug.startsWith(tag));
    expect(mine).toEqual([
      { slug: slug('live'), title: 'நேரலை', description: null, designation: 'GENERAL' },
    ]);
  });

  it('transparency documents: published + approved only, visitor language first, with URLs', async () => {
    const body = (await get('/transparency-documents?locale=ta')).json();
    const mine = body.documents.filter((d: { title: string }) => d.title.startsWith(tag));
    expect(mine.map((d: { language: string }) => d.language)).toEqual(['ta', 'en']);
    expect(mine[1].url).toBe(`https://files.example/public/${tag}/annual.pdf`);
    expect(JSON.stringify(mine)).not.toContain('Draft statement');
    expect(JSON.stringify(mine)).not.toContain('storageKey');
  });

  it('the database refuses to publish a document without approval', async () => {
    await expect(
      db.transparencyDocument.create({
        data: {
          title: 'x',
          locale: 'en',
          storageKey: unique('k'),
          fileType: 'PDF',
          fileSize: 1,
          status: 'PUBLISHED',
        },
      }),
    ).rejects.toThrow(/transparency_documents_published_approved/);
  });
});

describe('cache headers', () => {
  it('are public and short-lived, with an ETag that answers 304 when unchanged', async () => {
    const first = await get('/programmes?locale=en');
    expect(first.headers['cache-control']).toBe('public, max-age=300, stale-while-revalidate=600');
    expect(first.headers.etag).toMatch(/^W\/"[A-Za-z0-9_-]+"$/);
    expect(first.headers.vary).toContain('Origin');
    const again = await get('/programmes?locale=en', {
      'if-none-match': String(first.headers.etag),
    });
    expect(again.statusCode).toBe(304);
    expect(again.body).toBe('');
  });

  it('change when the language changes', async () => {
    const en = await get('/programmes?locale=en');
    const ta = await get('/programmes?locale=ta');
    expect(en.headers.etag).not.toBe(ta.headers.etag);
  });

  it('keep the security headers', async () => {
    const res = await get('/site-content');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.json().locale).toBe('en');
  });
});

describe('without a documents base URL', () => {
  it('lists no documents rather than broken links', async () => {
    const bare = buildApp(loadEnv({ NODE_ENV: 'test' }), { db });
    const body = (
      await bare.inject({ method: 'GET', url: '/api/v1/public/transparency-documents' })
    ).json();
    expect(body.documents).toEqual([]);
    await bare.close();
  });
});
