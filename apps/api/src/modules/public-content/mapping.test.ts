import { describe, expect, it } from 'vitest';
import { byLanguage, toDocument, toMetric, toProgramme, toSiteContent } from './mapping.ts';

const section = (sectionKey: string, content: unknown) =>
  ({ sectionKey, content, locale: 'en', status: 'PUBLISHED', version: 1 }) as never;

describe('toSiteContent', () => {
  it('keeps known text slots and well-formed FAQs, in order', () => {
    expect(
      toSiteContent([
        section('hero.headline', { text: '  Together  ' }),
        section('faq.b', { question: 'Q2', answer: 'A2', order: 2 }),
        section('faq.a', { question: 'Q1', answer: 'A1', order: 1 }),
        section('faq.c', { question: 'Q3', answer: 'A3' }),
      ]),
    ).toEqual({
      texts: { 'hero.headline': 'Together' },
      faqs: [
        { id: 'c', question: 'Q3', answer: 'A3' },
        { id: 'a', question: 'Q1', answer: 'A1' },
        { id: 'b', question: 'Q2', answer: 'A2' },
      ],
    });
  });

  it.each([
    ['unknown key', section('hero.secret', { text: 'x' })],
    ['empty text', section('hero.lead', { text: '   ' })],
    ['non-string text', section('hero.lead', { text: 42 })],
    ['too long', section('hero.lead', { text: 'x'.repeat(2001) })],
    ['array content', section('hero.lead', ['x'])],
    ['null content', section('hero.lead', null)],
    ['faq without answer', section('faq.x', { question: 'Q' })],
    ['bad faq id', section('faq.X Y', { question: 'Q', answer: 'A' })],
  ])('drops %s', (_why, row) => {
    expect(toSiteContent([row])).toEqual({ texts: {}, faqs: [] });
  });
});

describe('toProgramme', () => {
  const row = {
    slug: 'education',
    titleTa: 'கல்வி',
    titleEn: 'Education',
    descriptionTa: null,
    descriptionEn: 'Books',
    designation: 'GENERAL',
  } as never;
  it('picks the language', () => {
    expect(toProgramme(row, 'ta')).toEqual({
      slug: 'education',
      title: 'கல்வி',
      description: null,
      designation: 'GENERAL',
    });
    expect(toProgramme(row, 'en').description).toBe('Books');
  });
});

describe('toMetric', () => {
  const ok = {
    id: 'm1',
    labelTa: 'மாணவர்கள்',
    labelEn: 'Students supported',
    value: 120n,
    valueFormat: 'count',
    sourceTa: 'கணக்குகள்',
    sourceEn: 'Trust accounts',
    periodTa: '2025-26',
    periodEn: 'FY 2025-26',
    asOf: new Date('2026-04-30T00:00:00Z'),
    approvedAt: new Date('2026-05-02T00:00:00Z'),
  };
  it('returns a publishable metric in the visitor language', () => {
    expect(toMetric(ok as never, 'en')).toEqual({
      id: 'm1',
      label: 'Students supported',
      value: '120',
      valueFormat: 'count',
      source: 'Trust accounts',
      period: 'FY 2025-26',
      asOf: '2026-04-30',
    });
  });
  it.each([
    ['no source', { sourceEn: null }],
    ['blank period', { periodEn: '  ' }],
    ['no date', { asOf: null }],
    ['not approved', { approvedAt: null }],
    ['unknown format', { valueFormat: 'stars' }],
    ['no label', { labelEn: '' }],
  ])('is never returned with %s', (_why, patch) => {
    expect(toMetric({ ...ok, ...patch } as never, 'en')).toBeNull();
  });
});

describe('toDocument', () => {
  const row = {
    id: 'd1',
    title: 'Annual report 2025-26',
    locale: 'en',
    periodLabel: 'FY 2025-26',
    storageKey: 'reports/annual report.pdf',
    fileType: 'PDF',
    fileSize: 1234,
    approvedAt: new Date('2026-06-01T10:00:00Z'),
  } as never;
  it('builds an encoded public URL', () => {
    expect(toDocument(row, 'https://files.example/public/')).toMatchObject({
      url: 'https://files.example/public/reports/annual%20report.pdf',
      publishedOn: '2026-06-01',
      language: 'en',
    });
  });
  it('lists nothing without a public base URL or approval', () => {
    expect(toDocument(row, undefined)).toBeNull();
    expect(
      toDocument({ ...(row as object), approvedAt: null } as never, 'https://x.example'),
    ).toBeNull();
  });
  it('sorts the visitor language first', () => {
    const docs = [{ language: 'en' }, { language: 'ta' }] as never[];
    expect([...docs].sort(byLanguage('ta')).map((d: { language: string }) => d.language)).toEqual([
      'ta',
      'en',
    ]);
  });
});
