import { z } from 'zod';
import {
  DONATION_STATUSES,
  LEDGER_PAGE_SIZE,
  LEDGER_RECEIPT_FILTERS,
  LEDGER_SORTS,
  RECEIPT_METHODS,
  type AdminOverview,
  type LedgerItem,
  type OverviewTotals,
  type ReceiptMethod,
  type ReceiptState,
} from '@theonetrust/contracts';
import type { Db } from '../../db/client.ts';
import type { Prisma, Receipt } from '../../generated/prisma/client.ts';

const IST_OFFSET_MS = 330 * 60_000;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const LedgerQuery = z.object({
  q: z
    .string()
    .trim()
    .max(64)
    .regex(/^[A-Za-z0-9_-]*$/)
    .optional(),
  from: z.string().regex(DAY).optional(),
  to: z.string().regex(DAY).optional(),
  programme: z
    .string()
    .regex(/^[a-z0-9-]{1,40}$/)
    .optional(),
  status: z.enum(DONATION_STATUSES).optional(),
  method: z.enum(RECEIPT_METHODS).optional(),
  receipt: z.enum(LEDGER_RECEIPT_FILTERS).optional(),
  // Sorting is limited to this allow-list (issue #31).
  sort: z.enum(LEDGER_SORTS).default('created_desc'),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});
export type LedgerQueryInput = z.infer<typeof LedgerQuery>;

/** Start of an IST calendar day as a UTC instant. */
export function istDayStart(day: string): Date {
  return new Date(Date.parse(`${day}T00:00:00Z`) - IST_OFFSET_MS);
}

/** "2026-11-04 15:30" in IST, for CSV and labels. */
export function istStamp(at: Date | null): string {
  if (!at) return '';
  return new Date(at.getTime() + IST_OFFSET_MS).toISOString().slice(0, 16).replace('T', ' ');
}

