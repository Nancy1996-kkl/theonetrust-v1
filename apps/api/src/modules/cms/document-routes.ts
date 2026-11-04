import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  DOCUMENT_FILE_TYPES,
  type AdminDocument,
  type AdminDocumentList,
} from '@theonetrust/contracts';
import type { Db } from '../../db/client.ts';
import type { TransparencyDocument } from '../../generated/prisma/client.ts';
import { AppError } from '../../http/errors.ts';
import { parseInput } from '../../http/validation.ts';
import { toDocument } from '../public-content/mapping.ts';
import { checkUpload, type DocumentStore } from './storage.ts';

const Reason = z.string().trim().min(5).max(400);
const ReasonBody = z.object({ reason: Reason });
const IdParams = z.object({ id: z.uuid() });
const Upload = z.object({
  title: z.string().trim().min(3).max(200),
  locale: z.enum(['ta', 'en']),
  periodLabel: z.string().trim().min(1).max(80).nullable().optional(),
  fileName: z.string().trim().min(1).max(200),
  fileType: z.enum(DOCUMENT_FILE_TYPES),
  dataBase64: z.base64(),
  reason: Reason,
});

export interface DocumentRouteOptions {
  db: Db;
  store?: DocumentStore | undefined;
  maxBytes: number;
  publicBaseUrl?: string | undefined;
  now: () => Date;
}

function view(row: TransparencyDocument, baseUrl: string | undefined): AdminDocument {
  return {
    id: row.id,
    title: row.title,
    locale: row.locale,
    periodLabel: row.periodLabel,
    fileType: row.fileType,
    fileSize: row.fileSize,
    status: row.status,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    uploadedAt: row.uploadedAt.toISOString(),
    publicUrl: row.status === 'PUBLISHED' ? (toDocument(row, baseUrl)?.url ?? null) : null,
  };
}

/**
 * `/api/v1/admin/documents` (#36). Uploads are checked on the server (size, real type from the
 * file's bytes, matching declared type and extension), stored privately under a generated key,
 * and stay DRAFT until the owner publishes them. Removal deletes the file and is audited.
 */
