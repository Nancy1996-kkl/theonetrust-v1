import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { ContentSection } from '../../generated/prisma/client.ts';
import { defined, kindOf, previewOf } from './content.ts';
import { checkUpload, localDocumentStore, sniffType } from './storage.ts';

const PDF = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const EXE = Buffer.from('MZ\x90\x00\x03\x00\x00\x00');
const ELF = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1, 0]);
const SCRIPT = Buffer.from('#!/bin/sh\necho hi\n');
const HTML = Buffer.from('<html><script>alert(1)</script></html>');

describe('upload checks (#36)', () => {
  it('knows PDF, PNG and JPEG from their bytes and nothing else', () => {
    expect(sniffType(PDF)).toBe('application/pdf');
    expect(sniffType(PNG)).toBe('image/png');
    expect(sniffType(JPG)).toBe('image/jpeg');
    for (const bad of [EXE, ELF, SCRIPT, HTML, Buffer.from([0xff, 0xd8])])
      expect(sniffType(bad)).toBeNull();
  });

  it('accepts a matching file and gives it a generated key and hash', () => {
    const ok = checkUpload(PDF, 'application/pdf', 'Annual Report.PDF', 1_000);
    expect(ok).toMatchObject({ ok: true, type: 'application/pdf' });
    if (!ok.ok) throw new Error('expected ok');
    expect(ok.key).toMatch(/^[0-9a-f-]{36}\.pdf$/);
    expect(ok.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(checkUpload(JPG, 'image/jpeg', 'photo.jpeg', 1_000)).toMatchObject({ ok: true });
    expect(checkUpload(PNG, 'image/png', 'chart.png', 1_000)).toMatchObject({ ok: true });
  });

  it('refuses empty, too large, executables and renamed files', () => {
    expect(checkUpload(Buffer.alloc(0), 'application/pdf', 'a.pdf', 1_000)).toEqual({
      ok: false,
      problem: 'empty',
    });
    expect(checkUpload(PDF, 'application/pdf', 'a.pdf', 10)).toEqual({
      ok: false,
      problem: 'too_large',
    });
    for (const exe of [EXE, ELF, SCRIPT, HTML]) {
      expect(checkUpload(exe, 'application/pdf', 'report.pdf', 1_000)).toEqual({
        ok: false,
        problem: 'type_not_allowed',
      });
    }
    // A PDF declared as an image, and a PDF named .exe.
    expect(checkUpload(PDF, 'image/png', 'a.png', 1_000)).toMatchObject({
      problem: 'type_mismatch',
    });
    expect(checkUpload(PDF, 'application/pdf', 'report.pdf.exe', 1_000)).toMatchObject({
      problem: 'type_mismatch',
    });
    expect(checkUpload(PDF, 'application/pdf', 'noextension', 1_000)).toMatchObject({
      problem: 'type_mismatch',
    });
  });
});

describe('local document store (#36)', () => {
  let dir = '';
  afterAll(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it('stores, reads and removes files under generated keys only', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'tot-docs-'));
    const store = localDocumentStore(path.join(dir, 'private'));
    const key = '11111111-2222-3333-4444-555555555555.pdf';
    expect(await store.get(key)).toBeNull();
    await store.put(key, PDF);
    expect(await store.get(key)).toEqual(PDF);
    // Never overwritten.
    await expect(store.put(key, PNG)).rejects.toThrow();
    await store.remove(key);
    await store.remove(key);
    expect(await readdir(path.join(dir, 'private'))).toEqual([]);
    for (const bad of [
      '../etc/passwd',
      'a.pdf',
      `${key}/x`,
      '11111111-2222-3333-4444-555555555555.exe',
    ])
      await expect(store.get(bad)).rejects.toThrow('Invalid document key');
  });

  it('passes on read errors other than a missing file', async () => {
    const store = localDocumentStore(PDF.toString('latin1').replace(/\n/g, '') + '\0');
    await expect(store.get('11111111-2222-3333-4444-555555555555.pdf')).rejects.toThrow();
  });
});

const row = (
  sectionKey: string,
  locale: 'ta' | 'en',
  version: number,
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED',
  content: unknown,
): ContentSection => ({
  id: `${sectionKey}-${locale}-${version}`,
  sectionKey,
  locale,
  version,
  status,
  content: content as ContentSection['content'],
  editedById: null,
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe('content sections (#36)', () => {
  it('knows text slots, FAQ and story keys only', () => {
    expect(kindOf('hero.headline')).toBe('text');
    expect(kindOf('faq.tax-1')).toBe('faq');
    expect(kindOf('story.meena')).toBe('story');
    for (const bad of ['hero.other', 'faq.', 'faq.A B', 'faq.a.b', 'news.x', 'story'])
      expect(kindOf(bad)).toBeNull();
  });

  it('previews the newest draft, else the published version, per language', () => {
    const rows = [
      row('hero.headline', 'en', 1, 'PUBLISHED', { text: 'Old' }),
      row('hero.headline', 'en', 2, 'DRAFT', { text: 'New' }),
      row('hero.headline', 'ta', 1, 'PUBLISHED', { text: 'பழையது' }),
      row('hero.lead', 'en', 3, 'ARCHIVED', { text: 'Gone' }),
      row('faq.one', 'en', 1, 'DRAFT', { question: 'Q?', answer: 'A.', order: 1 }),
      row('story.a', 'en', 1, 'DRAFT', { title: 'T', body: 'B', consentRecordedOn: '2026-01-01' }),
      row('story.b', 'en', 1, 'DRAFT', { title: 'No consent', body: 'B' }),
    ];
    expect(previewOf(rows, 'en')).toEqual({
      locale: 'en',
      texts: { 'hero.headline': 'New' },
      faqs: [{ id: 'one', question: 'Q?', answer: 'A.' }],
      stories: [{ id: 'a', title: 'T', body: 'B' }],
    });
    expect(previewOf(rows, 'ta').texts).toEqual({ 'hero.headline': 'பழையது' });
  });

  it('drops undefined fields only', () => {
    expect(defined({ a: 1, b: undefined, c: null })).toEqual({ a: 1, c: null });
  });
});
