import { z } from 'zod';
import { SITE_TEXT_KEYS, type ContentPreview, type Locale } from '@theonetrust/contracts';
import type { ContentSection } from '../../generated/prisma/client.ts';
import { toSiteContent } from '../public-content/mapping.ts';

export type SectionKind = 'text' | 'faq' | 'story';

const SLUG = /^[a-z0-9_-]{1,40}$/;
const line = (max: number) => z.string().trim().min(1).max(max);

const TextContent = z.strictObject({ text: line(2000) });
const FaqContent = z.strictObject({
  question: line(300),
  answer: line(2000),
  order: z.number().int().min(0).max(999),
});
/** A story is published only with the date the person's consent was recorded. */
const StoryContent = z.strictObject({
  title: line(200),
  body: line(4000),
  consentRecordedOn: z.iso.date(),
});

export const CONTENT_SCHEMAS = { text: TextContent, faq: FaqContent, story: StoryContent };

/** Which kind of section a key is, or null for a key the site does not know. */
export function kindOf(key: string): SectionKind | null {
  if ((SITE_TEXT_KEYS as readonly string[]).includes(key)) return 'text';
  const [prefix, id = '', ...rest] = key.split('.');
  if (rest.length || !SLUG.test(id)) return null;
  if (prefix === 'faq') return 'faq';
  if (prefix === 'story') return 'story';
  return null;
}

type Row = ContentSection;

/**
 * What the page would show in one language if every current draft were published: for each
 * key, the newest draft, else the published version. Uses the public mapping, so the preview
 * drops exactly what the public site would drop.
 */
export function previewOf(rows: Row[], locale: Locale): ContentPreview {
  const pick = new Map<string, Row>();
  for (const row of rows) {
    if (row.locale !== locale || row.status === 'ARCHIVED') continue;
    const seen = pick.get(row.sectionKey);
    if (!seen || row.version > seen.version) pick.set(row.sectionKey, row);
  }
  const chosen = [...pick.values()];
  const site = toSiteContent(chosen);
  const stories = chosen.flatMap((r) => {
    if (kindOf(r.sectionKey) !== 'story') return [];
    const parsed = StoryContent.safeParse(r.content);
    return parsed.success
      ? [{ id: r.sectionKey.slice(6), title: parsed.data.title, body: parsed.data.body }]
      : [];
  });
  return { locale, texts: site.texts, faqs: site.faqs, stories };
}

type Defined<T> = { [K in keyof T]?: Exclude<T[K], undefined> };

/** Drops keys whose value is undefined (an omitted field means "leave it as it is"). */
export function defined<T extends Record<string, unknown>>(value: T): Defined<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Defined<T>;
}