function istToday(now: Date): string {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** "donor@example.org" → "d•••@example.org". */
export function maskEmail(email: string | null): string | null {
  if (!email) return null;
  const [user = '', domain = ''] = email.split('@');
  return `${[...user][0] ?? ''}•••@${domain}`;
}

export function ledgerWhere(q: LedgerQueryInput): Prisma.DonationIntentWhereInput {
  const and: Prisma.DonationIntentWhereInput[] = [];
  if (q.q) {
    const upper = q.q.toUpperCase();
    and.push({
      OR: [
        { publicReference: upper },
        { receipts: { some: { receiptNumber: upper } } },
        {
          paymentAttempts: { some: { OR: [{ providerOrderId: q.q }, { providerPaymentId: q.q }] } },
        },
        { bankTransfers: { some: { bankReference: upper } } },
      ],
    });
  }
  if (q.from) and.push({ createdAt: { gte: istDayStart(q.from) } });
  if (q.to) and.push({ createdAt: { lt: new Date(istDayStart(q.to).getTime() + 86_400_000) } });
  if (q.programme) {
    and.push(
      q.programme === 'general' ? { programmeId: null } : { programme: { slug: q.programme } },
    );
  }
  if (q.status) and.push({ status: q.status });
  if (q.method) {
    and.push(
      q.method === 'bank_transfer'
        ? { channel: 'BANK_TRANSFER' }
        : q.method === 'other'
          ? {
              channel: 'CHECKOUT',
              paymentAttempts: {
                some: { method: { notIn: RECEIPT_METHODS.filter((m) => m !== 'other') } },
              },
            }
          : { channel: 'CHECKOUT', paymentAttempts: { some: { method: q.method } } },
    );
  }
  if (q.receipt === 'none') and.push({ receipts: { none: {} } });
  if (q.receipt === 'valid') and.push({ receipts: { some: { voidedAt: null } } });
  if (q.receipt === 'refunded') and.push({ receipts: { some: { voidReason: 'REFUNDED' } } });
  if (q.receipt === 'replaced') and.push({ receipts: { some: { voidReason: 'CORRECTED' } } });
  return and.length ? { AND: and } : {};
}

export function ledgerOrder(
  sort: LedgerQueryInput['sort'],
): Prisma.DonationIntentOrderByWithRelationInput[] {
  switch (sort) {
    case 'created_asc':
      return [{ createdAt: 'asc' }, { id: 'asc' }];
    case 'amount_desc':
      return [{ amountPaise: 'desc' }, { createdAt: 'desc' }];
    case 'amount_asc':
      return [{ amountPaise: 'asc' }, { createdAt: 'desc' }];
    default:
      return [{ createdAt: 'desc' }, { id: 'desc' }];
  }
}

export const ledgerInclude = {
  programme: { select: { titleEn: true, titleTa: true } },
  paymentAttempts: { orderBy: { createdAt: 'desc' as const } },
  receipts: { orderBy: { issuedAt: 'asc' as const } },
} satisfies Prisma.DonationIntentInclude;

type LedgerRow = Prisma.DonationIntentGetPayload<{ include: typeof ledgerInclude }>;

export function receiptState(r: Pick<Receipt, 'voidReason'>): ReceiptState {
  return r.voidReason === 'REFUNDED'
    ? 'REFUNDED'
    : r.voidReason === 'CORRECTED'
      ? 'REPLACED'
      : 'VALID';
}

/** Newest receipt of the chain (the one nothing replaces), from an intent's receipt list. */
export function currentOf(receipts: Receipt[]): Receipt | null {
  const replaced = new Set(receipts.map((r) => r.replacesId).filter(Boolean));
  const tails = receipts.filter((r) => !replaced.has(r.id));
  return tails.find((r) => !r.voidedAt) ?? tails.at(-1) ?? null;
}

export function methodOf(
  row: Pick<LedgerRow, 'channel' | 'paymentAttempts'>,
): ReceiptMethod | null {
  if (row.channel === 'BANK_TRANSFER') return 'bank_transfer';
  const raw = row.paymentAttempts.find((a) => a.method)?.method;
  if (!raw) return null;
  return (RECEIPT_METHODS as readonly string[]).includes(raw) ? (raw as ReceiptMethod) : 'other';
}

export function toLedgerItem(row: LedgerRow): LedgerItem {
  const receipt = currentOf(row.receipts);
  return {
    id: row.id,
    reference: row.publicReference,
    createdAt: row.createdAt.toISOString(),
    paidAt: row.paidAt?.toISOString() ?? null,
    amountPaise: row.amountPaise,
    refundedPaise: row.paymentAttempts.reduce((sum, a) => sum + a.refundedPaise, 0),
    status: row.status,
    channel: row.channel,
    method: methodOf(row),
    programme: row.programme ? { en: row.programme.titleEn, ta: row.programme.titleTa } : null,
    donorName: row.donorName,
    receipt: receipt ? { number: receipt.receiptNumber, state: receiptState(receipt) } : null,
  };
}

export async function listLedger(db: Db, q: LedgerQueryInput, pageSize = LEDGER_PAGE_SIZE) {
  const where = ledgerWhere(q);
  const [rows, total] = await Promise.all([
    db.donationIntent.findMany({
      where,
      orderBy: ledgerOrder(q.sort),
      include: ledgerInclude,
      skip: (q.page - 1) * pageSize,
      take: pageSize,
    }),
    db.donationIntent.count({ where }),
  ]);
  return { items: rows.map(toLedgerItem), page: q.page, pageSize, total };
}

const VERIFIED = ['PAID', 'REFUND_PENDING', 'REFUNDED'] as const;

async function totals(db: Db, since: Date | null): Promise<OverviewTotals> {
  const where: Prisma.DonationIntentWhereInput = {
    status: { in: [...VERIFIED] },
    paidAt: since ? { gte: since } : { not: null },
  };
  const [gross, refunded] = await Promise.all([
    db.donationIntent.aggregate({ where, _sum: { amountPaise: true }, _count: { _all: true } }),
    db.paymentAttempt.aggregate({
      where: { donationIntent: where },
      _sum: { refundedPaise: true },
    }),
  ]);
  const grossPaise = gross._sum.amountPaise ?? 0;
  const refundedPaise = refunded._sum.refundedPaise ?? 0;
  return {
    grossPaise,
    refundedPaise,
    netPaise: grossPaise - refundedPaise,
    count: gross._count._all,
  };
}

/** Verified totals (by the time the payment was verified, IST) and what needs attention. */
export async function overview(db: Db, now: Date, staleMinutes: number): Promise<AdminOverview> {
  const today = istToday(now);
  const [
    todayTotals,
    monthTotals,
    lifetime,
    pending,
    failed,
    refunds,
    refundSum,
    openExceptions,
    stale,
    manual,
  ] = await Promise.all([
    totals(db, istDayStart(today)),
    totals(db, istDayStart(`${today.slice(0, 8)}01`)),
    totals(db, null),
    db.donationIntent.aggregate({
      where: { status: { in: ['CREATED', 'PENDING', 'AUTHORIZED'] } },
      _sum: { amountPaise: true },
      _count: { _all: true },
    }),
    db.donationIntent.count({ where: { status: 'FAILED' } }),
    db.donationIntent.count({ where: { status: { in: ['REFUND_PENDING', 'REFUNDED'] } } }),
    db.paymentAttempt.aggregate({ _sum: { refundedPaise: true } }),
    db.paymentException.count({ where: { status: 'OPEN' } }),
    db.donationIntent.count({ where: staleWhere(now, staleMinutes) }),
    db.donationIntent.count({ where: { status: 'MANUAL_REVIEW' } }),
  ]);
  return {
    today: todayTotals,
    month: monthTotals,
    lifetime,
    pending: { count: pending._count._all, amountPaise: pending._sum.amountPaise ?? 0 },
    failed: { count: failed },
    refunds: { count: refunds, amountPaise: refundSum._sum.refundedPaise ?? 0 },
    openExceptions,
    stalePending: stale,
    manualReview: manual,
  };
}

/** Checkout donations still unsettled after `minutes`: the callback or webhook never came. */
export function staleWhere(now: Date, minutes: number): Prisma.DonationIntentWhereInput {
  return {
    channel: 'CHECKOUT',
    status: { in: ['PENDING', 'AUTHORIZED'] },
    createdAt: { lt: new Date(now.getTime() - minutes * 60_000) },
  };
}
