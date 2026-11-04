import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  TAX_CERTIFICATE_STATUSES,
  type TaxTrackingItem,
  type TaxYearSummary,
} from '@theonetrust/contracts';
import type { Db } from '../../db/client.ts';
import type { Prisma } from '../../generated/prisma/client.ts';
import { AppError } from '../../http/errors.ts';
import { parseInput } from '../../http/validation.ts';
import { csvRow } from '../help/masking.ts';
import { financialYear } from '../receipts/numbering.ts';
import { maskPan, openAddress, openPan } from './identity.ts';
import {
  REMINDER_WINDOW_DAYS,
  daysUntil,
  financialYearRange,
  form113Deadline,
} from './tracking.ts';

const FY = z
  .string()
  .regex(/^\d{4}-\d{2}$/)
  .refine((fy) => (Number(fy.slice(0, 4)) + 1) % 100 === Number(fy.slice(5)), 'fy');
const YearQuery = z.object({ fy: FY.optional() });
const ListQuery = z.object({
  fy: FY.optional(),
  status: z.enum(TAX_CERTIFICATE_STATUSES).optional(),
});
const ExportQuery = z.object({ fy: FY, reason: z.string().trim().min(5).max(400) });
const IdParams = z.object({ id: z.uuid() });
const ref = z.string().trim().min(3).max(80);
const StatusBody = z
  .object({
    status: z.enum(TAX_CERTIFICATE_STATUSES),
    form113Reference: ref.optional(),
    form114Reference: ref.optional(),
    form114IssuedOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    reason: z.string().trim().min(5).max(400),
  })
  .strict();
const BulkBody = z
  .object({ fy: FY, form113Reference: ref, reason: z.string().trim().min(5).max(400) })
  .strict();
const BOM = '﻿';

export interface FilingOptions {
  db: Db;
  encryptionKey?: Buffer | undefined;
  now: () => Date;
}

const rows = {
  donationIntent: {
    include: {
      donorIdentity: true,
      paymentAttempts: { select: { refundedPaise: true } },
    },
  },
} satisfies Prisma.TaxCertificateTrackingInclude;
type TrackingRow = Prisma.TaxCertificateTrackingGetPayload<{ include: typeof rows }>;

const net = (r: TrackingRow) =>
  r.donationIntent.amountPaise -
  r.donationIntent.paymentAttempts.reduce((s, a) => s + a.refundedPaise, 0);

/**
 * Tax & compliance (#35): Form 113 data by financial year, tracking of the statutory
 * certificate status with evidence, and the 31 May reminder. The site never claims to issue
 * Form 114 — it records the reference the trust gets from the e-filing portal.
 */
