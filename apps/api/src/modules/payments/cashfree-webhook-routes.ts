import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Db } from '../../db/client.ts';
import { AppError } from '../../http/errors.ts';
import { cashfreeId, verifyCashfreeSignature } from '../donations/cashfree.ts';
import type { PaymentProvider } from '../donations/provider.ts';
import { recheckAttempt } from './recheck.ts';
import { applyRefund } from './reconcile.ts';
import { deliverWebhook, type WebhookOutcome } from './webhook-routes.ts';

/** A webhook signed further ahead than this is refused (clock skew allowance). */
export const CASHFREE_FUTURE_SKEW_MS = 5 * 60_000;

export const CASHFREE_PAYMENT_EVENTS = [
  'PAYMENT_SUCCESS_WEBHOOK',
  'PAYMENT_FAILED_WEBHOOK',
  'PAYMENT_USER_DROPPED_WEBHOOK',
] as const;
export const CASHFREE_REFUND_EVENTS = [
  'REFUND_STATUS_WEBHOOK',
  'AUTO_REFUND_STATUS_WEBHOOK',
] as const;

interface CashfreeEvent {
  type?: unknown;
  data?: {
    order?: { order_id?: unknown };
    payment?: { cf_payment_id?: unknown; payment_status?: unknown };
    refund?: {
      cf_refund_id?: unknown;
      cf_payment_id?: unknown;
      order_id?: unknown;
      refund_status?: unknown;
    };
    auto_refund?: { cf_refund_id?: unknown; cf_payment_id?: unknown; refund_status?: unknown };
  };
}

const WORD = /^[A-Z_]{1,40}$/;
const word = (value: unknown): string =>
  typeof value === 'string' && WORD.test(value) ? value : 'unknown';

/**
 * Cashfree sends no event ID, so one is derived (Phase 4c): a payment event by payment + status,
 * a refund event by refund + status, anything else by the hash of its exact bytes. Replays and
 * Cashfree's own retries map to the same key and are acknowledged without being applied twice.
 */
export function cashfreeEventKey(event: CashfreeEvent, raw: Buffer): string {
  const type = word(event.type);
  const payment = event.data?.payment;
  const refund = event.data?.refund ?? event.data?.auto_refund;
  const paymentId = cashfreeId(payment?.cf_payment_id);
  if (paymentId) return `pay:${type}:${paymentId}:${word(payment?.payment_status)}`;
  const refundId = cashfreeId(refund?.cf_refund_id);
  if (refundId) return `ref:${type}:${refundId}:${word(refund?.refund_status)}`;
  return `raw:${createHash('sha256').update(raw).digest('hex')}`;
}

/** Cashfree's timestamp is in milliseconds (seconds accepted too, for safety). */
function timestampMs(timestamp: string): number {
  const value = Number(timestamp);
  return value < 1e12 ? value * 1000 : value;
}

/**
 * `POST /api/v1/webhooks/cashfree` (Phase 4c). Order of work:
 * 1. verify base64(HMAC-SHA256(client secret, timestamp + RAW body)) — invalid → 400, nothing
 *    stored; a timestamp more than 5 minutes in the future is refused too (old ones are allowed:
 *    Cashfree retries for hours and replays are harmless because of step 2);
 * 2. durable, idempotent record of the derived event key (shared with Razorpay);
 * 3. the payload's statuses and amounts are NEVER trusted: the order is re-fetched from Cashfree
 *    with our secret and applied through the shared reconcile rules;
 * 4. 200 only after the outcome is stored; 500 on failure so Cashfree retries.
 */
