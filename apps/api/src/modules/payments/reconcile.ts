import type { DonationStatus } from '@theonetrust/contracts';
import type { Db } from '../../db/client.ts';
import type { ProviderPayment } from '../donations/provider.ts';
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
    return target;
  });
}

/** What a donor may see: PAID only when verified; everything unsettled is PENDING. */
export function donorStatus(status: DonationStatus): 'PAID' | 'PENDING' | 'FAILED' {
  if (status === 'PAID') return 'PAID';
  if (status === 'FAILED') return 'FAILED';
  return 'PENDING';
}
