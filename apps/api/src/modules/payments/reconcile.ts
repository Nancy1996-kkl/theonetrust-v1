import type { DonationStatus } from '@theonetrust/contracts';
import type { Db } from '../../db/client.ts';
import type { ProviderPayment } from '../donations/provider.ts';
import { enqueueDonationPaid } from '../notifications/outbox.ts';
import { ensureTaxTracking } from '../tax/tracking.ts';
import { adjustReceiptForRefund, issueReceiptIfEligible } from '../receipts/issue.ts';
import { canTransition, transitionDonation } from './transitions.ts';

/**
 * Applies TRUSTED provider data (fetched from Razorpay's API with our secret — or, in #27, a
 * signature-verified webhook) to our ledger. Shared by the checkout callback, the status re-check
 * and the webhook, so all three follow identical rules (#26, #27):
 *
 * - order ID, amount and currency must match what WE created, else MANUAL_REVIEW + exception;
 * - a second, different SETTLING payment for the same order → MANUAL_REVIEW + exception; a failed
 *   or abandoned try never claims the order, so a later success on it still counts (audit F-1);
 * - captured → PAID, authorized → AUTHORIZED, failed → FAILED, created → PENDING; captured money
 *   also heals an earlier FAILED try (gateway-verified only);
 * - nothing ever moves backwards (the transition service refuses it), so out-of-order events
 *   are harmless.
 */
export type ReconcileOutcome = DonationStatus;

const STATUS_FOR: Record<string, DonationStatus> = {
  created: 'PENDING',
  authorized: 'AUTHORIZED',
  captured: 'PAID',
  failed: 'FAILED',
};

/** Payment states that never settle an order, so never claim its attempt (audit F-1). */
const NON_CLAIMING = new Set(['created', 'failed']);
/** Forward order of a payment's life; a lower state for the same payment is a stale event. */
const RANK: Record<string, number> = {
  created: 0,
  failed: 1,
  authorized: 2,
  captured: 3,
  refunded: 4,
};
const rank = (status: string | null): number => RANK[status ?? ''] ?? -1;

export async function applyProviderPayment(
  db: Db,
  attemptId: string,
  payment: ProviderPayment,
  now: Date,
  opts: { signatureVerified?: boolean } = {},
): Promise<ReconcileOutcome> {
  return db.$transaction(async (tx) => {
    const attempt = await tx.paymentAttempt.findUniqueOrThrow({
      where: { id: attemptId },
      include: { donationIntent: true },
    });
    const intent = attempt.donationIntent;

    const mismatch =
      payment.orderId !== attempt.providerOrderId ||
      payment.amountPaise !== attempt.amountPaise ||
      payment.currency !== 'INR';
    // Only a payment that settles (or may settle) the order claims the attempt (audit F-1): a
    // failed or abandoned try never does, so a successful retry on the same order still counts.
    const claims = !NON_CLAIMING.has(payment.status);
    const claimed =
      attempt.providerPaymentId !== null && !NON_CLAIMING.has(attempt.providerStatus ?? 'failed');
    const sameClaim = attempt.providerPaymentId === payment.paymentId;
    // A different payment failing after the order is settled says nothing about this order.
    if (!mismatch && claimed && !sameClaim && !claims) return intent.status;
    // A stale event for the claimed payment (failed/authorized after captured) changes nothing.
    if (
      !mismatch &&
      claimed &&
      sameClaim &&
      payment.status in RANK &&
      rank(payment.status) < rank(attempt.providerStatus)
    ) {
      return intent.status;
    }
    // "Duplicate" means a SECOND settling payment with a different ID.
    const duplicate = claimed && !sameClaim && claims;

    if (mismatch || duplicate) {
      return flagForReview(
        tx,
        intent.id,
        duplicate ? 'DUPLICATE_PAYMENT' : 'PAYMENT_MISMATCH',
        payment.paymentId,
        claims,
      );
    }

    // Write conditionally: another transaction may have claimed this attempt since we read it.
    // The row lock makes this writer wait and re-check the condition, so two captured payments
    // arriving together can never both "win" silently.
    const written = await tx.paymentAttempt.updateMany({
      where: {
        id: attempt.id,
        ...(!sameClaim && {
          OR: [
            { providerPaymentId: null },
            { providerStatus: null },
            { providerStatus: { in: [...NON_CLAIMING] } },
          ],
        }),
      },
      data: {
        ...(claims && { providerPaymentId: payment.paymentId }),
        providerStatus: payment.status,
        method: payment.method,
        ...(payment.status === 'captured' && { capturedPaise: payment.amountPaise }),
        ...(opts.signatureVerified && !attempt.signatureVerifiedAt && { signatureVerifiedAt: now }),
      },
    });
    if (written.count === 0) {
      if (claims) {
        return flagForReview(tx, intent.id, 'DUPLICATE_PAYMENT', payment.paymentId, true);
      }
      return currentStatus(tx, intent.id); // a failed try lost to a payment that settled the order
    }

    const target = STATUS_FOR[payment.status];
    const source = target === 'PAID' ? 'gateway_verified' : 'gateway_status';
    // Unknown or refund states are recorded on the attempt; refunds are handled by #27/#35.
    // Money captured on our own order heals an earlier FAILED try (history keeps FAILED → PAID).
    if (!target || target === intent.status || !canTransition(intent.status, target, source)) {
      return intent.status;
    }
    // Only the refund flow may return a refund in progress to PAID.
    if (target === 'PAID' && intent.status === 'REFUND_PENDING') return intent.status;
    await transitionDonation(tx, intent.id, target, source);
    // The acknowledgement is created in the same transaction as PAID, never before (#29).
    if (target === 'PAID') {
      await issueReceiptIfEligible(
        tx,
        intent.id,
        { paymentAttemptId: attempt.id },
        payment.amountPaise,
        now,
      );
      // Emails and the sheet row are queued here and sent later: a failure can never undo PAID.
      await enqueueDonationPaid(tx, intent.id);
      // Tax opt-in donations need Form 113 reporting (#35).
      await ensureTaxTracking(tx, intent.id, now);
    }
    return target;
  });
}

