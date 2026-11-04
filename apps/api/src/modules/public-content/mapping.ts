import {
  SITE_TEXT_KEYS,
  type Locale,
  type PublicFaq,
  type PublicImpactMetric,
  type PublicProgramme,
  type PublicTransparencyDocument,
  type SiteTextKey,
} from '@theonetrust/contracts';
import type { PublicContentRepository } from './repository.ts';

type Section = Awaited<ReturnType<PublicContentRepository['publishedSections']>>[number];
type Programme = Awaited<ReturnType<PublicContentRepository['activeProgrammes']>>[number];
type Metric = Awaited<ReturnType<PublicContentRepository['publishedMetrics']>>[number];
type Document = Awaited<ReturnType<PublicContentRepository['publishedDocuments']>>[number];

const MAX_TEXT = 2_000;
const VALUE_FORMATS = ['count', 'inr_paise', 'percent'] as const;

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= MAX_TEXT ? trimmed : null;
}

function isTextKey(key: string): key is SiteTextKey {
  return (SITE_TEXT_KEYS as readonly string[]).includes(key);
}

/**
 * Content JSON is checked again on the way out: a malformed or unknown section is dropped,
 * never passed to the page half-filled.
 */
export function toSiteContent(sections: Section[]) {
  const texts: Partial<Record<SiteTextKey, string>> = {};
  const faqs: Array<PublicFaq & { order: number }> = [];
  for (const section of sections) {
    const content = section.content as Record<string, unknown> | null;
    if (!content || typeof content !== 'object' || Array.isArray(content)) continue;
    if (isTextKey(section.sectionKey)) {
      const value = text(content.text);
      if (value) texts[section.sectionKey] = value;
    } else if (/^faq\.[a-z0-9_-]{1,40}$/.test(section.sectionKey)) {
      const question = text(content.question);
      const answer = text(content.answer);
      const order = typeof content.order === 'number' ? content.order : 0;
      if (question && answer) {
        faqs.push({ id: section.sectionKey.slice(4), question, answer, order });
      }
    }
  }
  faqs.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  return { texts, faqs: faqs.map(({ order: _order, ...faq }) => faq) };
}

export function toProgramme(row: Programme, locale: Locale): PublicProgramme {
  return {
    slug: row.slug,
    title: locale === 'ta' ? row.titleTa : row.titleEn,
    description: (locale === 'ta' ? row.descriptionTa : row.descriptionEn) ?? null,
    designation: row.designation,
  };
}

/** Null when anything required to publish is missing (belt and braces over the DB CHECK). */
export function toMetric(row: Metric, locale: Locale): PublicImpactMetric | null {
  const source = text(locale === 'ta' ? row.sourceTa : row.sourceEn);
  const period = text(locale === 'ta' ? row.periodTa : row.periodEn);
  const label = text(locale === 'ta' ? row.labelTa : row.labelEn);
  const format = VALUE_FORMATS.find((f) => f === row.valueFormat);
  if (!source || !period || !label || !row.asOf || !row.approvedAt || !format) return null;
  return {
    id: row.id,
    label,
    value: row.value.toString(),
    valueFormat: format,
    source,
    period,
    asOf: row.asOf.toISOString().slice(0, 10),
  };
}

/** Documents need a public base URL; without one nothing is listed (no dead links). */
export function toDocument(
  row: Document,
  baseUrl: string | undefined,
): PublicTransparencyDocument | null {
  if (!baseUrl || !row.approvedAt) return null;
  return {
    id: row.id,
    title: row.title,
    language: row.locale,
    period: row.periodLabel,
    publishedOn: row.approvedAt.toISOString().slice(0, 10),
    fileType: row.fileType,
    fileSizeBytes: row.fileSize,
    url: new URL(
      row.storageKey.split('/').map(encodeURIComponent).join('/'),
      `${baseUrl.replace(/\/$/, '')}/`,
    ).toString(),
  };
}

/** Documents in the visitor's language first, then the others. */
export function byLanguage(locale: Locale) {
  return (a: PublicTransparencyDocument, b: PublicTransparencyDocument) =>
    Number(b.language === locale) - Number(a.language === locale);
}
