import type { PublicationStatusDto } from '@theonetrust/contracts';
import type { StatusTone } from '../components/ui/icons.tsx';
import type { UiLang } from '../components/ui/ui-strings.ts';
import { errorText } from './admin-context.ts';
import { AdminApiError } from './api.ts';
import type { CmsStrings } from './cms-strings.ts';
import type { AdminStrings } from './strings.ts';

/** Owner-facing text for an error from a content-management call (#36). */
export function cmsErrorText(t: AdminStrings, c: CmsStrings, error: unknown): string {
  const e = error instanceof AdminApiError ? error : new AdminApiError('INTERNAL_ERROR');
  if (e.code === 'CONFLICT') return c.conflict;
  if (e.code === 'VALIDATION_ERROR') return c.invalid;
  if (e.code === 'UNSUPPORTED_MEDIA_TYPE') return c.docWrongType;
  return errorText(t, e);
}

export const reasonOk = (reason: string) => reason.trim().length >= 5;

export function statusLabel(c: CmsStrings, status: PublicationStatusDto): string {
  return status === 'PUBLISHED'
    ? c.statusPublished
    : status === 'DRAFT'
      ? c.statusDraft
      : c.statusArchived;
}

export const statusTone = (status: PublicationStatusDto): StatusTone =>
  status === 'PUBLISHED' ? 'success' : status === 'DRAFT' ? 'warning' : 'neutral';

export function bytesFor(lang: UiLang) {
  const n = new Intl.NumberFormat(lang === 'ta' ? 'ta-IN' : 'en-IN', { maximumFractionDigits: 1 });
  return (bytes: number) =>
    bytes >= 1_048_576
      ? `${n.format(bytes / 1_048_576)} MB`
      : `${n.format(Math.max(1, Math.round(bytes / 1024)))} KB`;
}

/** Rupees typed by the owner → integer paise; null if not a whole, non-negative amount. */
export function rupeesToPaise(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d{1,9}$/.test(trimmed)) return null;
  return Number(trimmed) * 100;
}

/** Reads a chosen file as base64 (without the data: prefix). */
export function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
    reader.onerror = () => reject(new Error('read failed'));
    reader.readAsDataURL(file);
  });
}
