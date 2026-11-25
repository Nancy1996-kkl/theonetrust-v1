import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { DonationStatusResponse } from '@theonetrust/contracts';
import type { Db } from '../../db/client.ts';
import { AppError } from '../../http/errors.ts';
import { parseInput } from '../../http/validation.ts';
import { PaymentProviderError, type PaymentProvider } from '../donations/provider.ts';
import { currentReceiptToken } from '../receipts/issue.ts';
import { donorStatus } from './reconcile.ts';
import { recheckAttempt } from './recheck.ts';

const reference = z.string().regex(/^TOT-D-[0-9A-HJKMNP-TV-Z]{12}$/);
/** Cashfree has no browser signature: the donor's page only names the donation to re-check. */
const VerifyBody = z.object({ publicReference: reference }).strict();
const StatusParams = z.object({ reference });

export interface VerifyRouteOptions {
  db?: Db;
  provider?: PaymentProvider;
  verifyPerHour: number;
  statusPerHour: number;
  /** A FAILED donation is re-checked on the public route only while this young (audit F-1). */
  failedRecheckWindowMs: number;
  now: () => Date;
  /** Derives acknowledgement share tokens (#29); without it no receipt link is returned. */
  receiptKey?: Buffer;
}

/**
 * `POST /api/v1/payments/verify` (the donor is back from the payment window) and
 * `GET /api/v1/donations/status/:reference` (safe re-check). Neither trusts the browser: the
 * browser only names the donation; the order is FETCHED from the gateway with our secret and
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
      // Nothing from the browser is trusted: the order is fetched from the gateway with our secret.
      const { publicReference } = parseInput(VerifyBody, request.body);
      const intent = await intentWithAttempt(db, publicReference);
      const attempt = intent.paymentAttempts[0];
      if (!attempt || intent.channel !== 'CHECKOUT') throw new AppError('NOT_FOUND');
      try {
        const { status } = await recheckAttempt(db, provider, attempt, opts.now());
        return reply(db, intent, status);
      } catch (error) {
        request.log.warn(
          {
            reason: error instanceof PaymentProviderError ? error.reason : 'unknown',
            ref: intent.publicReference,
          },
          'Payment re-check failed',
        );
        // The gateway could not be asked: stay as recorded, the status route re-checks later.
        return reply(db, intent, intent.status);
      }
    },
  );

  app.get(
    '/donations/status/:reference',
    { config: { rateLimit: { max: opts.statusPerHour, timeWindow: 3_600_000 } } },
    async (request) => {
      // The ledger answers even with no gateway configured (PAYMENT_PROVIDER=none): only the
      // gateway re-check needs one.
      if (!opts.db) throw new AppError('SERVICE_UNAVAILABLE');
      const db = opts.db;
      const provider = opts.provider;
      const { reference: publicReference } = parseInput(StatusParams, request.params);
      const intent = await intentWithAttempt(db, publicReference);
      // A young FAILED donation is re-checked too: a retry on the same order may have succeeded
      // (audit F-1). Older ones are answered from the ledger; the owner re-check still heals them.
      const youngFailure =
        intent.status === 'FAILED' &&
        opts.now().getTime() - intent.createdAt.getTime() < opts.failedRecheckWindowMs;
      const unsettled =
        ['CREATED', 'PENDING', 'AUTHORIZED'].includes(intent.status) || youngFailure;
      const attempt = intent.paymentAttempts[0];
      if (!unsettled || intent.channel !== 'CHECKOUT' || !attempt || !provider) {
        return reply(db, intent, intent.status);
      }
      // Ask the gateway (with our secret), by order — covers a lost callback, a closed tab and a
      // successful retry after a failed first try.
      try {
        const { status } = await recheckAttempt(db, provider, attempt, opts.now());
        return reply(db, intent, status);
      } catch {
        return reply(db, intent, intent.status);
      }
    },
  );
}