export async function taxFilingRoutes(app: FastifyInstance, opts: FilingOptions) {
  const { db } = opts;
  const audit = (request: FastifyRequest) => {
    if (!request.audit) throw new AppError('SERVICE_UNAVAILABLE');
    return request.audit;
  };
  const defaultFy = () => {
    // Before 1 June the owner is usually filing for the year that just ended.
    const now = opts.now();
    const current = financialYear(now);
    const month = new Date(now.getTime() + 330 * 60_000).getUTCMonth();
    return month >= 3 && month <= 4
      ? financialYear(new Date(now.getTime() - 70 * 86_400_000))
      : current;
  };

  /** Verified, opt-in donations of the year: the only ones Form 113 is about. */
  async function yearRows(fy: string, status?: string) {
    const { from, to } = financialYearRange(fy);
    return db.taxCertificateTracking.findMany({
      where: {
        financialYear: fy,
        ...(status && { status: status as TrackingRow['status'] }),
        donationIntent: { status: 'PAID', paidAt: { gte: from, lt: to } },
      },
      include: rows,
      orderBy: { createdAt: 'asc' },
    });
  }

  app.get('/tax/summary', async (request): Promise<TaxYearSummary> => {
    const fy = parseInput(YearQuery, request.query).fy ?? defaultFy();
    const all = await yearRows(fy);
    const byStatus = Object.fromEntries(
      TAX_CERTIFICATE_STATUSES.map((s) => [s, 0]),
    ) as TaxYearSummary['byStatus'];
    for (const r of all) byStatus[r.status]++;
    const deadline = form113Deadline(fy);
    const daysLeft = daysUntil(deadline, opts.now());
    return {
      financialYear: fy,
      donations: all.length,
      donors: new Set(
        all.map((r) => r.donationIntent.donorIdentity?.panLast4 + r.donationIntent.donorName),
      ).size,
      totalPaise: all.reduce((s, r) => s + net(r), 0),
      byStatus,
      deadline,
      daysLeft,
      reminder: daysLeft <= REMINDER_WINDOW_DAYS && byStatus.PENDING_TRUST_FILING > 0,
      formatConfirmed: false,
    };
  });

  app.get('/tax/tracking', async (request): Promise<{ items: TaxTrackingItem[] }> => {
    const q = parseInput(ListQuery, request.query);
    const all = await yearRows(q.fy ?? defaultFy(), q.status);
    return {
      items: all.map((r) => ({
        id: r.id,
        donationId: r.donationIntentId,
        reference: r.donationIntent.publicReference,
        paidAt: r.donationIntent.paidAt?.toISOString() ?? null,
        netPaise: net(r),
        donorName: r.donationIntent.donorName,
        panMasked: maskPan(r.donationIntent.donorIdentity?.panLast4 ?? null),
        status: r.status,
        form113Reference: r.form113Reference,
        form114Reference: r.form114Reference,
        form114IssuedOn: r.form114IssuedOn?.toISOString().slice(0, 10) ?? null,
      })),
    };
  });

  /**
   * Form 113 data for one financial year, ONE ROW PER DONOR (PAN): one-time and monthly gifts
   * added up. Contains PAN and address because that is what the statement needs — so it needs a
   * reason, is audited, never cached, and the layout is marked as a draft until the CA confirms.
   */
  app.get('/tax/form113.csv', async (request, reply) => {
    const { fy, reason } = parseInput(ExportQuery, request.query);
    if (!opts.encryptionKey) throw new AppError('SERVICE_UNAVAILABLE');
    const key = opts.encryptionKey;
    const all = await yearRows(fy);
    const donors = new Map<
      string,
      { name: string; address: string; amount: number; count: number; refs: string[] }
    >();
    for (const r of all) {
      const identity = r.donationIntent.donorIdentity;
      if (!identity?.panCiphertext) continue;
      const pan = openPan(identity.panCiphertext, key);
      const entry = donors.get(pan) ?? {
        name: identity.fullName,
        address: identity.addressLine ? openAddress(identity.addressLine, key) : '',
        amount: 0,
        count: 0,
        refs: [],
      };
      entry.amount += net(r);
      entry.count += 1;
      entry.refs.push(r.donationIntent.publicReference);
      donors.set(pan, entry);
    }
    await audit(request).mutate(
      {
        action: 'tax.form113_exported',
        entityType: 'tax_certificate_tracking',
        changedFields: [],
        reason: `${reason} [${fy}: ${donors.size} donors]`,
      },
      async () => undefined,
    );
    const header = [
      'financial_year',
      'pan',
      'donor_name',
      'address',
      'donation_type',
      'mode_of_receipt',
      'amount_inr',
      'donations_count',
      'donation_references',
    ];
    const lines = [...donors.entries()].map(([pan, d]) =>
      csvRow([
        fy,
        pan,
        d.name,
        d.address,
        'Others', // [CONFIRM] corpus vs others, per the CA
        'Electronic modes', // the site takes online payments only
        (d.amount / 100).toFixed(2),
        String(d.count),
        d.refs.join(' '),
      ]),
    );
    reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="form113-draft-${fy}.csv"`)
      .header('cache-control', 'no-store')
      .header('x-format-status', 'draft-unconfirmed');
    return `${BOM}${[csvRow(header), ...lines].join('\r\n')}\r\n`;
  });

  /** One donation's status, with the evidence the status needs (the DB enforces it too). */
  app.post('/tax/tracking/:id/status', async (request) => {
    const { id } = parseInput(IdParams, request.params);
    const body = parseInput(StatusBody, request.body);
    const row = await db.taxCertificateTracking.findUnique({ where: { id } });
    if (!row) throw new AppError('NOT_FOUND');
    const problems: Array<{ path: string; issue: string }> = [];
    const f113 = body.form113Reference ?? row.form113Reference;
    if ((body.status === 'FORM_113_FILED' || body.status === 'FORM_114_ISSUED') && !f113) {
      problems.push({ path: 'form113Reference', issue: 'required' });
    }
    if (body.status === 'FORM_114_ISSUED' && (!body.form114Reference || !body.form114IssuedOn)) {
      problems.push({ path: 'form114Reference', issue: 'required' });
    }
    if (problems.length) throw new AppError('VALIDATION_ERROR', problems);
    const now = opts.now();
    await audit(request).mutate(
      {
        action: 'tax.certificate_status',
        entityType: 'tax_certificate_tracking',
        entityId: id,
        changedFields: [
          'status',
          ...(body.form113Reference ? ['form113Reference'] : []),
          ...(body.form114Reference ? ['form114Reference'] : []),
        ],
        reason: `${row.status}→${body.status}: ${body.reason}`,
      },
      (tx) =>
        tx.taxCertificateTracking.update({
          where: { id },
          data: {
            status: body.status,
            ...(body.form113Reference && {
              form113Reference: body.form113Reference,
              form113FiledAt: now,
            }),
            ...(body.form114Reference && { form114Reference: body.form114Reference }),
            ...(body.form114IssuedOn && {
              form114IssuedOn: new Date(`${body.form114IssuedOn}T00:00:00Z`),
            }),
            notes: body.reason,
          },
        }),
    );
    return { id, status: body.status };
  });

  /** After filing Form 113 for a year: mark every pending donation of that year with its reference. */
  app.post('/tax/form113-filed', async (request) => {
    const body = parseInput(BulkBody, request.body);
    const { from, to } = financialYearRange(body.fy);
    const now = opts.now();
    const result = await audit(request).mutate(
      {
        action: 'tax.form113_filed',
        entityType: 'tax_certificate_tracking',
        changedFields: ['form113Reference', 'status'],
        reason: `${body.fy}: ${body.reason}`,
      },
      (tx) =>
        tx.taxCertificateTracking.updateMany({
          where: {
            financialYear: body.fy,
            status: 'PENDING_TRUST_FILING',
            donationIntent: { status: 'PAID', paidAt: { gte: from, lt: to } },
          },
          data: {
            status: 'FORM_113_FILED',
            form113Reference: body.form113Reference,
            form113FiledAt: now,
            notes: body.reason,
          },
        }),
    );
    return { financialYear: body.fy, updated: result.count };
  });
}
