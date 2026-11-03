import type { Db } from '../client.ts';
import type { FundDesignation } from '../../generated/prisma/enums.ts';

export interface ProgrammeInput {
  slug: string;
  titleTa: string;
  titleEn: string;
  descriptionTa?: string | null;
  descriptionEn?: string | null;
  designation?: FundDesignation;
  active?: boolean;
  sortOrder?: number;
}

export function programmeRepository(db: Db) {
  return {
    /** Active programmes in display order — what the public site may list. */
    listActive() {
      return db.programme.findMany({
        where: { active: true },
        orderBy: [{ sortOrder: 'asc' }, { slug: 'asc' }],
      });
    },

    findBySlug(slug: string) {
      return db.programme.findUnique({ where: { slug } });
    },

    upsertBySlug(input: ProgrammeInput) {
      return db.programme.upsert({ where: { slug: input.slug }, create: input, update: input });
    },
  };
}
