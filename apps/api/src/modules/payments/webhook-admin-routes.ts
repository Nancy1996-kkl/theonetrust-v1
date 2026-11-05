import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AdminWebhookItem, AdminWebhookList, WebhookStatusDto } from '@theonetrust/contracts';
import type { Db } from '../../db/client.ts';
import { parseInput } from '../../http/validation.ts';

const STATUSES = ['RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED'] as const;
const Query = z.object({
  status: z.enum(STATUSES).optional(),
  attention: z.enum(['1']).optional(),
});
const LIMIT = 100;

/**
 * `GET /api/v1/admin/webhooks` (#39): the webhook delivery view. Razorpay retries a delivery we
 * answered with an error, and a FAILED event is processed again on that retry; this list shows
 * what arrived, how it was handled and what still needs a look. Read-only, no payloads.
 */
export async function webhookAdminRoutes(
  app: FastifyInstance,
  opts: { db: Db; staleAfterMinutes: number; now: () => Date },
) {
  const { db } = opts;

  app.get('/webhooks', async (request): Promise<AdminWebhookList> => {
    const query = parseInput(Query, request.query);
    const staleBefore = new Date(opts.now().getTime() - opts.staleAfterMinutes * 60_000);
    const attention = {
      processingStatus: { in: ['RECEIVED', 'FAILED'] as WebhookStatusDto[] },
      receivedAt: { lt: staleBefore },
    };
    const [rows, grouped] = await Promise.all([
      db.webhookEvent.findMany({
        where: {
          ...(query.status && { processingStatus: query.status }),
          ...(query.attention && attention),
        },
        include: { donationIntent: { select: { id: true, publicReference: true } } },
        orderBy: [{ receivedAt: 'desc' }, { id: 'asc' }],
        take: LIMIT,
      }),
      db.webhookEvent.groupBy({ by: ['processingStatus'], _count: { _all: true } }),
    ]);
    const counts = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<
      WebhookStatusDto,
      number
    >;
    for (const g of grouped) counts[g.processingStatus] = g._count._all;
    const items: AdminWebhookItem[] = rows.map((r) => ({
      id: r.id,
      eventType: r.eventType,
      status: r.processingStatus,
      note: r.processingError,
      attempts: r.attempts,
      receivedAt: r.receivedAt.toISOString(),
      processedAt: r.processedAt?.toISOString() ?? null,
      needsAttention:
        (r.processingStatus === 'RECEIVED' || r.processingStatus === 'FAILED') &&
        r.receivedAt < staleBefore,
      donation: r.donationIntent
        ? { id: r.donationIntent.id, reference: r.donationIntent.publicReference }
        : null,
    }));
    return { items, counts, staleAfterMinutes: opts.staleAfterMinutes };
  });
}
