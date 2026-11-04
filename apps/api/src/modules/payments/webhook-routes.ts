import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Db } from '../../db/client.ts';
import { AppError } from '../../http/errors.ts';
import { parseProviderPayment } from '../donations/provider.ts';
import { applySubscriptionEvent, SUBSCRIPTION_EVENTS } from '../subscriptions/lifecycle.ts';
import { applyProviderPayment, applyRefund } from './reconcile.ts';

/** HMAC-SHA256 of the exact raw body with the webhook secret, compared in constant time. */
export function verifyWebhookSignature(raw: Buffer, signature: unknown, secret: string): boolean {
  if (typeof signature !== 'string' || !/^[0-9a-f]{64}$/.test(signature)) return false;
  const expected = createHmac('sha256', secret).update(raw).digest('hex');
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

type Outcome = { status: 'PROCESSED' | 'IGNORED'; note?: string; donationIntentId?: string };

interface RazorpayEvent {
  event?: unknown;
  payload?: {
    payment?: { entity?: unknown };
    refund?: { entity?: { status?: unknown } };
    subscription?: { entity?: unknown };
  };
}

const EVENT_ID = /^[A-Za-z0-9_-]{6,64}$/;

/**
 * `POST /api/v1/webhooks/razorpay` (#27). Order of work:
 * 1. verify the signature on the RAW bytes — invalid → 400 and nothing is stored or changed;
 * 2. durably record the event ID (unique) BEFORE processing — a duplicate is acknowledged
 *    without being applied again;
 * 3. apply it through the same reconcile path as the Checkout callback (#26);
 * 4. a processing failure is recorded and answered 500, so Razorpay retries; the retry
 *    re-processes that same event row.
 */
export async function razorpayWebhookRoutes(
  app: FastifyInstance,
  opts: { db?: Db; secret?: string; now: () => Date },
) {
  async function process(db: Db, event: RazorpayEvent, eventId: string): Promise<Outcome> {
    const type = typeof event.event === 'string' ? event.event : '';
    const rawPayment = event.payload?.payment?.entity;

    // Monthly giving (#33): subscription events follow the mandate, charges become payments.
    if ((SUBSCRIPTION_EVENTS as readonly string[]).includes(type)) {
      return applySubscriptionEvent(
        db,
        type,
        event.payload?.subscription?.entity,
        rawPayment ? parseProviderPayment(rawPayment) : null,
        eventId,
        opts.now(),
      );
    }

    if (type === 'virtual_account.credited') {
      // Smart Collect is [CONFIRM] / not enabled: money arrived — the owner must look at it.
      const payment = rawPayment ? parseProviderPayment(rawPayment) : null;
      await db.paymentException.create({
        data: { kind: 'UNMATCHED_CREDIT', providerPaymentId: payment?.paymentId ?? null },
      });
      return { status: 'PROCESSED', note: 'virtual_account_credit_to_review' };
    }

    const handled = ['payment.authorized', 'payment.captured', 'payment.failed', 'order.paid'];
    const refunds = ['refund.created', 'refund.processed', 'refund.failed'];
    if (!handled.includes(type) && !refunds.includes(type))
      return { status: 'IGNORED', note: 'event_not_handled' };
    if (!rawPayment) return { status: 'IGNORED', note: 'no_payment_entity' };
    const payment = parseProviderPayment(rawPayment);

    const attempt = refunds.includes(type)
      ? await db.paymentAttempt.findUnique({ where: { providerPaymentId: payment.paymentId } })
      : payment.orderId
        ? await db.paymentAttempt.findUnique({ where: { providerOrderId: payment.orderId } })
        : null;
    if (!attempt && (rawPayment as { invoice_id?: unknown }).invoice_id) {
      // A monthly charge: recorded from its subscription.charged event, not from here (#33).
      return { status: 'IGNORED', note: 'subscription_payment' };
    }
    if (!attempt) {
      // A payment we never created an order for (or not linked yet): owner review, no guess.
      await db.paymentException.create({
        data: { kind: 'PAYMENT_MISMATCH', providerPaymentId: payment.paymentId },
      });
      return { status: 'PROCESSED', note: 'unknown_payment_to_review' };
    }

    if (refunds.includes(type)) {
      await applyRefund(
        db,
        attempt.id,
        payment,
        type.slice('refund.'.length) as 'created' | 'processed' | 'failed',
        opts.now(),
      );
    } else {
      await applyProviderPayment(db, attempt.id, payment, opts.now());
    }
    return { status: 'PROCESSED', donationIntentId: attempt.donationIntentId };
  }

  app.post('/razorpay', { config: { rawBody: true, rateLimit: false } }, async (request, reply) => {
    if (!opts.db || !opts.secret) throw new AppError('SERVICE_UNAVAILABLE');
    const db = opts.db;
    const raw = request.rawBody;
    if (
      !raw ||
      !verifyWebhookSignature(raw, request.headers['x-razorpay-signature'], opts.secret)
    ) {
      request.log.warn('Webhook signature rejected');
      throw new AppError('VALIDATION_ERROR', [{ path: 'x-razorpay-signature', issue: 'invalid' }]);
    }
    const eventId = request.headers['x-razorpay-event-id'];
    if (typeof eventId !== 'string' || !EVENT_ID.test(eventId)) {
      throw new AppError('VALIDATION_ERROR', [{ path: 'x-razorpay-event-id', issue: 'invalid' }]);
    }
    const event = request.body as RazorpayEvent;
    const eventType = typeof event?.event === 'string' ? event.event.slice(0, 80) : 'unknown';

    // Durable record first (unique per provider + event ID); never acknowledge before this.
    let row = await db.webhookEvent.findUnique({
      where: { provider_providerEventId: { provider: 'RAZORPAY', providerEventId: eventId } },
    });
    if (row && row.processingStatus !== 'FAILED') {
      return reply.code(200).send({ received: true, duplicate: true });
    }
    if (!row) {
      try {
        row = await db.webhookEvent.create({
          data: {
            provider: 'RAZORPAY',
            providerEventId: eventId,
            eventType,
            signatureValid: true,
            receivedAt: opts.now(),
          },
        });
      } catch (error) {
        if ((error as { code?: string }).code === 'P2002') {
          return reply.code(200).send({ received: true, duplicate: true }); // concurrent delivery
        }
        throw error;
      }
    }

    try {
      const outcome = await process(db, event, eventId);
      await db.webhookEvent.update({
        where: { id: row.id },
        data: {
          processingStatus: outcome.status,
          processingError: outcome.note ?? null,
          attempts: { increment: 1 },
          processedAt: opts.now(),
          ...(outcome.donationIntentId && { donationIntentId: outcome.donationIntentId }),
        },
      });
      return reply.code(200).send({ received: true });
    } catch (error) {
      request.log.error({ eventType, err: error }, 'Webhook processing failed');
      await db.webhookEvent.update({
        where: { id: row.id },
        data: {
          processingStatus: 'FAILED',
          processingError: 'processing_failed',
          attempts: { increment: 1 },
        },
      });
      throw new AppError('INTERNAL_ERROR');
    }
  });
}
