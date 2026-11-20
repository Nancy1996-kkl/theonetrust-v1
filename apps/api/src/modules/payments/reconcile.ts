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
const RANK: Record<string, number> = { created: 0, failed: 1, authorized: 2, captured: 3 };
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
      await tx.paymentException.create({
        data: {
          kind: duplicate ? 'DUPLICATE_PAYMENT' : 'PAYMENT_MISMATCH',
          donationIntentId: intent.id,
          providerPaymentId: payment.paymentId,
        },
      });
      if (canTransition(intent.status, 'MANUAL_REVIEW') && intent.status !== 'PAID') {
        await transitionDonation(tx, intent.id, 'MANUAL_REVIEW', 'gateway_status');
        return 'MANUAL_REVIEW';
      }
      return intent.status;
    }

    await tx.paymentAttempt.update({
      where: { id: attempt.id },
      data: {
        ...(claims && { providerPaymentId: payment.paymentId }),
        providerStatus: payment.status,
        method: payment.method,
        ...(payment.status === 'captured' && { capturedPaise: payment.amountPaise }),
        ...(opts.signatureVerified && !attempt.signatureVerifiedAt && { signatureVerifiedAt: now }),
      },
    });

    const target = STATUS_FOR[payment.status];
    const source = target === 'PAID' ? 'gateway_verified' : 'gateway_status';
    // Unknown or refund states are recorded on the attempt; refunds are handled by #27/#35.
    // Money captured on our own order heals an earlier FAILED try (history keeps FAILED → PAID).
    if (!target || target === intent.status || !canTransition(intent.status, target, source)) {
      return intent.status;
    }
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
