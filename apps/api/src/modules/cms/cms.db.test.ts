import { randomBytes } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../../app.ts';
import { setOwnerPassword } from '../../cli/owner-account.ts';
import { loadEnv } from '../../config/env.ts';
import { ownerEmailFor } from '../../db/repositories/trust-settings.ts';
import { unique, useTestDb } from '../../test/db.ts';
import { base32Decode, hotp, timeStep } from '../auth/totp.ts';
import { localDocumentStore } from './storage.ts';

/** Owner content management (#36): programmes, content, metrics, documents and settings. */
const db = useTestDb();
const ORIGIN = 'http://localhost:5173';
const AUTH_SECRET_KEY = randomBytes(32).toString('base64');
const PDF = Buffer.from('%PDF-1.7\n%synthetic test file\n');
const EXE = Buffer.from('MZ\x90\x00\x03\x00\x00\x00 not a report');
let app: FastifyInstance;
let dir = '';
let send: (
  m: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  url: string,
  body?: unknown,
) => Promise<LightMyRequestResponse>;
const R = { reason: 'Owner reviewed this change' };

const audits = (action: string) => db.auditLog.findMany({ where: { action } });

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'tot-cms-'));
  app = buildApp(
    loadEnv({
      NODE_ENV: 'test',
      AUTH_SECRET_KEY,
      CORS_ORIGINS: ORIGIN,
      DOCUMENT_MAX_BYTES: '2048',
      PUBLIC_DOCUMENTS_BASE_URL: 'https://api.example.org/api/v1/documents',
      OWNER_NOTIFICATION_EMAIL: 'server-owner@example.org',
      RAZORPAY_KEY_ID: 'rzp_test_cms0000001',
      RAZORPAY_KEY_SECRET: 'cms-secret-never-shown',
    }),
    { db, documentStore: localDocumentStore(dir) },
  );
  const email = `${unique('cms-owner')}@example.org`;
  await setOwnerPassword(db, email, 'river mango lamp seventeen');
  let cookie = '';
  let csrf = '';
  send = async (method, url, body) => {
    const res = await app.inject({
      method,
      url,
      headers: {
        origin: ORIGIN,
        ...(csrf && { 'x-csrf-token': csrf }),
        ...(body !== undefined && { 'content-type': 'application/json' }),
      },
      ...(cookie && { cookies: { tot_admin: cookie } }),
      ...(body !== undefined && { payload: JSON.stringify(body) }),
    });
    const set = res.cookies.find((c) => c.name === 'tot_admin');
    if (set) cookie = set.value;
    if (res.headers['content-type']?.includes('json')) {
      const token = (res.json() as { csrfToken?: string }).csrfToken;
      if (token) csrf = token;
    }
    return res;
  };
  await send('POST', '/api/v1/auth/login', { email, password: 'river mango lamp seventeen' });
  const { secret } = (await send('POST', '/api/v1/auth/mfa/setup')).json() as { secret: string };
  await send('POST', '/api/v1/auth/mfa/enable', {
    code: hotp(base32Decode(secret), timeStep(new Date())),
  });
});

afterAll(async () => {
  await db.contentSection.deleteMany({ where: { sectionKey: { startsWith: 'faq.cms36' } } });
  await db.contentSection.deleteMany({ where: { sectionKey: { startsWith: 'story.cms36' } } });
  await db.contentSection.deleteMany({ where: { sectionKey: 'final_cta.title' } });
  await db.impactMetric.deleteMany({ where: { labelEn: { startsWith: 'CMS36' } } });
  await db.transparencyDocument.deleteMany({ where: { title: { startsWith: 'CMS36' } } });
  await db.programme.deleteMany({ where: { slug: { startsWith: 'cms36-' } } });
  await db.trustSettings.update({
    where: { id: 1 },
    data: { ownerEmail: null, legalName: null, registrationText: null, receiptMinPaise: 50_000 },
  });
  await app.close();
  await rm(dir, { recursive: true, force: true });
});