export async function documentAdminRoutes(app: FastifyInstance, opts: DocumentRouteOptions) {
  const { db } = opts;
  // Base64 adds a third; leave room for the JSON around it.
  const bodyLimit = Math.ceil((opts.maxBytes * 4) / 3) + 16_384;

  app.get('/documents', async (): Promise<AdminDocumentList> => {
    const rows = await db.transparencyDocument.findMany({ orderBy: { uploadedAt: 'desc' } });
    return {
      items: rows.map((r) => view(r, opts.publicBaseUrl)),
      maxBytes: opts.maxBytes,
      uploadsEnabled: Boolean(opts.store),
    };
  });

  app.post('/documents', { bodyLimit }, async (request, reply) => {
    const body = parseInput(Upload, request.body);
    if (!opts.store || !request.audit || !request.admin) throw new AppError('SERVICE_UNAVAILABLE');
    const data = Buffer.from(body.dataBase64, 'base64');
    const checked = checkUpload(data, body.fileType, body.fileName, opts.maxBytes);
    if (!checked.ok) {
      if (checked.problem === 'too_large') throw new AppError('PAYLOAD_TOO_LARGE');
      throw new AppError('UNSUPPORTED_MEDIA_TYPE', [{ path: 'file', issue: checked.problem }]);
    }
    const store = opts.store;
    await store.put(checked.key, data);
    const actorId = request.admin.userId;
    try {
      const row = await request.audit.mutate(
        (r: TransparencyDocument) => ({
          action: 'document.upload',
          entityType: 'transparency_document',
          entityId: r.id,
          changedFields: ['fileType', 'locale', 'periodLabel', 'title'],
          reason: body.reason,
        }),
        (tx) =>
          tx.transparencyDocument.create({
            data: {
              title: body.title,
              locale: body.locale,
              periodLabel: body.periodLabel ?? null,
              storageKey: checked.key,
              fileType: checked.type,
              fileSize: data.length,
              sha256: checked.sha256,
              uploadedById: actorId,
            },
          }),
      );
      reply.code(201);
      return view(row, opts.publicBaseUrl);
    } catch (error) {
      // No row, no file: never leave an orphan in storage.
      await store.remove(checked.key);
      throw error;
    }
  });

  async function find(id: string) {
    const row = await db.transparencyDocument.findUnique({ where: { id } });
    if (!row) throw new AppError('NOT_FOUND');
    return row;
  }

  app.post('/documents/:id/publish', async (request) => {
    const { id } = parseInput(IdParams, request.params);
    const { reason } = parseInput(ReasonBody, request.body);
    if (!request.audit || !request.admin) throw new AppError('SERVICE_UNAVAILABLE');
    const row = await find(id);
    if (row.status === 'PUBLISHED') {
      throw new AppError('CONFLICT', [{ path: 'status', issue: 'already_published' }]);
    }
    const actorId = request.admin.userId;
    const updated = await request.audit.mutate(
      {
        action: 'document.publish',
        entityType: 'transparency_document',
        entityId: id,
        changedFields: ['status'],
        reason,
      },
      (tx) =>
        tx.transparencyDocument.update({
          where: { id },
          data: { status: 'PUBLISHED', approvedAt: opts.now(), approvedById: actorId },
        }),
    );
    return view(updated, opts.publicBaseUrl);
  });

  app.post('/documents/:id/unpublish', async (request) => {
    const { id } = parseInput(IdParams, request.params);
    const { reason } = parseInput(ReasonBody, request.body);
    if (!request.audit) throw new AppError('SERVICE_UNAVAILABLE');
    const row = await find(id);
    if (row.status !== 'PUBLISHED') {
      throw new AppError('CONFLICT', [{ path: 'status', issue: 'not_published' }]);
    }
    const updated = await request.audit.mutate(
      {
        action: 'document.unpublish',
        entityType: 'transparency_document',
        entityId: id,
        changedFields: ['status'],
        reason,
      },
      (tx) => tx.transparencyDocument.update({ where: { id }, data: { status: 'ARCHIVED' } }),
    );
    return view(updated, opts.publicBaseUrl);
  });

  /** Removal: the audit entry keeps title, period and file hash; the file itself is deleted. */
  app.delete('/documents/:id', async (request) => {
    const { id } = parseInput(IdParams, request.params);
    const { reason } = parseInput(ReasonBody, request.body);
    if (!request.audit) throw new AppError('SERVICE_UNAVAILABLE');
    const row = await find(id);
    if (row.status === 'PUBLISHED') {
      throw new AppError('CONFLICT', [{ path: 'status', issue: 'unpublish_first' }]);
    }
    await request.audit.mutate(
      {
        action: 'document.remove',
        entityType: 'transparency_document',
        entityId: id,
        changedFields: [],
        reason: `${reason} [${row.title} · ${row.periodLabel ?? '—'} · sha256 ${row.sha256 ?? '—'}]`,
      },
      (tx) => tx.transparencyDocument.delete({ where: { id } }),
    );
    await opts.store?.remove(row.storageKey);
    return { deleted: true };
  });
}

/**
 * Public `/api/v1/documents/:key` (#36): serves a file only while its document is PUBLISHED and
 * approved. Drafts, archived and unknown keys are all 404 — nothing private is reachable.
 */
export async function documentFileRoutes(
  app: FastifyInstance,
  opts: { db?: Db | undefined; store?: DocumentStore | undefined; cacheSeconds: number },
) {
  app.get('/:key', async (request, reply) => {
    const { key } = parseInput(
      z.object({ key: z.string().regex(/^[0-9a-f-]{36}\.(pdf|png|jpg)$/) }),
      request.params,
    );
    if (!opts.db || !opts.store) throw new AppError('NOT_FOUND');
    const row = await opts.db.transparencyDocument.findUnique({ where: { storageKey: key } });
    if (!row || row.status !== 'PUBLISHED' || !row.approvedAt) throw new AppError('NOT_FOUND');
    const data = await opts.store.get(key);
    if (!data) throw new AppError('NOT_FOUND');
    return reply
      .header('content-type', row.fileType)
      .header('x-content-type-options', 'nosniff')
      .header('content-disposition', `inline; filename="${key}"`)
      .header('cache-control', `public, max-age=${opts.cacheSeconds}`)
      .send(data);
  });
}
