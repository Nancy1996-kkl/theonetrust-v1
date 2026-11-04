import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Db } from '../../db/client.ts';
import { AppError } from '../../http/errors.ts';
import { parseInput } from '../../http/validation.ts';
import { enqueueDonationPaid } from '../notifications/outbox.ts';
import { issueReceiptIfEligible } from '../receipts/issue.ts';
import { transitionDonation } from './transitions.ts';

const reference = z.string().regex(/^TOT-D-[0-9A-HJKMNP-TV-Z]{12}$/);
const bankRef = z
  .string()
  .trim()
  .transform((v) => v.replace(/\s/g, '').toUpperCase())
  .pipe(z.string().regex(/^[A-Z0-9]{6,30}$/));
const reason = z.string().trim().min(5).max(500);

const CreditBody = z.object({
  bankReference: bankRef,
  amountPaise: z.number().int().min(100),
  receivedOn: z.iso.date(),
  /** Where it was seen — statement name, date, line. No account numbers needed. */
  evidence: z.string().trim().min(3).max(300),
  donationReference: reference.optional(),
});
const ConfirmBody = z.object({
  reason,
  /** Second confirmation: the owner types the donation reference again. */
  confirmReference: reference,
});
const ReasonBody = z.object({ reason });
const IdParams = z.object({ id: z.uuid() });

/**
 * Bank transfers (#25, plan §17): the owner records a credit from the trust's statement; it is
 * matched to a donation by reference or by the donor's UTR. Anything that does not match exactly
 * becomes an exception. Only a second, explicit confirmation with a reason marks it PAID.
 * Donor-supplied UTRs or screenshots never change a status. Every step is audited.
 */
