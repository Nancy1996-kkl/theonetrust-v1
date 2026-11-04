import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type {
  AdminMetric,
  AdminProgramme,
  AdminSection,
  AdminSectionVersion,
  ContentPreview,
  Locale,
} from '@theonetrust/contracts';
import type { Db } from '../../db/client.ts';
import type { ContentSection, ImpactMetric, Programme } from '../../generated/prisma/client.ts';
import { AppError } from '../../http/errors.ts';
import { parseInput } from '../../http/validation.ts';
import { changedFieldNames } from '../audit/audit.ts';
import { CONTENT_SCHEMAS, defined, kindOf, previewOf } from './content.ts';

const Reason = z.string().trim().min(5).max(400);
const ReasonBody = z.object({ reason: Reason });
const IdParams = z.object({ id: z.uuid() });
const KeyParams = z.object({ key: z.string().min(1).max(60) });
const LocaleQuery = z.object({ locale: z.enum(['ta', 'en']).default('en') });
const optionalText = (max: number) => z.string().trim().min(1).max(max).nullable().optional();

const ProgrammeFields = {
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(60),
  titleTa: z.string().trim().min(2).max(120),
  titleEn: z.string().trim().min(2).max(120),
  descriptionTa: optionalText(1000),
  descriptionEn: optionalText(1000),
  designation: z.enum(['GENERAL', 'RESTRICTED']),
  active: z.boolean(),
  sortOrder: z.number().int().min(0).max(999),
};
const ProgrammeCreate = z.object({
  ...ProgrammeFields,
  designation: ProgrammeFields.designation.default('GENERAL'),
  active: ProgrammeFields.active.default(false),
  sortOrder: ProgrammeFields.sortOrder.default(0),
  reason: Reason,
});
const ProgrammeUpdate = z.object({
  slug: ProgrammeFields.slug.optional(),
  titleTa: ProgrammeFields.titleTa.optional(),
  titleEn: ProgrammeFields.titleEn.optional(),
  descriptionTa: ProgrammeFields.descriptionTa,
  descriptionEn: ProgrammeFields.descriptionEn,
  designation: ProgrammeFields.designation.optional(),
  active: ProgrammeFields.active.optional(),
  sortOrder: ProgrammeFields.sortOrder.optional(),
  reason: Reason,
});

const MetricFields = z.object({
  labelTa: z.string().trim().min(2).max(120).optional(),
  labelEn: z.string().trim().min(2).max(120).optional(),
  value: z
    .string()
    .regex(/^\d{1,15}$/)
    .optional(),
  valueFormat: z.enum(['count', 'inr_paise', 'percent']).optional(),
  sourceTa: optionalText(300),
  sourceEn: optionalText(300),
  periodTa: optionalText(120),
  periodEn: optionalText(120),
  asOf: z.iso.date().nullable().optional(),
  evidenceUrl: z
    .url({ protocol: /^https$/ })
    .max(500)
    .nullable()
    .optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
  reason: Reason,
});

const SectionBody = z.object({
  ta: z.record(z.string(), z.unknown()),
  en: z.record(z.string(), z.unknown()),
  reason: Reason,
});

function programmeView(row: Programme & { _count: { donationIntents: number } }): AdminProgramme {
  return {
    id: row.id,
    slug: row.slug,
    titleTa: row.titleTa,
    titleEn: row.titleEn,
    descriptionTa: row.descriptionTa,
    descriptionEn: row.descriptionEn,
    designation: row.designation,
    active: row.active,
    sortOrder: row.sortOrder,
    donations: row._count.donationIntents,
  };
}

function metricView(row: ImpactMetric): AdminMetric {
  return {
    id: row.id,
    labelTa: row.labelTa,
    labelEn: row.labelEn,
    value: row.value.toString(),
    valueFormat:
      row.valueFormat === 'inr_paise' || row.valueFormat === 'percent' ? row.valueFormat : 'count',
    sourceTa: row.sourceTa,
    sourceEn: row.sourceEn,
    periodTa: row.periodTa,
    periodEn: row.periodEn,
    asOf: row.asOf?.toISOString().slice(0, 10) ?? null,
    evidenceUrl: row.evidenceUrl,
    status: row.status,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    sortOrder: row.sortOrder,
  };
}

