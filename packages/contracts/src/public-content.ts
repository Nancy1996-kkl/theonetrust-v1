import type { Locale } from './api.ts';

/**
 * Public content API (#21). Every response is for ONE locale and contains only published,
 * approved records. Anything unpublished, unapproved or unsourced is never returned.
 */

/** Text slots the owner can publish (one short text per slot and language). */
export const SITE_TEXT_KEYS = [
  'hero.eyebrow',
  'hero.headline',
  'hero.lead',
  'hero.payment_note',
  'about.intro',
  'ways.intro',
  'final_cta.title',
] as const;
export type SiteTextKey = (typeof SITE_TEXT_KEYS)[number];

export interface PublicFaq {
  id: string;
  question: string;
  answer: string;
}

export interface SiteContentResponse {
  locale: Locale;
  texts: Partial<Record<SiteTextKey, string>>;
  faqs: PublicFaq[];
  /** Only metrics with a source, a period and an "as of" date (and owner approval). */
  impactMetrics: PublicImpactMetric[];
}

export interface PublicProgramme {
  slug: string;
  title: string;
  description: string | null;
  designation: 'GENERAL' | 'RESTRICTED';
}

export interface ProgrammesResponse {
  locale: Locale;
  programmes: PublicProgramme[];
}

export interface PublicImpactMetric {
  id: string;
  label: string;
  /** Integer as a string (BigInt-safe); formatted by the page. */
  value: string;
  valueFormat: 'count' | 'inr_paise' | 'percent';
  source: string;
  period: string;
  /** ISO date (YYYY-MM-DD) the figure is correct as of. */
  asOf: string;
}

export interface PublicTransparencyDocument {
  id: string;
  title: string;
  /** Language of the document itself. */
  language: Locale;
  period: string | null;
  /** ISO date it was approved for publication. */
  publishedOn: string;
  fileType: string;
  fileSizeBytes: number;
  url: string;
}

export interface TransparencyDocumentsResponse {
  locale: Locale;
  documents: PublicTransparencyDocument[];
}
