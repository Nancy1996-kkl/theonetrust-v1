import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  type AdminReceiptItem,
  type AdminReceiptList,
  type DonationDetail,
  type ExceptionQueue,
  type ExceptionQueueItem,
} from '@theonetrust/contracts';
import type { Db } from '../../db/client.ts';
import type { Receipt } from '../../generated/prisma/client.ts';
import { AppError } from '../../http/errors.ts';
import { parseInput } from '../../http/validation.ts';
import { PaymentProviderError, type PaymentProvider } from '../donations/provider.ts';
import { csvRow, maskPhone, maskText } from '../help/masking.ts';
import { applyProviderPayment } from '../payments/reconcile.ts';
import { shareTokenFor } from '../receipts/issue.ts';
import {
  LedgerQuery,
  currentOf,
  istStamp,
  ledgerInclude,
  ledgerOrder,
  ledgerWhere,
  listLedger,
  maskEmail,
  overview,
  receiptState,
  staleWhere,
  toLedgerItem,
} from './query.ts';

const IdParams = z.object({ id: z.uuid() });
const ReasonBody = z.object({ reason: z.string().trim().min(5).max(400) });
const PageQuery = z.object({ page: z.coerce.number().int().min(1).max(10_000).default(1) });
const EXPORT_LIMIT = 5_000;
const BOM = '﻿';

export interface LedgerAdminOptions {
  db: Db;
  provider?: PaymentProvider | undefined;
  receiptKey?: Buffer | undefined;
  staleAfterMinutes: number;
  now: () => Date;
}

const rupees = (paise: number) => (paise / 100).toFixed(2);

/**
 * Owner ledger (#31): overview, donations (search, filters, allow-listed sort, pagination),
 * one donation's full history, the exceptions queue, receipts and a masked IST CSV export.
 * Nothing here edits an amount or sets a status by hand: the only actions are an audited
 * re-check with Razorpay (the normal reconcile rules apply), resolving an exception with a
 * reason, and re-sending an acknowledgement email.
 */
