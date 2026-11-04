import type { Locale } from '@theonetrust/contracts';
import type { Db } from '../../db/client.ts';

/** Read-only queries for the public site. Every query filters on the published state. */
export function publicContentRepository(db: Db) {
  return {
    /** Latest PUBLISHED version of every content section in this language. */
    async publishedSections(locale: Locale) {
      const rows = await db.contentSection.findMany({
        where: { locale, status: 'PUBLISHED' },
        orderBy: [{ sectionKey: 'asc' }, { version: 'desc' }],
      });
      const latest = new Map<string, (typeof rows)[number]>();
      for (const row of rows) if (!latest.has(row.sectionKey)) latest.set(row.sectionKey, row);
      return [...latest.values()];
    },

    activeProgrammes() {
      return db.programme.findMany({
        where: { active: true },
        orderBy: [{ sortOrder: 'asc' }, { slug: 'asc' }],
      });
    },

    /** The database CHECK already forbids publishing without source/period/date/approval. */
    publishedMetrics() {
      return db.impactMetric.findMany({
        where: { status: 'PUBLISHED', approvedAt: { not: null }, asOf: { not: null } },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      });
    },

    publishedDocuments() {
      return db.transparencyDocument.findMany({
        where: { status: 'PUBLISHED', approvedAt: { not: null } },
        orderBy: [{ approvedAt: 'desc' }, { id: 'asc' }],
      });
    },
  };
}

export type PublicContentRepository = ReturnType<typeof publicContentRepository>;
