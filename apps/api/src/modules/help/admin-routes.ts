import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { HELP_KINDS, HELP_REQUEST_STATUSES } from '@theonetrust/contracts';
import type { Db } from '../../db/client.ts';
import type { Prisma } from '../../generated/prisma/client.ts';
import { AppError } from '../../http/errors.ts';
import { parseInput } from '../../http/validation.ts';
import { changedFieldNames } from '../audit/audit.ts';
import { csvRow, maskPhone, maskText } from './masking.ts';

const ListQuery = z.object({
  status: z.enum(HELP_REQUEST_STATUSES).optional(),
  helpType: z.enum(HELP_KINDS).optional(),
  language: z.enum(['ta', 'en']).optional(),
  kind: z.enum(['FULL', 'CALLBACK']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z_[0-9a-f-]{36}$/)
    .optional(),
});
const ExportQuery = ListQuery.omit({ limit: true, cursor: true });
const IdParams = z.object({ id: z.uuid() });
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const UpdateBody = z
  .object({
    status: z.enum(HELP_REQUEST_STATUSES).optional(),
    assigneeId: z.uuid().nullable().optional(),
    remindOn: isoDate.nullable().optional(),
    reason: z.string().trim().max(500).optional(),
  })
  .refine((b) => b.status !== undefined || b.assigneeId !== undefined || b.remindOn !== undefined, {
    message: 'nothing to change',
  });
const BOM = String.fromCharCode(0xfeff);
const NoteBody = z.object({ body: z.string().trim().min(1).max(2000) });

type Filters = z.output<typeof ExportQuery>;

function where(filters: Filters): Prisma.HelpRequestWhereInput {
  return {
    ...(filters.status && { status: filters.status }),
    ...(filters.helpType && { helpTypes: { has: filters.helpType } }),
    ...(filters.language && { locale: filters.language }),
    ...(filters.kind && { kind: filters.kind }),
  };
}

type Row = Prisma.HelpRequestGetPayload<{ include: { assignee: { select: { email: true } } } }>;

/** List rows: phone and name/village masked; the full record is on the detail screen. */
function listItem(row: Row) {
  return {
    id: row.id,
    reference: row.reference,
    createdAt: row.createdAt.toISOString(),
    kind: row.kind,
    status: row.status,
    helpTypes: row.helpTypes,
    callLanguage: row.locale,
    bestTime: row.bestTime,
    phoneMasked: maskPhone(row.contactPhone),
    assigneeEmail: row.assignee?.email ?? null,
    remindOn: row.remindOn?.toISOString().slice(0, 10) ?? null,
  };
}

/**
 * Owner case inbox (plan §5): list + filters, detail, status / assignee / reminder changes,
 * private notes, masked CSV export. Registered inside the admin plugin, so every route is
 * session-guarded and every change is audited through `request.audit.mutate`.
 */