export async function bankAdminRoutes(app: FastifyInstance, opts: { db: Db }) {
  const { db } = opts;
  const audit = (request: FastifyRequest) => {
    if (!request.audit || !request.admin) throw new AppError('SERVICE_UNAVAILABLE');
    return { audit: request.audit, adminId: request.admin.userId };
  };

  app.get('/bank-transfers', async () => {
    const [credits, awaiting, exceptions] = await Promise.all([
      db.bankTransferRecord.findMany({
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: {
          donationIntent: { select: { publicReference: true, amountPaise: true, status: true } },
        },
      }),
      db.donationIntent.findMany({
        where: {
          channel: 'BANK_TRANSFER',
          status: { in: ['CREATED', 'PENDING', 'MANUAL_REVIEW'] },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: { bankClaims: { orderBy: { createdAt: 'desc' }, take: 1 } },
      }),
      db.paymentException.findMany({
        where: { status: 'OPEN' },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ]);
    return {
      credits: credits.map((c) => ({
        id: c.id,
        bankReference: c.bankReference,
        amountPaise: c.amountPaise,
        receivedOn: c.receivedOn.toISOString().slice(0, 10),
        evidence: c.evidence,
        status: c.status,
        donationReference: c.donationIntent?.publicReference ?? null,
        createdAt: c.createdAt.toISOString(),
      })),
      awaiting: awaiting.map((i) => ({
        publicReference: i.publicReference,
        amountPaise: i.amountPaise,
        status: i.status,
        donorUtr: i.bankClaims[0]?.utr ?? null,
        createdAt: i.createdAt.toISOString(),
      })),
      exceptions: exceptions.map((e) => ({
        id: e.id,
        kind: e.kind,
        bankTransferRecordId: e.bankTransferRecordId,
        createdAt: e.createdAt.toISOString(),
      })),
    };
  });

  app.post('/bank-transfers/credits', async (request, reply) => {
    const body = parseInput(CreditBody, request.body);
    const { audit, adminId } = audit_(request);
    if (await db.bankTransferRecord.findUnique({ where: { bankReference: body.bankReference } })) {
      throw new AppError('CONFLICT');
    }
    // Match by the reference the owner typed, else by a donor's claimed UTR.
    const intent = body.donationReference
      ? await db.donationIntent.findUnique({ where: { publicReference: body.donationReference } })
      : ((
          await db.bankTransferClaim.findFirst({
            where: { utr: body.bankReference },
            include: { donationIntent: true },
            orderBy: { createdAt: 'desc' },
          })
        )?.donationIntent ?? null);
    const problem =
      !intent || intent.channel !== 'BANK_TRANSFER'
        ? 'UNMATCHED_CREDIT'
        : intent.status === 'PAID'
          ? 'ALREADY_PAID'
          : intent.amountPaise !== body.amountPaise
            ? 'AMOUNT_MISMATCH'
            : null;

    const result = await audit.mutate(
      (r: { id: string; exception: string | null }) => ({
        action: problem ? 'bank_transfer.credit_unmatched' : 'bank_transfer.credit_recorded',
        entityType: 'bank_transfer_record',
        entityId: r.id,
        changedFields: problem ? ['exception'] : ['donation_intent_id'],
        reason: problem,
      }),
      async (tx) => {
        const credit = await tx.bankTransferRecord.create({
          data: {
            bankReference: body.bankReference,
            amountPaise: body.amountPaise,
            receivedOn: new Date(`${body.receivedOn}T00:00:00Z`),
            evidence: body.evidence,
            recordedById: adminId,
            donationIntentId: problem ? null : (intent?.id ?? null),
          },
        });
        let exception: string | null = null;
        if (problem) {
          const created = await tx.paymentException.create({
            data: {
              kind: problem,
              bankTransferRecordId: credit.id,
              donationIntentId: problem === 'UNMATCHED_CREDIT' ? null : (intent?.id ?? null),
            },
          });
          exception = created.id;
          if (problem === 'AMOUNT_MISMATCH' && intent) {
            await transitionDonation(tx, intent.id, 'MANUAL_REVIEW', 'owner_review');
          }
        }
        return { id: credit.id, exception };
      },
    );
    return reply.code(201).send({
      id: result.id,
      matched: problem === null,
      awaitingConfirmation: problem === null,
      exception: problem ? { id: result.exception, kind: problem } : null,
    });
  });

  app.post('/bank-transfers/credits/:id/confirm', async (request) => {
    const { id } = parseInput(IdParams, request.params);
    const body = parseInput(ConfirmBody, request.body);
    const { audit, adminId } = audit_(request);
    const credit = await db.bankTransferRecord.findUnique({
      where: { id },
      include: { donationIntent: true },
    });
    if (!credit) throw new AppError('NOT_FOUND');
    const intent = credit.donationIntent;
    if (credit.status !== 'REPORTED' || !intent) throw new AppError('CONFLICT');
    // The second confirmation must name the same donation; amount is re-checked here.
    if (
      body.confirmReference !== intent.publicReference ||
      credit.amountPaise !== intent.amountPaise
    ) {
      throw new AppError('VALIDATION_ERROR', [{ path: 'confirmReference', issue: 'mismatch' }]);
    }
    await audit.mutate(
      {
        action: 'bank_transfer.confirmed_paid',
        entityType: 'donation_intent',
        entityId: intent.id,
        changedFields: ['status', 'bank_transfer_record'],
        reason: body.reason,
      },
      async (tx) => {
        const updated = await tx.bankTransferRecord.updateMany({
          where: { id, status: 'REPORTED' },
          data: {
            status: 'MATCHED',
            matchedById: adminId,
            matchedAt: new Date(),
            decisionReason: body.reason,
          },
        });
        if (updated.count !== 1) throw new AppError('CONFLICT');
        await transitionDonation(tx, intent.id, 'PAID', 'owner_bank_evidence');
        const receipt = await issueReceiptIfEligible(
          tx,
          intent.id,
          { bankTransferRecordId: id },
          credit.amountPaise,
          new Date(),
        );
        await enqueueDonationPaid(tx, intent.id, receipt !== null);
      },
    );
    return {
      id,
      status: 'MATCHED',
      donationReference: intent.publicReference,
      donationStatus: 'PAID',
    };
  });

  app.post('/bank-transfers/credits/:id/reject', async (request) => {
    const { id } = parseInput(IdParams, request.params);
    const body = parseInput(ReasonBody, request.body);
    const { audit } = audit_(request);
    const credit = await db.bankTransferRecord.findUnique({ where: { id } });
    if (!credit) throw new AppError('NOT_FOUND');
    if (credit.status !== 'REPORTED') throw new AppError('CONFLICT');
    await audit.mutate(
      {
        action: 'bank_transfer.credit_rejected',
        entityType: 'bank_transfer_record',
        entityId: id,
        changedFields: ['status'],
        reason: body.reason,
      },
      (tx) =>
        tx.bankTransferRecord.update({
          where: { id },
          data: { status: 'REJECTED', decisionReason: body.reason },
        }),
    );
    return { id, status: 'REJECTED' };
  });

  app.post('/payment-exceptions/:id/resolve', async (request) => {
    const { id } = parseInput(IdParams, request.params);
    const body = parseInput(ReasonBody, request.body);
    const { audit, adminId } = audit_(request);
    const exception = await db.paymentException.findUnique({ where: { id } });
    if (!exception) throw new AppError('NOT_FOUND');
    if (exception.status !== 'OPEN') throw new AppError('CONFLICT');
    await audit.mutate(
      {
        action: 'payment_exception.resolved',
        entityType: 'payment_exception',
        entityId: id,
        changedFields: ['status'],
        reason: body.reason,
      },
      (tx) =>
        tx.paymentException.update({
          where: { id },
          data: {
            status: 'RESOLVED',
            resolvedAt: new Date(),
            resolvedById: adminId,
            resolution: body.reason,
          },
        }),
    );
    return { id, status: 'RESOLVED' };
  });

  function audit_(request: FastifyRequest) {
    return audit(request);
  }
}
