import { z } from 'zod';
import type { Db } from '../../db/client.ts';
import type { Prisma } from '../../generated/prisma/client.ts';

export const AUDIT_PAGE_MAX = 100;

/** Filters for the owner's audit list. Unknown query parameters are rejected (parseInput). */
export const AuditQuery = z.object({
  action: z
    .string()
    .regex(/^[a-z0-9_.]{1,80}$/)
    .optional(),
  entityType: z
    .string()
    .regex(/^[a-z0-9_]{1,64}$/)
    .optional(),
  entityId: z.string().min(1).max(64).optional(),
  actorId: z.uuid().optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(AUDIT_PAGE_MAX).default(50),
  /** Opaque: "<createdAt ISO>_<id>" of the last row of the previous page. */
  cursor: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z_[0-9a-f-]{36}$/)
    .optional(),
});
export type AuditQuery = z.output<typeof AuditQuery>;

export function encodeCursor(row: { createdAt: Date; id: string }): string {
  return `${row.createdAt.toISOString()}_${row.id}`;
}

function decodeCursor(cursor: string): { createdAt: Date; id: string } {
  const [at = '', id = ''] = cursor.split('_');
  return { createdAt: new Date(at), id };
}

/** Newest first; stable order (created_at, id) so paging never skips or repeats a row. */
export async function listAuditEntries(db: Db, query: AuditQuery) {
  const and: Prisma.AuditLogWhereInput[] = [];
  // `action` matches a whole action or a prefix of dot-segments ("auth" → "auth.*").
  if (query.action) {
    and.push({ OR: [{ action: query.action }, { action: { startsWith: `${query.action}.` } }] });
  }
  if (query.entityType) and.push({ entityType: query.entityType });
  if (query.entityId) and.push({ entityId: query.entityId });
  if (query.actorId) and.push({ actorId: query.actorId });
  if (query.from) and.push({ createdAt: { gte: new Date(query.from) } });
  if (query.to) and.push({ createdAt: { lt: new Date(query.to) } });
  if (query.cursor) {
    const c = decodeCursor(query.cursor);
    and.push({
      OR: [{ createdAt: { lt: c.createdAt } }, { createdAt: c.createdAt, id: { lt: c.id } }],
    });
  }
  const rows = await db.auditLog.findMany({
    where: { AND: and },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: query.limit + 1,
    include: { actor: { select: { email: true } } },
  });
  const page = rows.slice(0, query.limit);
  const last = page.at(-1);
  return {
    items: page.map((row) => ({
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      actorEmail: row.actor?.email ?? null,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      reason: row.reason,
      changedFields: row.changedFields,
      correlationId: row.correlationId,
    })),
    nextCursor: rows.length > query.limit && last ? encodeCursor(last) : null,
  };
}