export async function cashfreeWebhookRoutes(
  app: FastifyInstance,
  opts: {
    db?: Db;
    provider?: PaymentProvider;
    secret?: string;
    now: () => Date;
    reprocessAfterMs: number;
  },
) {
  async function process(
    db: Db,
    provider: PaymentProvider,
    event: CashfreeEvent,
  ): Promise<WebhookOutcome> {
    const type = word(event.type);

    if ((CASHFREE_PAYMENT_EVENTS as readonly string[]).includes(type)) {
      const orderId = event.data?.order?.order_id;
      const paymentId = cashfreeId(event.data?.payment?.cf_payment_id);
      const attempt =
        typeof orderId === 'string'
          ? await db.paymentAttempt.findUnique({ where: { providerOrderId: orderId } })
          : null;
      if (!attempt || attempt.provider !== 'CASHFREE') {
        if (type !== 'PAYMENT_SUCCESS_WEBHOOK') return { status: 'IGNORED', note: 'unknown_order' };
        // Money arrived on an order we did not create: the owner looks, nothing is guessed.
        await db.paymentException.create({
          data: { kind: 'UNMATCHED_CREDIT', providerPaymentId: paymentId },
        });
        return { status: 'PROCESSED', note: 'unknown_order_to_review' };
      }
      await recheckAttempt(db, provider, attempt, opts.now());
      return { status: 'PROCESSED', donationIntentId: attempt.donationIntentId };
    }

    if ((CASHFREE_REFUND_EVENTS as readonly string[]).includes(type)) {
      const refund = event.data?.refund ?? event.data?.auto_refund;
      const orderId = event.data?.refund?.order_id;
      const paymentId = cashfreeId(refund?.cf_payment_id);
      const attempt =
        typeof orderId === 'string'
          ? await db.paymentAttempt.findUnique({ where: { providerOrderId: orderId } })
          : paymentId
            ? await db.paymentAttempt.findUnique({ where: { providerPaymentId: paymentId } })
            : null;
      // An auto-refund of a payment that never settled one of our orders changes nothing here.
      if (!attempt || attempt.provider !== 'CASHFREE' || !provider.fetchRefunds) {
        return { status: 'IGNORED', note: 'refund_unmatched' };
      }
      const refunds = await provider.fetchRefunds(attempt.providerOrderId);
      if (!refunds.status) return { status: 'IGNORED', note: 'no_refunds' };
      const full = refunds.refundedPaise > 0 && refunds.refundedPaise >= attempt.capturedPaise;
      await applyRefund(
        db,
        attempt.id,
        {
          paymentId: attempt.providerPaymentId ?? '',
          orderId: attempt.providerOrderId,
          amountPaise: attempt.amountPaise,
          currency: 'INR',
          status: full ? 'refunded' : 'captured',
          method: attempt.method,
          refundedPaise: refunds.refundedPaise,
        },
        refunds.status,
        opts.now(),
      );
      return { status: 'PROCESSED', donationIntentId: attempt.donationIntentId };
    }

    return { status: 'IGNORED', note: 'event_not_handled' };
  }

  app.post('/cashfree', { config: { rawBody: true, rateLimit: false } }, async (request, reply) => {
    if (!opts.db || !opts.secret || opts.provider?.name !== 'CASHFREE') {
      throw new AppError('SERVICE_UNAVAILABLE');
    }
    const { db, provider } = opts;
    const raw = request.rawBody;
    const timestamp = request.headers['x-webhook-timestamp'];
    if (
      !raw ||
      !verifyCashfreeSignature(raw, request.headers['x-webhook-signature'], timestamp, opts.secret)
    ) {
      request.log.warn('Webhook signature rejected');
      throw new AppError('VALIDATION_ERROR', [{ path: 'x-webhook-signature', issue: 'invalid' }]);
    }
    if (timestampMs(timestamp as string) > opts.now().getTime() + CASHFREE_FUTURE_SKEW_MS) {
      throw new AppError('VALIDATION_ERROR', [{ path: 'x-webhook-timestamp', issue: 'invalid' }]);
    }
    const event = (request.body ?? {}) as CashfreeEvent;
    return deliverWebhook({
      db,
      provider: 'CASHFREE',
      eventId: cashfreeEventKey(event, raw).slice(0, 200),
      eventType: word(event.type),
      now: opts.now,
      reprocessAfterMs: opts.reprocessAfterMs,
      log: request.log,
      reply,
      process: () => process(db, provider, event),
    });
  });
}