type Tx = Parameters<Parameters<Db['$transaction']>[0]>[0];

async function currentStatus(tx: Tx, intentId: string): Promise<DonationStatus> {
  const intent = await tx.donationIntent.findUniqueOrThrow({
    where: { id: intentId },
    select: { status: true },
  });
  return intent.status;
}

/**
 * Records a mismatch or duplicate for the owner — once per (kind, donation, payment), so repeated
 * re-checks never pile up rows — and moves the donation to review unless it is already PAID. A
 * FAILED donation goes to review only when money may have moved (an authorized/captured payment).
 */
async function flagForReview(
  tx: Tx,
  intentId: string,
  kind: 'DUPLICATE_PAYMENT' | 'PAYMENT_MISMATCH',
  providerPaymentId: string,
  moneyMoved: boolean,
): Promise<DonationStatus> {
  const known = await tx.paymentException.findFirst({
    where: { kind, donationIntentId: intentId, providerPaymentId },
    select: { id: true },
  });
  if (!known) {
    await tx.paymentException.create({
      data: { kind, donationIntentId: intentId, providerPaymentId },
    });
  }
  const status = await currentStatus(tx, intentId);
  const source = moneyMoved ? 'gateway_status' : undefined;
  if (status !== 'PAID' && canTransition(status, 'MANUAL_REVIEW', source)) {
    await transitionDonation(tx, intentId, 'MANUAL_REVIEW', 'gateway_status');
    return 'MANUAL_REVIEW';
  }
  return status;
}

/** What a donor may see: PAID only when verified; everything unsettled is PENDING. */
export function donorStatus(status: DonationStatus): 'PAID' | 'PENDING' | 'FAILED' {
  if (status === 'PAID') return 'PAID';
  if (status === 'FAILED') return 'FAILED';
  return 'PENDING';
}

/**
 * Refunds (#27): the trusted payment entity says how much was refunded. A full refund ends in
 * REFUNDED (via REFUND_PENDING); a partial one keeps the donation PAID with the refunded amount
 * recorded; a failed refund returns REFUND_PENDING to PAID. Nothing is ever deleted.
 */
export async function applyRefund(
  db: Db,
  attemptId: string,
  payment: ProviderPayment,
  refundStatus: 'created' | 'processed' | 'failed',
  now: Date = new Date(),
): Promise<DonationStatus> {
  return db.$transaction(async (tx) => {
    const attempt = await tx.paymentAttempt.findUniqueOrThrow({
      where: { id: attemptId },
      include: { donationIntent: true },
    });
    const intent = attempt.donationIntent;
    const refunded = Math.min(
      Math.max(payment.refundedPaise, attempt.refundedPaise),
      attempt.capturedPaise,
    );
    await tx.paymentAttempt.update({
      where: { id: attempt.id },
      data: { refundedPaise: refunded, providerStatus: payment.status },
    });
    const full = refunded > 0 && refunded >= attempt.capturedPaise;
    // A processed refund is recorded on the acknowledgement as a new entry, never a deletion.
    if (refundStatus === 'processed' && refunded > 0) {
      await adjustReceiptForRefund(tx, attempt.id, attempt.capturedPaise - refunded, full, now);
    }
    if (refundStatus === 'failed') {
      if (intent.status === 'REFUND_PENDING') {
        await transitionDonation(tx, intent.id, 'PAID', 'gateway_verified');
        return 'PAID';
      }
      return intent.status;
    }
    if (!full) return intent.status; // partial refund: still PAID, amount recorded
    let status = intent.status;
    if (status === 'PAID') {
      await transitionDonation(tx, intent.id, 'REFUND_PENDING', 'gateway_status');
      status = 'REFUND_PENDING';
    }
    if (refundStatus === 'processed' && status === 'REFUND_PENDING') {
      await transitionDonation(tx, intent.id, 'REFUNDED', 'gateway_status');
      status = 'REFUNDED';
    }
    return status;
  });
}
