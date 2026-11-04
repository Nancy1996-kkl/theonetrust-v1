import type { Locale } from './api.ts';

/**
 * Owner content management (#36): programmes, page text/FAQ/stories, impact metrics,
 * transparency documents and trust settings. Every write carries a reason and is audited.
 */

export type PublicationStatusDto = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

/** Files a transparency document may be. Anything else (executables included) is refused. */
export const DOCUMENT_FILE_TYPES = ['application/pdf', 'image/png', 'image/jpeg'] as const;
export type DocumentFileType = (typeof DOCUMENT_FILE_TYPES)[number];

export interface AdminProgramme {
  id: string;
  slug: string;
  titleTa: string;
  titleEn: string;
  descriptionTa: string | null;
  descriptionEn: string | null;
  designation: 'GENERAL' | 'RESTRICTED';
  active: boolean;
  sortOrder: number;
  donations: number;
}

export interface ProgrammeInput {
  slug?: string;
  titleTa?: string;
  titleEn?: string;
  descriptionTa?: string | null;
  descriptionEn?: string | null;
  designation?: 'GENERAL' | 'RESTRICTED';
  active?: boolean;
  sortOrder?: number;
  reason: string;
}

/** Content kept per language. A text slot has `text`; a FAQ has question/answer/order; a story
 * has title/body and the date the person's consent was recorded. */
export type SectionContent = Record<string, string | number>;

export interface AdminSectionVersion {
  version: number;
  status: PublicationStatusDto;
  content: SectionContent;
  updatedAt: string;
}

export interface AdminSection {
  key: string;
  kind: 'text' | 'faq' | 'story';
  draft: Record<Locale, AdminSectionVersion | null>;
  published: Record<Locale, AdminSectionVersion | null>;
}

export interface SectionDraftInput {
  ta: SectionContent;
  en: SectionContent;
  reason: string;
}

export interface ContentPreview {
  locale: Locale;
  texts: Record<string, string>;
  faqs: Array<{ id: string; question: string; answer: string }>;
  stories: Array<{ id: string; title: string; body: string }>;
}

export interface AdminMetric {
  id: string;
  labelTa: string;
  labelEn: string;
  value: string;
  valueFormat: 'count' | 'inr_paise' | 'percent';
  sourceTa: string | null;
  sourceEn: string | null;
  periodTa: string | null;
  periodEn: string | null;
  asOf: string | null;
  evidenceUrl: string | null;
  status: PublicationStatusDto;
  approvedAt: string | null;
  sortOrder: number;
}

export type MetricInput = Partial<Omit<AdminMetric, 'id' | 'status' | 'approvedAt'>> & {
  reason: string;
};

export interface AdminDocument {
  id: string;
  title: string;
  locale: Locale;
  periodLabel: string | null;
  fileType: string;
  fileSize: number;
  status: PublicationStatusDto;
  approvedAt: string | null;
  uploadedAt: string;
  /** Public link once published (null while private or when no public base URL is set). */
  publicUrl: string | null;
}

export interface DocumentUpload {
  title: string;
  locale: Locale;
  periodLabel?: string | null;
  fileName: string;
  fileType: DocumentFileType;
  /** The file, base64-encoded. Its real type is checked on the server, not trusted. */
  dataBase64: string;
  reason: string;
}

export interface AdminDocumentList {
  items: AdminDocument[];
  maxBytes: number;
  uploadsEnabled: boolean;
}

export interface AdminTrustSettings {
  legalName: string | null;
  registrationText: string | null;
  receiptMinPaise: number;
  maxDonationPaise: number;
  /** Owner notifications go here; falls back to the server's configured address. */
  ownerEmail: string | null;
  ownerEmailSource: 'settings' | 'server' | 'none';
  /** JSON fee table (see the donation fee estimate). Null = fee cover not offered. */
  feeTable: unknown;
  /** Status only. Secrets are set on the server and never shown here. */
  payment: {
    mode: 'live' | 'test' | 'not_configured';
    keyId: string | null;
    keySecretSet: boolean;
    webhookSecretSet: boolean;
    subscriptionsEnabled: boolean;
  };
}

export interface TrustSettingsInput {
  legalName?: string | null;
  registrationText?: string | null;
  receiptMinPaise?: number;
  maxDonationPaise?: number;
  ownerEmail?: string | null;
  feeTable?: unknown;
  reason: string;
}