export async function helpAdminRoutes(app: FastifyInstance, opts: { db: Db }) {
  const { db } = opts;
  const audit = (request: FastifyRequest) => {
    if (!request.audit) throw new AppError('SERVICE_UNAVAILABLE');
    return request.audit;
  };

  async function load(id: string) {
    const row = await db.helpRequest.findUnique({
      where: { id },
      include: { assignee: { select: { email: true } } },
    });
    if (!row) throw new AppError('NOT_FOUND');
    return row;
  }

  app.get('/help-requests', async (request) => {
    const q = parseInput(ListQuery, request.query);
    const and: Prisma.HelpRequestWhereInput[] = [where(q)];
    if (q.cursor) {
      const [at = '', id = ''] = q.cursor.split('_');
      const createdAt = new Date(at);
      and.push({ OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: id } }] });
    }
    const rows = await db.helpRequest.findMany({
      where: { AND: and },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      include: { assignee: { select: { email: true } } },
    });
    const page = rows.slice(0, q.limit);
    const last = page.at(-1);
    return {
      items: page.map(listItem),
      nextCursor:
        rows.length > q.limit && last ? `${last.createdAt.toISOString()}_${last.id}` : null,
    };
  });

  app.get('/help-requests/export.csv', async (request, reply: FastifyReply) => {
    const filters = parseInput(ExportQuery, request.query);
    const rows = await db.helpRequest.findMany({
      where: where(filters),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: { assignee: { select: { email: true } } },
    });
    // Exports are a sensitive read: recorded, with the filters used (no personal data).
    await db.auditLog.create({
      data: {
        actorId: request.admin?.userId ?? null,
        action: 'help_request.exported',
        entityType: 'help_request',
        changedFields: Object.keys(filters).sort(),
        correlationId: request.id,
        reason: `${rows.length} rows`,
      },
    });
    const header = [
      'reference',
      'created_at_utc',
      'kind',
      'status',
      'help_types',
      'call_language',
      'best_time',
      'phone_masked',
      'person_masked',
      'assignee',
      'remind_on',
    ];
    const lines = rows.map((row) =>
      csvRow([
        row.reference,
        row.createdAt.toISOString(),
        row.kind,
        row.status,
        row.helpTypes.join(' '),
        row.locale,
        row.bestTime ?? '',
        maskPhone(row.contactPhone),
        maskText(row.personNameOrVillage),
        row.assignee?.email ?? '',
        row.remindOn?.toISOString().slice(0, 10) ?? '',
      ]),
    );
    reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', 'attachment; filename="help-requests.csv"');
    // BOM so Excel opens Tamil text correctly.
    return `${BOM}${[csvRow(header), ...lines].join('\r\n')}\r\n`;
  });

  app.get('/help-requests/:id', async (request) => {
    const { id } = parseInput(IdParams, request.params);
    const row = await load(id);
    const [notes, history] = await Promise.all([
      db.helpRequestNote.findMany({
        where: { helpRequestId: id },
        orderBy: { createdAt: 'asc' },
        include: { author: { select: { email: true } } },
      }),
      db.auditLog.findMany({
        where: { entityType: 'help_request', entityId: id },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        include: { actor: { select: { email: true } } },
      }),
    ]);
    return {
      ...listItem(row),
      forWhom: row.forWhom,
      description: row.description,
      phone: row.contactPhone,
      personNameOrVillage: row.personNameOrVillage,
      pageLanguage: row.pageLocale,
      notes: notes.map((n) => ({
        id: n.id,
        body: n.body,
        authorEmail: n.author.email,
        createdAt: n.createdAt.toISOString(),
      })),
      history: history.map((h) => ({
        action: h.action,
        actorEmail: h.actor?.email ?? null,
        changedFields: h.changedFields,
        reason: h.reason,
        createdAt: h.createdAt.toISOString(),
      })),
    };
  });

  app.patch('/help-requests/:id', async (request) => {
    const { id } = parseInput(IdParams, request.params);
    const body = parseInput(UpdateBody, request.body);
    const before = await load(id);
    if (body.assigneeId) {
      const assignee = await db.adminUser.findUnique({ where: { id: body.assigneeId } });
      if (!assignee?.active) {
        throw new AppError('VALIDATION_ERROR', [{ path: 'assigneeId', issue: 'invalid' }]);
      }
    }
    const data = {
      ...(body.status !== undefined && { status: body.status }),
      ...(body.assigneeId !== undefined && { assigneeId: body.assigneeId }),
      ...(body.remindOn !== undefined && {
        remindOn: body.remindOn === null ? null : new Date(`${body.remindOn}T00:00:00Z`),
      }),
    };
    const changed = changedFieldNames(
      {
        status: before.status,
        assigneeId: before.assigneeId,
        remindOn: before.remindOn?.toISOString().slice(0, 10) ?? null,
      },
      {
        ...(body.status !== undefined && { status: body.status }),
        ...(body.assigneeId !== undefined && { assigneeId: body.assigneeId }),
        ...(body.remindOn !== undefined && { remindOn: body.remindOn }),
      },
    );
    await audit(request).mutate(
      {
        action:
          body.status && body.status !== before.status
            ? 'help_request.status_changed'
            : 'help_request.updated',
        entityType: 'help_request',
        entityId: id,
        changedFields: changed,
        reason: body.reason ?? null,
      },
      (tx) => tx.helpRequest.update({ where: { id }, data }),
    );
    return listItem(await load(id));
  });

  app.post('/help-requests/:id/notes', async (request, reply) => {
    const { id } = parseInput(IdParams, request.params);
    const { body } = parseInput(NoteBody, request.body);
    await load(id);
    const authorId = request.admin?.userId;
    if (!authorId) throw new AppError('UNAUTHORIZED');
    const note = await audit(request).mutate(
      {
        action: 'help_request.note_added',
        entityType: 'help_request',
        entityId: id,
        changedFields: ['notes'],
      },
      (tx) => tx.helpRequestNote.create({ data: { helpRequestId: id, authorId, body } }),
    );
    return reply.code(201).send({ id: note.id, createdAt: note.createdAt.toISOString() });
  });

  /** Active dashboard users, for the "assign to" choice. Emails only. */
  app.get('/team', async () => {
    const users = await db.adminUser.findMany({
      where: { active: true },
      orderBy: { email: 'asc' },
      select: { id: true, email: true },
    });
    return { users };
  });
}
