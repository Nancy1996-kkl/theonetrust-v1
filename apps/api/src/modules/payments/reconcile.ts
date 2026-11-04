import type { DonationStatus } from '@theonetrust/contracts';
import type { Db } from '../../db/client.ts';
import type { ProviderPayment } from '../donations/provider.ts';
import { enqueueDonationPaid } from '../notifications/outbox.ts';
import { adjustReceiptForRefund, issueReceiptIfEligible } from '../receipts/issue.ts';
import { canTransition, transitionDonation } from './transitions.ts';

/**
 * Applies TRUSTED provider data (fetched from Razorpay's API with our secret — or, in #27, a
 * signature-verified webhook) to our ledger. Shared by the checkout callback, the status re-check
 * and the webhook, so all three follow identical rules (#26, #27):
 *
 * - order ID, amount and currency must match what WE created, else MANUAL_REVIEW + exception;
 * - a second, different payment for the same order → MANUAL_REVIEW + exception;
 * - captured → PAID, authorized → AUTHORIZED, failed → FAILED, created → PENDING;
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
    const duplicate =
      attempt.providerPaymentId !== null && attempt.providerPaymentId !== payment.paymentId;

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
        providerPaymentId: payment.paymentId,
        providerStatus: payment.status,
        method: payment.method,
        ...(payment.status === 'captured' && { capturedPaise: payment.amountPaise }),
        ...(opts.signatureVerified && !attempt.signatureVerifiedAt && { signatureVerifiedAt: now }),
      },
    });

    const target = STATUS_FOR[payment.status];
    // Unknown or refund states are recorded on the attempt; refunds are handled by #27/#35.
    if (!target || target === intent.status || !canTransition(intent.status, target)) {
      return intent.status;
    }
    await transitionDonation(
      tx,
      intent.id,
      target,
      target === 'PAID' ? 'gateway_verified' : 'gateway_status',
    );
    // The acknowledgement is created in the same transaction as PAID, never before (#29).
    if (target === 'PAID') {
      const receipt = await issueReceiptIfEligible(
        tx,
        intent.id,
        { paymentAttemptId: attempt.id },
        payment.amountPaise,
        now,
      );
      // Emails are queued here and sent later: a send failure can never undo PAID (#30).
      await enqueueDonationPaid(tx, intent.id, receipt !== null);
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
