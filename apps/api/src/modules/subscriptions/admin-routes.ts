import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type {
  AdminSubscriptionDetail,
  AdminSubscriptionItem,
  AdminSubscriptionList,
} from '@theonetrust/contracts';
import type { Db } from '../../db/client.ts';
import type { Prisma } from '../../generated/prisma/client.ts';
import { AppError } from '../../http/errors.ts';
import { parseInput } from '../../http/validation.ts';
import { ledgerInclude, toLedgerItem } from '../ledger/query.ts';

const STATUSES = [
  'CREATED',
  'AUTHENTICATED',
  'ACTIVE',
  'PAUSED',
  'HALTED',
  'CANCELLED',
  'COMPLETED',
] as const;
const ListQuery = z.object({
  status: z.enum(STATUSES).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});
const IdParams = z.object({ id: z.uuid() });
const PAGE = 25;

const include = {
  charges: { select: { status: true, paidAt: true, createdAt: true } },
  _count: { select: { exceptions: { where: { status: 'OPEN' as const } } } },
} satisfies Prisma.DonationSubscriptionInclude;
type Row = Prisma.DonationSubscriptionGetPayload<{ include: typeof include }>;

function item(row: Row): AdminSubscriptionItem {
  const paidTimes = row.charges.flatMap((c) => (c.paidAt ? [c.paidAt.getTime()] : []));
  const paid = paidTimes;
  const last = [...paidTimes].sort((a, b) => b - a)[0];
  return {
    id: row.id,
    reference: row.publicReference,
    amountPaise: row.amountPaise,
    status: row.status,
    methodRoute: row.methodRoute === 'upi_autopay' ? 'upi_autopay' : 'emandate_card',
    donorName: row.donorName,
    createdAt: row.createdAt.toISOString(),
    charges: row.charges.length,
    paidCharges: paid.length,
    lastChargeAt: last ? new Date(last).toISOString() : null,
    openExceptions: row._count.exceptions,
  };
}

/**
 * `/api/v1/admin/subscriptions` (#33): every monthly gift with its status (as Razorpay last
 * reported it), charges and history. Read-only — status follows webhooks, never the owner.
 */
export async function subscriptionAdminRoutes(app: FastifyInstance, opts: { db: Db }) {
  const { db } = opts;

  app.get('/subscriptions', async (request): Promise<AdminSubscriptionList> => {
    const q = parseInput(ListQuery, request.query);
    const where = q.status ? { status: q.status } : {};
    const [rows, total] = await Promise.all([
      db.donationSubscription.findMany({
        where,
        include,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (q.page - 1) * PAGE,
        take: PAGE,
      }),
      db.donationSubscription.count({ where }),
    ]);
    return { items: rows.map(item), page: q.page, pageSize: PAGE, total };
  });

  app.get('/subscriptions/:id', async (request): Promise<AdminSubscriptionDetail> => {
    const { id } = parseInput(IdParams, request.params);
    const row = await db.donationSubscription.findUnique({ where: { id }, include });
    if (!row) throw new AppError('NOT_FOUND');
    const [history, charges, exceptions] = await Promise.all([
      db.subscriptionStatusEvent.findMany({
        where: { subscriptionId: id },
        orderBy: { createdAt: 'asc' },
      }),
      db.donationIntent.findMany({
        where: { subscriptionId: id },
        include: ledgerInclude,
        orderBy: { createdAt: 'desc' },
        take: 120,
      }),
      db.paymentException.findMany({
        where: { subscriptionId: id },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    return {
      ...item(row),
      history: history.map((h) => ({
        from: h.fromStatus,
        to: h.toStatus,
        source: h.source,
        at: h.createdAt.toISOString(),
      })),
      chargeList: charges.map(toLedgerItem),
      exceptions: exceptions.map((x) => ({
        id: x.id,
        kind: x.kind,
        status: x.status,
        createdAt: x.createdAt.toISOString(),
      })),
    };
  });
}
