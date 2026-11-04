import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  NOTIFICATION_STATUSES,
  NOTIFICATION_TEMPLATES,
  type NotificationDto,
  type NotificationListResponse,
  type NotificationTemplate,
} from '@theonetrust/contracts';
import type { Db } from '../../db/client.ts';
import { AppError } from '../../http/errors.ts';
import { parseInput } from '../../http/validation.ts';

const ListQuery = z.object({ status: z.enum(NOTIFICATION_STATUSES).optional() });
const IdParams = z.object({ id: z.uuid() });

/**
 * `/api/v1/admin/notifications` (#30): delivery status for the owner — what was queued, sent,
 * is being retried or failed, with a short error code. No addresses and no message bodies.
 * A FAILED or CANCELLED email can be queued again (audited).
 */
export async function notificationAdminRoutes(
  app: FastifyInstance,
  opts: { db: Db; sendingEnabled: boolean },
) {
  const { db } = opts;

  app.get('/notifications', async (request): Promise<NotificationListResponse> => {
    const { status } = parseInput(ListQuery, request.query);
    const [rows, grouped] = await Promise.all([
      db.notificationOutbox.findMany({
        where: status ? { status } : {},
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      db.notificationOutbox.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);
    const ids = (kind: string) =>
      rows
        .filter((r) => r.entityRef.startsWith(`${kind}:`))
        .map((r) => r.entityRef.slice(kind.length + 1));
    const [donations, helps] = await Promise.all([
      db.donationIntent.findMany({
        where: { id: { in: ids('donation_intent') } },
        select: { id: true, publicReference: true },
      }),
      db.helpRequest.findMany({
        where: { id: { in: ids('help_request') } },
        select: { id: true, reference: true },
      }),
    ]);
    const refs = new Map<string, string>([
      ...donations.map((d) => [`donation_intent:${d.id}`, d.publicReference] as const),
      ...helps.map((h) => [`help_request:${h.id}`, h.reference] as const),
    ]);
    const counts = Object.fromEntries(
      NOTIFICATION_STATUSES.map((s) => [s, 0]),
    ) as NotificationListResponse['counts'];
    for (const g of grouped) counts[g.status] = g._count._all;
    const items: NotificationDto[] = rows.map((r) => ({
      id: r.id,
      template: (NOTIFICATION_TEMPLATES as readonly string[]).includes(r.template)
        ? (r.template as NotificationTemplate)
        : 'other',
      audience: r.template.startsWith('donor_') ? 'donor' : 'owner',
      status: r.status,
      reference: refs.get(r.entityRef) ?? null,
      attempts: r.retryCount,
      lastError: r.lastError,
      createdAt: r.createdAt.toISOString(),
      nextAttemptAt: r.status === 'PENDING' ? r.nextAttemptAt.toISOString() : null,
      sentAt: r.sentAt?.toISOString() ?? null,
    }));
    return { items, counts, sendingEnabled: opts.sendingEnabled };
  });

  app.post('/notifications/:id/retry', async (request) => {
    const { id } = parseInput(IdParams, request.params);
    if (!request.audit) throw new AppError('SERVICE_UNAVAILABLE');
    const row = await db.notificationOutbox.findUnique({ where: { id } });
    if (!row) throw new AppError('NOT_FOUND');
    if (row.status !== 'FAILED' && row.status !== 'CANCELLED') throw new AppError('CONFLICT');
    await request.audit.mutate(
      {
        action: 'notification.retry',
        entityType: 'notification',
        entityId: id,
        changedFields: ['status'],
      },
      async (tx) => {
        const updated = await tx.notificationOutbox.updateMany({
          where: { id, status: row.status },
          data: { status: 'PENDING', retryCount: 0, nextAttemptAt: new Date(), failedAt: null },
        });
        if (updated.count !== 1) throw new AppError('CONFLICT');
      },
    );
    return { id, status: 'PENDING' };
  });
}