describe('programmes (#36)', () => {
  it('creates, edits, pauses and deletes — audited; slug unique; gifts block deletion', async () => {
    const created = await send('POST', '/api/v1/admin/programmes', {
      slug: 'cms36-education',
      titleTa: 'கல்வி உதவி',
      titleEn: 'Education support',
      designation: 'RESTRICTED',
      active: true,
      ...R,
    });
    expect(created.statusCode).toBe(201);
    const p = created.json() as { id: string; designation: string; donations: number };
    expect(p).toMatchObject({ designation: 'RESTRICTED', donations: 0 });
    expect(
      (
        await send('POST', '/api/v1/admin/programmes', {
          slug: 'cms36-education',
          titleTa: 'இரண்டு',
          titleEn: 'Twice',
          ...R,
        })
      ).statusCode,
    ).toBe(409);
    // A reason is required, and unknown fields are refused.
    expect(
      (await send('PATCH', `/api/v1/admin/programmes/${p.id}`, { active: false })).statusCode,
    ).toBe(400);
    expect(
      (await send('PATCH', `/api/v1/admin/programmes/${p.id}`, { colour: 'red', ...R })).statusCode,
    ).toBe(400);

    const paused = await send('PATCH', `/api/v1/admin/programmes/${p.id}`, {
      active: false,
      descriptionEn: 'Books and fees for school children.',
      ...R,
    });
    expect(paused.json()).toMatchObject({ active: false });
    expect((await audits('programme.pause'))[0]).toMatchObject({
      entityId: p.id,
      changedFields: ['active', 'descriptionEn'],
      reason: R.reason,
    });
    // Paused = not on the public site.
    const pub = (await app.inject('/api/v1/public/programmes?locale=en')).json() as {
      programmes: Array<{ slug: string }>;
    };
    expect(pub.programmes.map((x) => x.slug)).not.toContain('cms36-education');
    expect(
      (await send('PATCH', `/api/v1/admin/programmes/${p.id}`, { active: true, ...R })).json(),
    ).toMatchObject({ active: true });
    expect(await audits('programme.activate')).toHaveLength(1);
    expect(
      (await send('PATCH', `/api/v1/admin/programmes/${p.id}`, { sortOrder: 3, ...R })).json(),
    ).toMatchObject({ sortOrder: 3 });

    const other = (
      await send('POST', '/api/v1/admin/programmes', {
        slug: 'cms36-food',
        titleTa: 'உணவு',
        titleEn: 'Food',
        ...R,
      })
    ).json() as { id: string; active: boolean; designation: string };
    expect(other).toMatchObject({ active: false, designation: 'GENERAL' });
    expect(
      (await send('PATCH', `/api/v1/admin/programmes/${p.id}`, { slug: 'cms36-food', ...R }))
        .statusCode,
    ).toBe(409);

    await db.donationIntent.create({
      data: {
        publicReference: unique('TOT-CMS'),
        programmeId: p.id,
        giftPaise: 100_000,
        amountPaise: 100_000,
        donorName: 'Synthetic Donor',
        consentAt: new Date(),
      },
    });
    const blocked = await send('DELETE', `/api/v1/admin/programmes/${p.id}`, R);
    expect(blocked.statusCode).toBe(409);
    expect((await send('GET', '/api/v1/admin/programmes')).json()).toMatchObject({
      items: expect.arrayContaining([expect.objectContaining({ id: p.id, donations: 1 })]),
    });
    expect((await send('DELETE', `/api/v1/admin/programmes/${other.id}`, R)).json()).toEqual({
      deleted: true,
    });
    expect((await send('DELETE', `/api/v1/admin/programmes/${other.id}`, R)).statusCode).toBe(404);
    expect(
      (await send('PATCH', `/api/v1/admin/programmes/${other.id}`, { sortOrder: 1, ...R }))
        .statusCode,
    ).toBe(404);
    expect(await audits('programme.delete')).toHaveLength(1);
    await db.donationIntent.deleteMany({ where: { programmeId: p.id } });
  });
});