const versionView = (row: ContentSection | undefined): AdminSectionVersion | null =>
  row
    ? {
        version: row.version,
        status: row.status,
        content: row.content as AdminSectionVersion['content'],
        updatedAt: row.updatedAt.toISOString(),
      }
    : null;

/** Newest row per (key, locale) for one status. */
function newest(rows: ContentSection[], key: string, locale: Locale, status: string) {
  return rows
    .filter((r) => r.sectionKey === key && r.locale === locale && r.status === status)
    .sort((a, b) => b.version - a.version)[0];
}

function sectionsView(rows: ContentSection[], extraKeys: readonly string[]): AdminSection[] {
  const keys = [...new Set([...extraKeys, ...rows.map((r) => r.sectionKey)])];
  return keys.flatMap((key) => {
    const kind = kindOf(key);
    if (!kind) return [];
    return [
      {
        key,
        kind,
        draft: {
          ta: versionView(newest(rows, key, 'ta', 'DRAFT')),
          en: versionView(newest(rows, key, 'en', 'DRAFT')),
        },
        published: {
          ta: versionView(newest(rows, key, 'ta', 'PUBLISHED')),
          en: versionView(newest(rows, key, 'en', 'PUBLISHED')),
        },
      },
    ];
  });
}

/** Publishing a metric needs everything the public site shows with it (the DB CHECK agrees). */
function publishable(m: ImpactMetric): boolean {
  return Boolean(
    m.sourceTa?.trim() &&
    m.sourceEn?.trim() &&
    m.periodTa?.trim() &&
    m.periodEn?.trim() &&
    m.asOf &&
    m.labelTa.trim() &&
    m.labelEn.trim(),
  );
}

function audited(request: FastifyRequest) {
  if (!request.audit || !request.admin) throw new AppError('SERVICE_UNAVAILABLE');
  return { audit: request.audit, actorId: request.admin.userId };
}

/**
 * `/api/v1/admin/{programmes,content,metrics}` (#36). Drafts are never public: the public
 * queries read PUBLISHED rows only. Every write needs a reason and is audited.
 */