export async function ledgerAdminRoutes(app: FastifyInstance, opts: LedgerAdminOptions) {
  const { db } = opts;
  const audit = (request: FastifyRequest) => {
    if (!request.audit) throw new AppError('SERVICE_UNAVAILABLE');
    return request.audit;
  };

  async function receiptItem(
    r: Receipt,
    intent: {
      id: string;
      publicReference: string;
      donorEmail: string | null;
      wantsReceipt: boolean;
      status: string;
    },
    lastEmail: AdminReceiptItem['lastEmail'],
  ): Promise<AdminReceiptItem> {
    return {
      id: r.id,
      receiptNumber: r.receiptNumber,
      donationId: intent.id,
      reference: intent.publicReference,
      amountPaise: r.amountPaise,
      issuedAt: r.issuedAt.toISOString(),
      state: receiptState(r),
      token: opts.receiptKey ? await shareTokenFor(db, r, opts.receiptKey) : null,
      canResend:
        !r.voidedAt &&
        intent.status === 'PAID' &&
        intent.wantsReceipt &&
        Boolean(intent.donorEmail),
      lastEmail,
    };
  }

  app.get('/overview', async () => overview(db, opts.now(), opts.staleAfterMinutes));

  app.get('/donations', async (request) => listLedger(db, parseInput(LedgerQuery, request.query)));

  app.get('/donations/export.csv', async (request, reply) => {
    const q = parseInput(LedgerQuery, request.query);
    const rows = await db.donationIntent.findMany({
      where: ledgerWhere(q),
      orderBy: ledgerOrder(q.sort),
      include: ledgerInclude,
      take: EXPORT_LIMIT,
    });
    await audit(request).mutate(
      {
        action: 'donations.exported',
        entityType: 'donation_intent',
        changedFields: Object.entries(q)
          .filter(([key, value]) => value !== undefined && key !== 'page' && key !== 'sort')
          .map(([key]) => key)
          .sort(),
        reason: `${rows.length} rows`,
      },
      async () => undefined,
    );
    const header = [
      'reference',
      'created_ist',
      'paid_ist',
      'status',
      'channel',
      'method',
      'programme',
      'gift_inr',
      'fee_inr',
      'amount_inr',
      'refunded_inr',
      'receipt_number',
      'receipt_state',
      'donor_masked',
      'email_masked',
      'phone_masked',
    ];
    const lines = rows.map((row) => {
      const item = toLedgerItem(row);
      return csvRow([
        item.reference,
        istStamp(row.createdAt),
        istStamp(row.paidAt),
        item.status,
        item.channel,
        item.method ?? '',
        item.programme?.en ?? 'General fund',
        rupees(row.giftPaise),
        rupees(row.feePaise),
        rupees(row.amountPaise),
        rupees(item.refundedPaise),
        item.receipt?.number ?? '',
        item.receipt?.state ?? '',
        maskText(row.donorName),
        maskEmail(row.donorEmail) ?? '',
        row.donorPhone ? maskPhone(row.donorPhone) : '',
      ]);
    });
    reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', 'attachment; filename="donations.csv"')
      .header('cache-control', 'no-store');
    return `${BOM}${[csvRow(header), ...lines].join('\r\n')}\r\n`;
  });

  app.get('/donations/:id', async (request): Promise<DonationDetail> => {
    const { id } = parseInput(IdParams, request.params);
    const row = await db.donationIntent.findUnique({
      where: { id },
      include: {
        ...ledgerInclude,
        statusEvents: { orderBy: { createdAt: 'asc' } },
        webhookEvents: { orderBy: { receivedAt: 'asc' } },
        bankTransfers: { orderBy: { createdAt: 'asc' } },
        exceptions: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!row) throw new AppError('NOT_FOUND');
    const notifications = await db.notificationOutbox.findMany({
      where: { entityRef: `donation_intent:${id}` },
      orderBy: { createdAt: 'asc' },
    });
    const donorEmails = notifications.filter((n) => n.template === 'donor_donation_paid');
    const last = donorEmails.at(-1);
    return {
      ...toLedgerItem(row),
      giftPaise: row.giftPaise,
      feePaise: row.feePaise,
      locale: row.locale,
      donorEmailMasked: maskEmail(row.donorEmail),
      donorPhoneMasked: row.donorPhone ? maskPhone(row.donorPhone) : null,
      wantsReceipt: row.wantsReceipt,
      hideNamePublicly: row.hideNamePublicly,
      attempts: row.paymentAttempts.map((a) => ({
        providerOrderId: a.providerOrderId,
        providerPaymentId: a.providerPaymentId,
        providerStatus: a.providerStatus,
        amountPaise: a.amountPaise,
        capturedPaise: a.capturedPaise,
        refundedPaise: a.refundedPaise,
        method: a.method,
        signatureVerified: a.signatureVerifiedAt !== null,
        createdAt: a.createdAt.toISOString(),
      })),
      statusHistory: row.statusEvents.map((e) => ({
        from: e.fromStatus,
        to: e.toStatus,
        source: e.source,
        at: e.createdAt.toISOString(),
      })),
      webhooks: row.webhookEvents.map((w) => ({
        eventType: w.eventType,
        processingStatus: w.processingStatus,
        processingError: w.processingError,
        attempts: w.attempts,
        receivedAt: w.receivedAt.toISOString(),
      })),
      bankTransfers: row.bankTransfers.map((b) => ({
        bankReference: b.bankReference,
        amountPaise: b.amountPaise,
        receivedOn: b.receivedOn.toISOString().slice(0, 10),
        status: b.status,
      })),
      receipts: await Promise.all(
        row.receipts.map((r) =>
          receiptItem(
            r,
            row,
            last ? { status: last.status, sentAt: last.sentAt?.toISOString() ?? null } : null,
          ),
        ),
      ),
      notifications: notifications.map((n) => ({
        id: n.id,
        template: n.template,
        status: n.status,
        lastError: n.lastError,
        attempts: n.retryCount,
        sentAt: n.sentAt?.toISOString() ?? null,
      })),
      exceptions: row.exceptions.map((x) => ({
        id: x.id,
        kind: x.kind,
        status: x.status,
        createdAt: x.createdAt.toISOString(),
        resolution: x.resolution,
      })),
    };
  });

  /**
   * Re-check with Razorpay (with our secret), exactly like the donor's status re-check: the
   * shared reconcile rules decide. The owner cannot pick a status.
   */
  app.post('/donations/:id/recheck', async (request) => {
    const { id } = parseInput(IdParams, request.params);
    const { reason } = parseInput(ReasonBody, request.body);
    if (!opts.provider) throw new AppError('SERVICE_UNAVAILABLE');
    const intent = await db.donationIntent.findUnique({
      where: { id },
      include: { paymentAttempts: { orderBy: { createdAt: 'desc' } } },
    });
    const attempt = intent?.paymentAttempts[0];
    if (!intent || intent.channel !== 'CHECKOUT' || !attempt) throw new AppError('NOT_FOUND');
    let status = intent.status;
    let outcome = 'no_payment_found';
    try {
      const payments = attempt.providerPaymentId
        ? [await opts.provider.fetchPayment(attempt.providerPaymentId)]
        : await opts.provider.fetchOrderPayments(attempt.providerOrderId);
      const best =
        payments.find((p) => p.status === 'captured') ??
        payments.find((p) => p.status === 'authorized') ??
        payments[0];
      if (best) {
        status = await applyProviderPayment(db, attempt.id, best, opts.now());
        outcome = `provider_${best.status}`;
      }
    } catch (error) {
      outcome =
        error instanceof PaymentProviderError ? `provider_${error.reason}` : 'provider_error';
    }
    await audit(request).mutate(
      {
        action: 'donation.rechecked',
        entityType: 'donation_intent',
        entityId: id,
        changedFields: status !== intent.status ? ['status'] : [],
        reason: `${reason} [${outcome}]`,
      },
      async () => undefined,
    );
    return { id, status, outcome };
  });

  app.get('/exceptions', async (): Promise<ExceptionQueue> => {
    const now = opts.now();
    const [open, stale, review, refunds] = await Promise.all([
      db.paymentException.findMany({
        where: { status: 'OPEN' },
        orderBy: { createdAt: 'desc' },
        take: 200,
        include: {
          donationIntent: { select: { id: true, publicReference: true, amountPaise: true } },
          bankTransferRecord: { select: { amountPaise: true } },
        },
      }),
      db.donationIntent.findMany({
        where: staleWhere(now, opts.staleAfterMinutes),
        orderBy: { createdAt: 'asc' },
        take: 200,
      }),
      db.donationIntent.findMany({
        where: { status: 'MANUAL_REVIEW' },
        orderBy: { createdAt: 'asc' },
        take: 200,
      }),
      db.donationIntent.findMany({
        where: { status: 'REFUND_PENDING' },
        orderBy: { createdAt: 'asc' },
        take: 200,
      }),
    ]);
    const fromIntent = (
      kind: ExceptionQueueItem['kind'],
      d: {
        id: string;
        publicReference: string;
        amountPaise: number;
        createdAt: Date;
        channel: string;
      },
    ): ExceptionQueueItem => ({
      key: `${kind}:${d.id}`,
      kind,
      exceptionId: null,
      donationId: d.id,
      reference: d.publicReference,
      amountPaise: d.amountPaise,
      providerPaymentId: null,
      createdAt: d.createdAt.toISOString(),
      actions: d.channel === 'CHECKOUT' && opts.provider ? ['recheck'] : [],
    });
    const items: ExceptionQueueItem[] = [
      ...open.map((x) => ({
        key: `exception:${x.id}`,
        kind: x.kind,
        exceptionId: x.id,
        donationId: x.donationIntent?.id ?? null,
        reference: x.donationIntent?.publicReference ?? null,
        amountPaise: x.donationIntent?.amountPaise ?? x.bankTransferRecord?.amountPaise ?? null,
        providerPaymentId: x.providerPaymentId,
        createdAt: x.createdAt.toISOString(),
        actions: ['resolve'] as Array<'recheck' | 'resolve'>,
      })),
      ...stale.map((d) => fromIntent('STALE_PENDING', d)),
      ...review.map((d) => fromIntent('MANUAL_REVIEW', d)),
      ...refunds.map((d) => fromIntent('REFUND_PENDING', { ...d, channel: 'NONE' })),
    ];
    return { items, staleAfterMinutes: opts.staleAfterMinutes };
  });

  app.get('/receipts', async (request): Promise<AdminReceiptList> => {
    const { page } = parseInput(PageQuery, request.query);
    const pageSize = 25;
    const [rows, total] = await Promise.all([
      db.receipt.findMany({
        orderBy: { issuedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          donationIntent: {
            select: {
              id: true,
              publicReference: true,
              donorEmail: true,
              wantsReceipt: true,
              status: true,
            },
          },
        },
      }),
      db.receipt.count(),
    ]);
    const refs = rows.map((r) => `donation_intent:${r.donationIntentId}`);
    const emails = await db.notificationOutbox.findMany({
      where: { entityRef: { in: refs }, template: 'donor_donation_paid' },
      orderBy: { createdAt: 'asc' },
    });
    const lastFor = new Map(emails.map((e) => [e.entityRef, e]));
    const items = await Promise.all(
      rows.map((r) => {
        const e = lastFor.get(`donation_intent:${r.donationIntentId}`);
        return receiptItem(
          r,
          r.donationIntent,
          e ? { status: e.status, sentAt: e.sentAt?.toISOString() ?? null } : null,
        );
      }),
    );
    return { items, page, pageSize, total };
  });

  /** Queues the donor's acknowledgement email again (only when they gave consent). */
  app.post('/receipts/:id/resend', async (request) => {
    const { id } = parseInput(IdParams, request.params);
    const { reason } = parseInput(ReasonBody, request.body);
    const receipt = await db.receipt.findUnique({
      where: { id },
      include: { donationIntent: { include: { receipts: true } } },
    });
    if (!receipt) throw new AppError('NOT_FOUND');
    const intent = receipt.donationIntent;
    const current = currentOf(intent.receipts);
    if (
      current?.id !== receipt.id ||
      receipt.voidedAt ||
      intent.status !== 'PAID' ||
      !intent.wantsReceipt ||
      !intent.donorEmail
    ) {
      throw new AppError('CONFLICT');
    }
    const now = opts.now();
    await audit(request).mutate(
      {
        action: 'receipt.resent',
        entityType: 'receipt',
        entityId: id,
        changedFields: [],
        reason,
      },
      (tx) =>
        tx.notificationOutbox.create({
          data: {
            eventType: 'receipt.resend',
            entityRef: `donation_intent:${intent.id}`,
            template: 'donor_donation_paid',
            locale: intent.locale,
            dedupeKey: `receipt.resend:${id}:${now.getTime()}`,
          },
        }),
    );
    return { id, queued: true };
  });

  // The existing payment-exception resolve route (#25) is the "resolve" action: reason + audit.
}