describe('content (#36)', () => {
  it('drafts are never public; publish needs both languages; preview; unpublish', async () => {
    const faq = 'faq.cms36-tax';
    const bad = await send('PUT', `/api/v1/admin/content/${faq}`, {
      en: { question: 'Is my gift tax-deductible?', answer: 'Not yet.', order: 1 },
      ta: { question: 'வரி விலக்கு உண்டா?' },
      ...R,
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
    expect(
      (await send('PUT', '/api/v1/admin/content/news.today', { en: {}, ta: {}, ...R })).statusCode,
    ).toBe(400);

    const saved = await send('PUT', `/api/v1/admin/content/${faq}`, {
      en: { question: 'Is my gift tax-deductible?', answer: 'Not yet.', order: 1 },
      ta: { question: 'வரி விலக்கு உண்டா?', answer: 'இன்னும் இல்லை.', order: 1 },
      ...R,
    });
    expect(saved.json()).toMatchObject({
      key: faq,
      kind: 'faq',
      draft: { en: { version: 1, status: 'DRAFT' } },
      published: { en: null, ta: null },
    });
    const publicFaqs = async (locale: string) =>
      (
        (await app.inject(`/api/v1/public/site-content?locale=${locale}`)).json() as {
          faqs: Array<{ id: string; answer: string }>;
        }
      ).faqs.filter((f) => f.id.startsWith('cms36'));
    expect(await publicFaqs('en')).toEqual([]);
    expect(
      (
        (await send('GET', '/api/v1/admin/content/preview?locale=ta')).json() as {
          faqs: Array<{ id: string }>;
        }
      ).faqs.map((f) => f.id),
    ).toContain('cms36-tax');

    // Saving again updates the same draft (no new version).
    await send('PUT', `/api/v1/admin/content/${faq}`, {
      en: { question: 'Is my gift tax-deductible?', answer: 'Not yet — see below.', order: 1 },
      ta: { question: 'வரி விலக்கு உண்டா?', answer: 'இன்னும் இல்லை.', order: 1 },
      ...R,
    });
    expect(await db.contentSection.count({ where: { sectionKey: faq } })).toBe(2);

    expect((await send('POST', `/api/v1/admin/content/${faq}/publish`, R)).json()).toMatchObject({
      published: { en: { version: 1 }, ta: { version: 1 } },
      draft: { en: null, ta: null },
    });
    expect((await publicFaqs('en'))[0]).toMatchObject({ answer: 'Not yet — see below.' });
    expect(await publicFaqs('ta')).toHaveLength(1);

    // A new draft does not change the public text until it is published.
    await send('PUT', `/api/v1/admin/content/${faq}`, {
      en: { question: 'Is my gift tax-deductible?', answer: 'Version two.', order: 1 },
      ta: { question: 'வரி விலக்கு உண்டா?', answer: 'பதிப்பு இரண்டு.', order: 1 },
      ...R,
    });
    expect((await publicFaqs('en'))[0]).toMatchObject({ answer: 'Not yet — see below.' });
    await send('POST', `/api/v1/admin/content/${faq}/publish`, R);
    expect((await publicFaqs('en'))[0]).toMatchObject({ answer: 'Version two.' });
    expect(await db.contentSection.count({ where: { sectionKey: faq, status: 'ARCHIVED' } })).toBe(
      2,
    );

    // Nothing to publish now.
    expect((await send('POST', `/api/v1/admin/content/${faq}/publish`, R)).statusCode).toBe(400);
    expect((await send('POST', `/api/v1/admin/content/x.y/publish`, R)).statusCode).toBe(404);
    expect((await send('POST', `/api/v1/admin/content/${faq}/unpublish`, R)).statusCode).toBe(200);
    expect(await publicFaqs('en')).toEqual([]);
    expect((await send('POST', `/api/v1/admin/content/${faq}/unpublish`, R)).statusCode).toBe(409);
    expect((await send('POST', `/api/v1/admin/content/x.y/unpublish`, R)).statusCode).toBe(404);
    expect(await audits('content.publish')).toHaveLength(2);
    expect(await audits('content.unpublish')).toHaveLength(1);
  });

  it('only one language drafted cannot be published; stories need the consent date', async () => {
    await db.contentSection.create({
      data: { sectionKey: 'final_cta.title', locale: 'en', content: { text: 'Give today' } },
    });
    expect(
      (await send('POST', '/api/v1/admin/content/final_cta.title/publish', R)).json(),
    ).toMatchObject({ error: { fields: [{ issue: 'both_languages_required' }] } });
    // A draft whose content no longer passes the rules is refused at publish.
    await db.contentSection.create({
      data: { sectionKey: 'final_cta.title', locale: 'ta', content: { wrong: 1 } },
    });
    expect(
      (await send('POST', '/api/v1/admin/content/final_cta.title/publish', R)).statusCode,
    ).toBe(400);
    const list = (await send('GET', '/api/v1/admin/content')).json() as {
      items: Array<{ key: string; kind: string }>;
    };
    expect(list.items.find((i) => i.key === 'hero.headline')).toMatchObject({ kind: 'text' });
    expect(list.items.find((i) => i.key === 'final_cta.title')).toBeTruthy();

    const story = 'story.cms36-library';
    const noConsent = await send('PUT', `/api/v1/admin/content/${story}`, {
      en: { title: 'A library', body: 'Synthetic story.' },
      ta: { title: 'நூலகம்', body: 'மாதிரி கதை.' },
      ...R,
    });
    expect(noConsent.statusCode).toBe(400);
    const mismatch = await send('PUT', `/api/v1/admin/content/${story}`, {
      en: { title: 'A library', body: 'Synthetic story.', consentRecordedOn: '2026-10-01' },
      ta: { title: 'நூலகம்', body: 'மாதிரி கதை.', consentRecordedOn: '2026-10-02' },
      ...R,
    });
    expect(mismatch.json()).toMatchObject({ error: { fields: [{ issue: 'mismatch' }] } });
    const ok = await send('PUT', `/api/v1/admin/content/${story}`, {
      en: { title: 'A library', body: 'Synthetic story.', consentRecordedOn: '2026-10-01' },
      ta: { title: 'நூலகம்', body: 'மாதிரி கதை.', consentRecordedOn: '2026-10-01' },
      ...R,
    });
    expect(ok.json()).toMatchObject({ kind: 'story' });
    expect(
      (
        (await send('GET', '/api/v1/admin/content/preview')).json() as {
          stories: Array<{ id: string }>;
        }
      ).stories,
    ).toEqual([{ id: 'cms36-library', title: 'A library', body: 'Synthetic story.' }]);
  });
});

describe('impact metrics (#36)', () => {
  it('publish needs source, period and date; editing a published figure unpublishes it', async () => {
    expect(
      (await send('POST', '/api/v1/admin/metrics', { labelEn: 'CMS36 only en', ...R })).statusCode,
    ).toBe(400);
    const created = await send('POST', '/api/v1/admin/metrics', {
      labelTa: 'மாணவர்கள்',
      labelEn: 'CMS36 students supported',
      value: '120',
      ...R,
    });
    expect(created.statusCode).toBe(201);
    const m = created.json() as { id: string; status: string };
    expect(m.status).toBe('DRAFT');
    expect((await send('POST', `/api/v1/admin/metrics/${m.id}/publish`, R)).json()).toMatchObject({
      error: { fields: [{ issue: 'source_period_date' }] },
    });
    await send('PATCH', `/api/v1/admin/metrics/${m.id}`, {
      sourceTa: 'அறக்கட்டளை பதிவேடு',
      sourceEn: 'Trust register',
      periodTa: '2025-26',
      periodEn: '2025-26',
      asOf: '2026-03-31',
      evidenceUrl: 'https://example.org/register.pdf',
      ...R,
    });
    const published = await send('POST', `/api/v1/admin/metrics/${m.id}/publish`, R);
    expect(published.json()).toMatchObject({ status: 'PUBLISHED', approvedAt: expect.any(String) });
    const pub = async () =>
      (
        (await app.inject('/api/v1/public/site-content?locale=en')).json() as {
          impactMetrics: Array<{ id: string; value: string }>;
        }
      ).impactMetrics.filter((x) => x.id === m.id);
    expect(await pub()).toEqual([expect.objectContaining({ value: '120' })]);

    // No change → stays published; a changed value goes back to draft.
    expect(
      (await send('PATCH', `/api/v1/admin/metrics/${m.id}`, { value: '120', ...R })).json(),
    ).toMatchObject({ status: 'PUBLISHED' });
    const edited = await send('PATCH', `/api/v1/admin/metrics/${m.id}`, { value: '150', ...R });
    expect(edited.json()).toMatchObject({ status: 'DRAFT', value: '150', approvedAt: null });
    expect(await pub()).toEqual([]);
    expect(await audits('metric.update_unpublished')).toHaveLength(1);

    await send('POST', `/api/v1/admin/metrics/${m.id}/publish`, R);
    expect((await send('DELETE', `/api/v1/admin/metrics/${m.id}`, R)).statusCode).toBe(409);
    expect((await send('POST', `/api/v1/admin/metrics/${m.id}/unpublish`, R)).json()).toMatchObject(
      {
        status: 'ARCHIVED',
      },
    );
    expect((await send('POST', `/api/v1/admin/metrics/${m.id}/unpublish`, R)).statusCode).toBe(409);
    expect(
      (await send('PATCH', `/api/v1/admin/metrics/${m.id}`, { asOf: null, ...R })).json(),
    ).toMatchObject({ asOf: null });
    expect((await send('GET', '/api/v1/admin/metrics')).json()).toMatchObject({
      items: expect.arrayContaining([expect.objectContaining({ id: m.id })]),
    });
    expect((await send('DELETE', `/api/v1/admin/metrics/${m.id}`, R)).json()).toEqual({
      deleted: true,
    });
    const missing = '00000000-0000-4000-8000-000000000000';
    for (const [method, url] of [
      ['PATCH', `/api/v1/admin/metrics/${missing}`],
      ['POST', `/api/v1/admin/metrics/${missing}/publish`],
      ['POST', `/api/v1/admin/metrics/${missing}/unpublish`],
      ['DELETE', `/api/v1/admin/metrics/${missing}`],
    ] as const) {
      expect((await send(method, url, R)).statusCode).toBe(404);
    }
    expect(
      (
        await send('PATCH', `/api/v1/admin/metrics/${missing}`, {
          evidenceUrl: 'http://x.org',
          ...R,
        })
      ).statusCode,
    ).toBe(400);
  });
});

describe('transparency documents (#36)', () => {
  const upload = (over: Record<string, unknown> = {}) =>
    send('POST', '/api/v1/admin/documents', {
      title: 'CMS36 Annual report 2025-26',
      locale: 'en',
      periodLabel: '2025-26',
      fileName: 'annual-report.pdf',
      fileType: 'application/pdf',
      dataBase64: PDF.toString('base64'),
      ...R,
      ...over,
    });

  it('checks uploads on the server; private until published; removal is audited', async () => {
    expect((await upload({ dataBase64: EXE.toString('base64') })).json()).toMatchObject({
      error: { code: 'UNSUPPORTED_MEDIA_TYPE', fields: [{ issue: 'type_not_allowed' }] },
    });
    expect(
      (await upload({ fileName: 'annual-report.exe' })).json() as { error: { code: string } },
    ).toMatchObject({ error: { code: 'UNSUPPORTED_MEDIA_TYPE' } });
    expect(
      (await upload({ dataBase64: Buffer.alloc(3000, 0x25).toString('base64') })).statusCode,
    ).toBe(413);
    expect((await upload({ fileType: 'application/x-msdownload' })).statusCode).toBe(400);
    expect(await readdir(dir)).toEqual([]);

    const res = await upload();
    expect(res.statusCode).toBe(201);
    const doc = res.json() as { id: string; status: string; publicUrl: string | null };
    expect(doc).toMatchObject({ status: 'DRAFT', publicUrl: null });
    const row = await db.transparencyDocument.findUniqueOrThrow({ where: { id: doc.id } });
    expect(row.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(row.storageKey).toMatch(/^[0-9a-f-]{36}\.pdf$/);
    const file = `/api/v1/documents/${row.storageKey}`;
    expect((await app.inject(file)).statusCode).toBe(404);
    expect(
      (await app.inject('/api/v1/public/transparency-documents?locale=en')).json(),
    ).toMatchObject({
      documents: [],
    });

    const pub = await send('POST', `/api/v1/admin/documents/${doc.id}/publish`, R);
    expect(pub.json()).toMatchObject({
      status: 'PUBLISHED',
      publicUrl: `https://api.example.org/api/v1/documents/${row.storageKey}`,
    });
    expect((await send('POST', `/api/v1/admin/documents/${doc.id}/publish`, R)).statusCode).toBe(
      409,
    );
    const served = await app.inject(file);
    expect(served.statusCode).toBe(200);
    expect(served.headers).toMatchObject({
      'content-type': 'application/pdf',
      'x-content-type-options': 'nosniff',
    });
    expect(served.rawPayload).toEqual(PDF);
    expect(
      (
        (await app.inject('/api/v1/public/transparency-documents?locale=en')).json() as {
          documents: Array<{ id: string }>;
        }
      ).documents.map((d) => d.id),
    ).toContain(doc.id);
    expect((await app.inject('/api/v1/documents/..%2Fetc%2Fpasswd')).statusCode).toBe(400);

    expect((await send('DELETE', `/api/v1/admin/documents/${doc.id}`, R)).statusCode).toBe(409);
    expect(
      (await send('POST', `/api/v1/admin/documents/${doc.id}/unpublish`, R)).json(),
    ).toMatchObject({ status: 'ARCHIVED', publicUrl: null });
    expect((await app.inject(file)).statusCode).toBe(404);
    expect((await send('POST', `/api/v1/admin/documents/${doc.id}/unpublish`, R)).statusCode).toBe(
      409,
    );
    const list = (await send('GET', '/api/v1/admin/documents')).json() as {
      items: Array<{ id: string }>;
      maxBytes: number;
      uploadsEnabled: boolean;
    };
    expect(list).toMatchObject({ maxBytes: 2048, uploadsEnabled: true });
    expect(list.items.map((i) => i.id)).toContain(doc.id);

    expect((await send('DELETE', `/api/v1/admin/documents/${doc.id}`, R)).json()).toEqual({
      deleted: true,
    });
    expect(await readdir(dir)).toEqual([]);
    const [removal] = await audits('document.remove');
    expect(removal?.reason).toContain('CMS36 Annual report 2025-26');
    expect(removal?.reason).toContain(row.sha256 ?? 'x');
    expect((await send('DELETE', `/api/v1/admin/documents/${doc.id}`, R)).statusCode).toBe(404);
    expect((await send('POST', `/api/v1/admin/documents/${doc.id}/publish`, R)).statusCode).toBe(
      404,
    );
  });

  it('a published row whose file is gone answers 404; failed save removes the file', async () => {
    const res = await upload({ title: 'CMS36 Missing file' });
    const { id } = res.json() as { id: string };
    await send('POST', `/api/v1/admin/documents/${id}/publish`, R);
    const row = await db.transparencyDocument.findUniqueOrThrow({ where: { id } });
    await rm(path.join(dir, row.storageKey));
    expect((await app.inject(`/api/v1/documents/${row.storageKey}`)).statusCode).toBe(404);
    // A title the database refuses (too long for nothing) — simulate by a duplicate storage key.
    const before = await readdir(dir);
    await db.$executeRawUnsafe(
      `ALTER TABLE transparency_documents ADD CONSTRAINT cms36_block CHECK (title <> 'CMS36 Blocked')`,
    );
    try {
      expect((await upload({ title: 'CMS36 Blocked' })).statusCode).toBe(500);
    } finally {
      await db.$executeRawUnsafe('ALTER TABLE transparency_documents DROP CONSTRAINT cms36_block');
    }
    expect(await readdir(dir)).toEqual(before);
  });
});

describe('settings (#36)', () => {
  it('shows payment status without secrets; saves profile, threshold, owner email and fees', async () => {
    const res = await send('GET', '/api/v1/admin/settings');
    expect(res.body).not.toContain('cms-secret-never-shown');
    expect(res.json()).toMatchObject({
      ownerEmail: 'server-owner@example.org',
      ownerEmailSource: 'server',
      payment: {
        mode: 'test',
        keyId: 'rzp_test_cms0000001',
        keySecretSet: true,
        webhookSecretSet: false,
      },
    });
    expect(
      (await send('PATCH', '/api/v1/admin/settings', { keySecret: 'x', ...R })).statusCode,
    ).toBe(400);
    expect(
      (await send('PATCH', '/api/v1/admin/settings', { feeTable: { nope: 1 }, ...R })).json(),
    ).toMatchObject({ error: { fields: [{ issue: 'invalid_fee_table' }] } });
    expect(
      (await send('PATCH', '/api/v1/admin/settings', { receiptMinPaise: 99_000_000, ...R })).json(),
    ).toMatchObject({ error: { fields: [{ issue: 'above_max' }] } });

    const saved = await send('PATCH', '/api/v1/admin/settings', {
      legalName: 'Synthetic Trust',
      registrationText: 'Registration [CONFIRM]',
      receiptMinPaise: 10_000,
      ownerEmail: 'owner@example.org',
      feeTable: null,
      ...R,
    });
    expect(saved.json()).toMatchObject({
      legalName: 'Synthetic Trust',
      receiptMinPaise: 10_000,
      ownerEmail: 'owner@example.org',
      ownerEmailSource: 'settings',
      feeTable: null,
    });
    const [entry] = await audits('settings.update');
    expect(entry?.changedFields).toEqual(
      expect.arrayContaining(['legalName', 'ownerEmail', 'receiptMinPaise', 'registrationText']),
    );
    expect(JSON.stringify(entry)).not.toContain('owner@example.org');
    expect(await ownerEmailFor(db, 'server-owner@example.org')).toBe('owner@example.org');

    const valid = {
      version: 'test-2026',
      defaultMethod: 'upi',
      methods: { upi: { rateBps: 0 } },
    };
    expect(
      (await send('PATCH', '/api/v1/admin/settings', { feeTable: valid, ...R })).json(),
    ).toMatchObject({ feeTable: valid });
    await send('PATCH', '/api/v1/admin/settings', { ownerEmail: null, feeTable: null, ...R });
    expect(await ownerEmailFor(db, undefined)).toBeUndefined();
  });
});
