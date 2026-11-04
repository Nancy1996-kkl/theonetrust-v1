import type { Db } from '../../db/client.ts';
import { newDonationReference } from '../../db/references.ts';
import type {
  DonationSubscription,
  Prisma,
  SubscriptionStatus,
} from '../../generated/prisma/client.ts';
import type { ProviderPayment } from '../donations/provider.ts';
import { applyProviderPayment } from '../payments/reconcile.ts';
import { parseSubscription } from './provider.ts';
import { nextStatus } from './rules.ts';

type Tx = Prisma.TransactionClient;

/**
 * Moves a monthly gift's status (forward only) and writes the history row in the same
 * transaction. Conditional on the status we read, so a concurrent change is never overwritten.
 */
export async function moveSubscription(
  tx: Tx,
  row: Pick<DonationSubscription, 'id' | 'status'>,
  to: SubscriptionStatus,
  source: string,
  now: Date,
): Promise<boolean> {
  if (to === row.status) return false;
  const moved = await tx.donationSubscription.updateMany({
    where: { id: row.id, status: row.status },
    data: { status: to, ...(to === 'CANCELLED' && { cancelledAt: now }) },
  });
  if (moved.count !== 1) return false;
  await tx.subscriptionStatusEvent.create({
    data: { subscriptionId: row.id, fromStatus: row.status, toStatus: to, source },
  });
  return true;
}

export const SUBSCRIPTION_EVENTS = [
  'subscription.authenticated',
  'subscription.activated',
  'subscription.charged',
  'subscription.pending',
  'subscription.halted',
  'subscription.paused',
  'subscription.resumed',
  'subscription.cancelled',
  'subscription.completed',
  'subscription.updated',
] as const;

export interface LifecycleOutcome {
  status: 'PROCESSED' | 'IGNORED';
  note?: string;
  donationIntentId?: string;
}

/**
 * A charge is its own donation + payment attempt (#33), created once per Razorpay payment ID
 * (unique), then settled by the same reconcile path as one-time gifts: PAID, receipt per charge
 * (threshold per charge) and emails. A repeated "charged" event finds the attempt and stops.
 */
async function recordCharge(
  db: Db,
  sub: DonationSubscription,
  payment: ProviderPayment,
  now: Date,
): Promise<LifecycleOutcome> {
  const existing = await db.paymentAttempt.findUnique({
    where: { providerPaymentId: payment.paymentId },
  });
  if (existing) {
    return {
      status: 'PROCESSED',
      note: 'duplicate_charge',
      donationIntentId: existing.donationIntentId,
    };
  }
  const orderId = payment.orderId ?? `subpay_${payment.paymentId}`;
  let attemptId: string;
  let intentId: string;
  try {
    ({ attemptId, intentId } = await db.$transaction(async (tx) => {
      const intent = await tx.donationIntent.create({
        data: {
          publicReference: newDonationReference(),
          programmeId: sub.programmeId,
          giftPaise: sub.amountPaise,
          amountPaise: sub.amountPaise,
          donorName: sub.donorName,
          donorEmail: sub.donorEmail,
          donorPhone: sub.donorPhone,
          hideNamePublicly: true,
          // The monthly consent covers an acknowledgement per charge; the threshold still applies.
          wantsReceipt: true,
          consentAt: sub.consentAt,
          locale: sub.locale,
          channel: 'CHECKOUT',
          subscriptionId: sub.id,
        },
      });
      const attempt = await tx.paymentAttempt.create({
        data: {
          donationIntentId: intent.id,
          providerOrderId: orderId,
          // What WE expect: the subscription amount. A different charge goes to review.
          amountPaise: sub.amountPaise,
        },
      });
      return { attemptId: attempt.id, intentId: intent.id };
    }));
  } catch (error) {
    if ((error as { code?: string }).code !== 'P2002') throw error;
    // A concurrent delivery of the same charge won the race.
    const winner = await db.paymentAttempt.findUnique({
      where: { providerOrderId: orderId },
    });
    return {
      status: 'PROCESSED',
      note: 'duplicate_charge',
      ...(winner && { donationIntentId: winner.donationIntentId }),
    };
  }
  await applyProviderPayment(db, attemptId, { ...payment, orderId }, now);
  return { status: 'PROCESSED', donationIntentId: intentId };
}

/** A failed (retrying) or halted mandate: an exception for the owner and an email for the donor. */
async function raiseProblem(
  db: Db,
  sub: DonationSubscription,
  kind: 'SUBSCRIPTION_CHARGE_FAILED' | 'SUBSCRIPTION_HALTED',
  eventId: string,
  payment: ProviderPayment | null,
) {
  await db.$transaction(async (tx) => {
    await tx.paymentException.create({
      data: { kind, subscriptionId: sub.id, providerPaymentId: payment?.paymentId ?? null },
    });
    if (sub.donorEmail) {
      await tx.notificationOutbox.createMany({
        data: [
          {
            eventType:
              kind === 'SUBSCRIPTION_HALTED' ? 'subscription.halted' : 'subscription.pending',
            entityRef: `donation_subscription:${sub.id}`,
            template: 'donor_subscription_problem',
            locale: sub.locale,
            dedupeKey: `subscription.problem:${sub.id}:${eventId}`,
          },
        ],
        skipDuplicates: true,
      });
    }
  });
}

/**
 * Applies a signature-verified Razorpay subscription webhook (#33). Our status FOLLOWS the
 * event — including a pause or cancel the donor made in their UPI app — and never moves
 * backwards (a late "active" cannot revive a cancelled gift).
 */
export async function applySubscriptionEvent(
  db: Db,
  type: string,
  rawSubscription: unknown,
  payment: ProviderPayment | null,
  eventId: string,
  now: Date,
): Promise<LifecycleOutcome> {
  if (!rawSubscription) return { status: 'IGNORED', note: 'no_subscription_entity' };
  const remote = parseSubscription(rawSubscription);
  const sub = await db.donationSubscription.findUnique({
    where: { providerSubscriptionId: remote.subscriptionId },
  });
  if (!sub) {
    // A mandate we never created (or not stored yet): owner review, no guess.
    await db.paymentException.create({
      data: { kind: 'PAYMENT_MISMATCH', providerPaymentId: payment?.paymentId ?? null },
    });
    return { status: 'PROCESSED', note: 'unknown_subscription_to_review' };
  }

  const target = nextStatus(sub.status, remote.status);
  await db.$transaction((tx) => moveSubscription(tx, sub, target, `webhook:${type}`, now));

  if (type === 'subscription.charged' && payment) {
    if (sub.status === 'CANCELLED' || sub.status === 'COMPLETED') {
      // Money arrived for a gift we show as ended: record it, and let the owner look.
      const outcome = await recordCharge(db, sub, payment, now);
      await db.paymentException.create({
        data: {
          kind: 'PAYMENT_MISMATCH',
          subscriptionId: sub.id,
          providerPaymentId: payment.paymentId,
        },
      });
      return { ...outcome, note: 'charge_after_end_to_review' };
    }
    return recordCharge(db, sub, payment, now);
  }
  if (type === 'subscription.pending') {
    await raiseProblem(db, sub, 'SUBSCRIPTION_CHARGE_FAILED', eventId, payment);
  }
  if (type === 'subscription.halted') {
    await raiseProblem(db, sub, 'SUBSCRIPTION_HALTED', eventId, payment);
  }
  return { status: 'PROCESSED' };
}