export async function cmsAdminRoutes(
  app: FastifyInstance,
  opts: { db: Db; now: () => Date; textKeys: readonly string[] },
) {
  const { db } = opts;
  const withCount = { _count: { select: { donationIntents: true } } } as const;

  // ── Programmes ───────────────────────────────────────────────────────────────────────
  app.get('/programmes', async () => {
    const rows = await db.programme.findMany({
      include: withCount,
      orderBy: [{ sortOrder: 'asc' }, { slug: 'asc' }],
    });
    return { items: rows.map(programmeView) };
  });

  app.post('/programmes', async (request, reply) => {
    const { reason, ...data } = parseInput(ProgrammeCreate, request.body);
    const { audit } = audited(request);
    if (await db.programme.findUnique({ where: { slug: data.slug } })) {
      throw new AppError('CONFLICT', [{ path: 'slug', issue: 'taken' }]);
    }
    const row = await audit.mutate(
      (r: Programme) => ({
        action: 'programme.create',
        entityType: 'programme',
        entityId: r.id,
        changedFields: Object.keys(data).sort(),
        reason,
      }),
      (tx) =>
        tx.programme.create({
          data: { ...defined(data), slug: data.slug, titleTa: data.titleTa, titleEn: data.titleEn },
        }),
    );
    reply.code(201);
    return programmeView({ ...row, _count: { donationIntents: 0 } });
  });

  app.patch('/programmes/:id', async (request) => {
    const { id } = parseInput(IdParams, request.params);
    const { reason, ...data } = parseInput(ProgrammeUpdate, request.body);
    const { audit } = audited(request);
    const current = await db.programme.findUnique({ where: { id } });
    if (!current) throw new AppError('NOT_FOUND');
    if (data.slug && data.slug !== current.slug) {
      if (await db.programme.findUnique({ where: { slug: data.slug } })) {
        throw new AppError('CONFLICT', [{ path: 'slug', issue: 'taken' }]);
      }
    }
    const changed = changedFieldNames(current as unknown as Record<string, unknown>, data);
    await audit.mutate(
      {
        action:
          data.active === false && current.active
            ? 'programme.pause'
            : data.active === true && !current.active
              ? 'programme.activate'
              : 'programme.update',
        entityType: 'programme',
        entityId: id,
        changedFields: changed,
        reason,
      },
      (tx) => tx.programme.update({ where: { id }, data: defined(data) }),
    );
    const row = await db.programme.findUniqueOrThrow({ where: { id }, include: withCount });
    return programmeView(row);
  });

  /** Only a programme nothing points at can be deleted; one with gifts is paused instead. */
  app.delete('/programmes/:id', async (request) => {
    const { id } = parseInput(IdParams, request.params);
    const { reason } = parseInput(ReasonBody, request.body);
    const { audit } = audited(request);
    const row = await db.programme.findUnique({
      where: { id },
      include: { _count: { select: { donationIntents: true, subscriptions: true } } },
    });
    if (!row) throw new AppError('NOT_FOUND');
    if (row._count.donationIntents || row._count.subscriptions) {
      throw new AppError('CONFLICT', [{ path: 'id', issue: 'has_donations' }]);
    }
    await audit.mutate(
      {
        action: 'programme.delete',
        entityType: 'programme',
        entityId: id,
        changedFields: [],
        reason,
      },
      (tx) => tx.programme.delete({ where: { id } }),
    );
    return { deleted: true };
  });

  // ── Page text, FAQ and stories ───────────────────────────────────────────────────────
  app.get('/content', async () => {
    const rows = await db.contentSection.findMany({ where: { status: { not: 'ARCHIVED' } } });
    return { items: sectionsView(rows, opts.textKeys) };
  });

  app.get('/content/preview', async (request): Promise<ContentPreview> => {
    const { locale } = parseInput(LocaleQuery, request.query);
    const rows = await db.contentSection.findMany({ where: { status: { not: 'ARCHIVED' } } });
    return previewOf(rows, locale);
  });

  /** Saves a draft in BOTH languages (Tamil/English parity). Never touches the public version. */
  app.put('/content/:key', async (request) => {
    const { key } = parseInput(KeyParams, request.params);
    const body = parseInput(SectionBody, request.body);
    const kind = kindOf(key);
    if (!kind) throw new AppError('VALIDATION_ERROR', [{ path: 'key', issue: 'unknown_section' }]);
    const schema = CONTENT_SCHEMAS[kind];
    const content = {} as Record<Locale, Record<string, unknown>>;
    for (const locale of ['ta', 'en'] as const) {
      const parsed = schema.safeParse(body[locale]);
      if (!parsed.success) {
        throw new AppError(
          'VALIDATION_ERROR',
          parsed.error.issues.map((i) => ({
            path: [locale, ...i.path].join('.'),
            issue: i.code,
          })),
        );
      }
      content[locale] = parsed.data;
    }
    if (kind === 'story' && content.ta.consentRecordedOn !== content.en.consentRecordedOn) {
      throw new AppError('VALIDATION_ERROR', [{ path: 'consentRecordedOn', issue: 'mismatch' }]);
    }
    const { audit, actorId } = audited(request);
    const rows = await db.contentSection.findMany({ where: { sectionKey: key } });
    const next = Math.max(0, ...rows.map((r) => r.version)) + 1;
    await audit.mutate(
      {
        action: 'content.draft_saved',
        entityType: 'content_section',
        entityId: key,
        changedFields: ['en', 'ta'],
        reason: body.reason,
      },
      async (tx) => {
        for (const locale of ['ta', 'en'] as const) {
          const draft = newest(rows, key, locale, 'DRAFT');
          const data = { content: content[locale] as object, editedById: actorId };
          if (draft) await tx.contentSection.update({ where: { id: draft.id }, data });
          else
            await tx.contentSection.create({
              data: { ...data, sectionKey: key, locale, version: next },
            });
        }
      },
    );
    const after = await db.contentSection.findMany({ where: { sectionKey: key } });
    return sectionsView(after, [key])[0];
  });

  /** Publishes the drafts of both languages together; the previous version is archived. */
  app.post('/content/:key/publish', async (request) => {
    const { key } = parseInput(KeyParams, request.params);
    const { reason } = parseInput(ReasonBody, request.body);
    const kind = kindOf(key);
    if (!kind) throw new AppError('NOT_FOUND');
    const { audit } = audited(request);
    const rows = await db.contentSection.findMany({ where: { sectionKey: key } });
    const ta = newest(rows, key, 'ta', 'DRAFT');
    const en = newest(rows, key, 'en', 'DRAFT');
    if (!ta || !en) {
      throw new AppError('VALIDATION_ERROR', [{ path: 'draft', issue: 'both_languages_required' }]);
    }
    // Saved drafts were validated; re-check in case the rules changed since.
    for (const row of [ta, en]) {
      if (!CONTENT_SCHEMAS[kind].safeParse(row.content).success) {
        throw new AppError('VALIDATION_ERROR', [{ path: row.locale, issue: 'invalid_content' }]);
      }
    }
    await audit.mutate(
      {
        action: 'content.publish',
        entityType: 'content_section',
        entityId: key,
        changedFields: ['status'],
        reason,
      },
      async (tx) => {
        await tx.contentSection.updateMany({
          where: { sectionKey: key, status: 'PUBLISHED' },
          data: { status: 'ARCHIVED' },
        });
        await tx.contentSection.updateMany({
          where: { id: { in: [ta.id, en.id] } },
          data: { status: 'PUBLISHED' },
        });
      },
    );
    const after = await db.contentSection.findMany({ where: { sectionKey: key } });
    return sectionsView(after, [key])[0];
  });

  /** Takes a section off the public site (both languages). Drafts stay. */
  app.post('/content/:key/unpublish', async (request) => {
    const { key } = parseInput(KeyParams, request.params);
    const { reason } = parseInput(ReasonBody, request.body);
    if (!kindOf(key)) throw new AppError('NOT_FOUND');
    const { audit } = audited(request);
    const count = await db.contentSection.count({
      where: { sectionKey: key, status: 'PUBLISHED' },
    });
    if (!count) throw new AppError('CONFLICT', [{ path: 'status', issue: 'not_published' }]);
    await audit.mutate(
      {
        action: 'content.unpublish',
        entityType: 'content_section',
        entityId: key,
        changedFields: ['status'],
        reason,
      },
      (tx) =>
        tx.contentSection.updateMany({
          where: { sectionKey: key, status: 'PUBLISHED' },
          data: { status: 'ARCHIVED' },
        }),
    );
    const after = await db.contentSection.findMany({ where: { sectionKey: key } });
    return sectionsView(after, [key])[0];
  });

  // ── Impact metrics ───────────────────────────────────────────────────────────────────
  app.get('/metrics', async () => {
    const rows = await db.impactMetric.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return { items: rows.map(metricView) };
  });

  function metricData(body: z.output<typeof MetricFields>) {
    const { value, asOf, ...withReason } = body;
    const rest: Partial<typeof withReason> = { ...withReason };
    delete rest.reason;
    return {
      ...defined(rest),
      ...(value !== undefined && { value: BigInt(value) }),
      ...(asOf !== undefined && { asOf: asOf === null ? null : new Date(`${asOf}T00:00:00Z`) }),
    };
  }

  app.post('/metrics', async (request, reply) => {
    const body = parseInput(MetricFields, request.body);
    if (!body.labelTa || !body.labelEn || body.value === undefined) {
      throw new AppError('VALIDATION_ERROR', [{ path: 'label', issue: 'required' }]);
    }
    const { audit } = audited(request);
    const data = { ...metricData(body), labelTa: body.labelTa, labelEn: body.labelEn };
    const row = await audit.mutate(
      (r: ImpactMetric) => ({
        action: 'metric.create',
        entityType: 'impact_metric',
        entityId: r.id,
        changedFields: Object.keys(data).sort(),
        reason: body.reason,
      }),
      (tx) => tx.impactMetric.create({ data: { ...data, value: BigInt(body.value ?? '0') } }),
    );
    reply.code(201);
    return metricView(row);
  });

  /** Editing a published figure takes it back to a draft: it must be approved again. */
  app.patch('/metrics/:id', async (request) => {
    const { id } = parseInput(IdParams, request.params);
    const body = parseInput(MetricFields, request.body);
    const { audit } = audited(request);
    const current = await db.impactMetric.findUnique({ where: { id } });
    if (!current) throw new AppError('NOT_FOUND');
    const data = metricData(body);
    const changed = changedFieldNames(
      metricView(current) as unknown as Record<string, unknown>,
      Object.fromEntries(Object.entries(body).filter(([k]) => k !== 'reason')) as Record<
        string,
        unknown
      >,
    );
    const backToDraft = current.status === 'PUBLISHED' && changed.length > 0;
    const row = await audit.mutate(
      {
        action: backToDraft ? 'metric.update_unpublished' : 'metric.update',
        entityType: 'impact_metric',
        entityId: id,
        changedFields: changed,
        reason: body.reason,
      },
      (tx) =>
        tx.impactMetric.update({
          where: { id },
          data: {
            ...data,
            ...(backToDraft && { status: 'DRAFT', approvedAt: null, approvedById: null }),
          },
        }),
    );
    return metricView(row);
  });

  app.post('/metrics/:id/publish', async (request) => {
    const { id } = parseInput(IdParams, request.params);
    const { reason } = parseInput(ReasonBody, request.body);
    const { audit, actorId } = audited(request);
    const current = await db.impactMetric.findUnique({ where: { id } });
    if (!current) throw new AppError('NOT_FOUND');
    if (!publishable(current)) {
      throw new AppError('VALIDATION_ERROR', [{ path: 'evidence', issue: 'source_period_date' }]);
    }
    const row = await audit.mutate(
      {
        action: 'metric.publish',
        entityType: 'impact_metric',
        entityId: id,
        changedFields: ['status'],
        reason,
      },
      (tx) =>
        tx.impactMetric.update({
          where: { id },
          data: { status: 'PUBLISHED', approvedAt: opts.now(), approvedById: actorId },
        }),
    );
    return metricView(row);
  });

  app.post('/metrics/:id/unpublish', async (request) => {
    const { id } = parseInput(IdParams, request.params);
    const { reason } = parseInput(ReasonBody, request.body);
    const { audit } = audited(request);
    const current = await db.impactMetric.findUnique({ where: { id } });
    if (!current) throw new AppError('NOT_FOUND');
    if (current.status !== 'PUBLISHED') {
      throw new AppError('CONFLICT', [{ path: 'status', issue: 'not_published' }]);
    }
    const row = await audit.mutate(
      {
        action: 'metric.unpublish',
        entityType: 'impact_metric',
        entityId: id,
        changedFields: ['status'],
        reason,
      },
      (tx) => tx.impactMetric.update({ where: { id }, data: { status: 'ARCHIVED' } }),
    );
    return metricView(row);
  });

  app.delete('/metrics/:id', async (request) => {
    const { id } = parseInput(IdParams, request.params);
    const { reason } = parseInput(ReasonBody, request.body);
    const { audit } = audited(request);
    const current = await db.impactMetric.findUnique({ where: { id } });
    if (!current) throw new AppError('NOT_FOUND');
    if (current.status === 'PUBLISHED') {
      throw new AppError('CONFLICT', [{ path: 'status', issue: 'unpublish_first' }]);
    }
    await audit.mutate(
      {
        action: 'metric.delete',
        entityType: 'impact_metric',
        entityId: id,
        changedFields: [],
        reason,
      },
      (tx) => tx.impactMetric.delete({ where: { id } }),
    );
    return { deleted: true };
  });
}
