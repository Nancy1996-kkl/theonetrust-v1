import type { FastifyBaseLogger, FastifyReply } from 'fastify';
import type { Db } from '../../db/client.ts';
import { AppError } from '../../http/errors.ts';

export type WebhookOutcome = {
  status: 'PROCESSED' | 'IGNORED';
  note?: string;
  donationIntentId?: string;
};

/**
 * The durable, idempotent part of a gateway webhook (#27, audit F-3), used by the Cashfree webhook
 * (cashfree-webhook-routes.ts):
 * 1. record the event ID (unique per gateway) BEFORE processing — a duplicate is acknowledged
 *    without being applied again;
 * 2. a processing failure is recorded and answered 500, so the gateway retries; the retry
 *    re-processes that same event row;
 * 3. a row left RECEIVED (the process died mid-way) is re-processed by a retry once it is older
 *    than `reprocessAfterMs`; exactly one retry wins the claim, a fresher row is "duplicate".
 */
export async function deliverWebhook(args: {
  db: Db;
  provider: 'CASHFREE';
  eventId: string;
  eventType: string;
  now: () => Date;
  reprocessAfterMs: number;
  log: FastifyBaseLogger;
  reply: FastifyReply;
  process: () => Promise<WebhookOutcome>;
}) {
  const { db, provider, eventId, eventType, reply, log } = args;
  // Durable record first (unique per provider + event ID); never acknowledge before this.
  let row = await db.webhookEvent.findUnique({
    where: { provider_providerEventId: { provider, providerEventId: eventId } },
  });
  if (row && row.processingStatus === 'RECEIVED') {
    // Claim a stale row with a conditional update: of concurrent retries, only one gets count 1.
    // receivedAt stays the arrival time; processedAt holds the claim's lease while RECEIVED
    // (it is overwritten with the real completion time), and attempts counts each claim so the
    // owner's webhook view shows an event that keeps dying.
    const cutoff = new Date(args.now().getTime() - args.reprocessAfterMs);
    const claimed = await db.webhookEvent.updateMany({
      where: {
        id: row.id,
        processingStatus: 'RECEIVED',
        receivedAt: { lt: cutoff },
        OR: [{ processedAt: null }, { processedAt: { lt: cutoff } }],
      },
      data: { processedAt: args.now(), attempts: { increment: 1 } },
    });
    if (claimed.count !== 1) return reply.code(200).send({ received: true, duplicate: true });
    log.warn({ eventType }, 'Re-processing a webhook left unfinished');
  } else if (row && row.processingStatus !== 'FAILED') {
    return reply.code(200).send({ received: true, duplicate: true });
  }
  if (!row) {
    try {
      row = await db.webhookEvent.create({
        data: {
          provider,
          providerEventId: eventId,
          eventType,
          signatureValid: true,
          receivedAt: args.now(),
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
    const outcome = await args.process();
    await db.webhookEvent.update({
      where: { id: row.id },
      data: {
        processingStatus: outcome.status,
        processingError: outcome.note ?? null,
        attempts: { increment: 1 },
        processedAt: args.now(),
        ...(outcome.donationIntentId && { donationIntentId: outcome.donationIntentId }),
      },
    });
    return reply.code(200).send({ received: true });
  } catch (error) {
    log.error({ eventType, err: error }, 'Webhook processing failed');
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
}
