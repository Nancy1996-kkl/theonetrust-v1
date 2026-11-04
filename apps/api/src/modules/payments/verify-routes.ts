import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { DonationStatusResponse } from '@theonetrust/contracts';
import type { Db } from '../../db/client.ts';
import { AppError } from '../../http/errors.ts';
import { parseInput } from '../../http/validation.ts';
import { PaymentProviderError, type PaymentProvider } from '../donations/provider.ts';
import { currentReceiptToken } from '../receipts/issue.ts';
import { applyProviderPayment, donorStatus } from './reconcile.ts';

const reference = z.string().regex(/^TOT-D-[0-9A-HJKMNP-TV-Z]{12}$/);
const VerifyBody = z.object({
  publicReference: reference,
  orderId: z.string().regex(/^order_[A-Za-z0-9]{6,40}$/),
  paymentId: z.string().regex(/^pay_[A-Za-z0-9]{6,40}$/),
  signature: z.string().max(128),
});
const StatusParams = z.object({ reference });

export interface VerifyRouteOptions {
  db?: Db;
  provider?: PaymentProvider;
  verifyPerHour: number;
  statusPerHour: number;
  now: () => Date;
  /** Derives acknowledgement share tokens (#29); without it no receipt link is returned. */
  receiptKey?: Buffer;
}

/**
 * `POST /api/v1/payments/verify` (Checkout callback) and
 * `GET /api/v1/donations/status/:reference` (safe re-check). Neither trusts the browser: the
 * signature is checked in constant time, then the payment state is FETCHED from Razorpay and
 * compared with our own order before anything changes. Responses carry donor-safe fields only.
 */
export async function paymentVerifyRoutes(app: FastifyInstance, opts: VerifyRouteOptions) {
  function deps() {
    if (!opts.db || !opts.provider) throw new AppError('SERVICE_UNAVAILABLE');
    return { db: opts.db, provider: opts.provider };
  }

  async function intentWithAttempt(db: Db, publicReference: string) {
    const intent = await db.donationIntent.findUnique({
      where: { publicReference },
      include: { paymentAttempts: { orderBy: { createdAt: 'desc' } } },
    });
    // Same answer for "no such donation" and "not yours to see": nothing to enumerate.
    if (!intent) throw new AppError('NOT_FOUND');
    return intent;
  }

  async function reply(
    db: Db,
    intent: { id: string; publicReference: string; amountPaise: number },
    status: Parameters<typeof donorStatus>[0],
  ): Promise<DonationStatusResponse> {
    const shown = donorStatus(status);
    const receiptToken =
      shown === 'PAID' ? await currentReceiptToken(db, intent.id, opts.receiptKey) : undefined;
    return {
      publicReference: intent.publicReference,
      status: shown,
      amountPaise: intent.amountPaise,
      ...(receiptToken && { receiptToken }),
    };
  }

  app.post(
    '/payments/verify',
    { config: { rateLimit: { max: opts.verifyPerHour, timeWindow: 3_600_000 } } },
    async (request) => {
      const { db, provider } = deps();
      const body = parseInput(VerifyBody, request.body);
      const intent = await intentWithAttempt(db, body.publicReference);
      const attempt = intent.paymentAttempts.find((a) => a.providerOrderId === body.orderId);
      if (!attempt || intent.channel !== 'CHECKOUT') throw new AppError('NOT_FOUND');

      // A forged or replayed-for-another-order signature changes NOTHING.
      if (!provider.verifyCheckoutSignature(body.orderId, body.paymentId, body.signature)) {
        request.log.warn({ ref: intent.publicReference }, 'Checkout signature rejected');
        throw new AppError('VALIDATION_ERROR', [{ path: 'signature', issue: 'invalid' }]);
      }

      let payment;
      try {
        payment = await provider.fetchPayment(body.paymentId);
      } catch (error) {
        request.log.warn(
          {
            reason: error instanceof PaymentProviderError ? error.reason : 'unknown',
            ref: intent.publicReference,
          },
          'Payment fetch failed',
        );
        // Signature was fine but Razorpay could not be asked: stay pending, re-check later.
        return reply(db, intent, intent.status);
      }
      const status = await applyProviderPayment(db, attempt.id, payment, opts.now(), {
        signatureVerified: true,
      });
      return reply(db, intent, status);
    },
  );

  app.get(
    '/donations/status/:reference',
    { config: { rateLimit: { max: opts.statusPerHour, timeWindow: 3_600_000 } } },
    async (request) => {
      const { db, provider } = deps();
      const { reference: publicReference } = parseInput(StatusParams, request.params);
      const intent = await intentWithAttempt(db, publicReference);
      const unsettled = ['CREATED', 'PENDING', 'AUTHORIZED'].includes(intent.status);
      const attempt = intent.paymentAttempts[0];
      if (!unsettled || intent.channel !== 'CHECKOUT' || !attempt) {
        return reply(db, intent, intent.status);
      }
      // Ask Razorpay (with our secret) — covers a lost browser callback or a closed tab.
      try {
        const payments = attempt.providerPaymentId
          ? [await provider.fetchPayment(attempt.providerPaymentId)]
          : await provider.fetchOrderPayments(attempt.providerOrderId);
        const best =
          payments.find((p) => p.status === 'captured') ??
          payments.find((p) => p.status === 'authorized') ??
          payments[0];
        if (!best) return reply(db, intent, intent.status);
        const status = await applyProviderPayment(db, attempt.id, best, opts.now());
        return reply(db, intent, status);
      } catch {
        return reply(db, intent, intent.status);
      }
    },
  );
}
