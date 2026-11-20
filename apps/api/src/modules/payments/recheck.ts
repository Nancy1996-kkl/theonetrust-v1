import type { DonationStatus } from '@theonetrust/contracts';
import type { Db } from '../../db/client.ts';
import { QR_ID, type PaymentProvider, type ProviderPayment } from '../donations/provider.ts';
import { applyProviderPayment } from './reconcile.ts';

/** A monthly charge with no order of its own is stored as `subpay_<payment id>` (#33). */
const SUBSCRIPTION_CHARGE = /^subpay_(?<paymentId>pay_[A-Za-z0-9]{6,40})$/;

export interface RecheckAttempt {
  id: string;
  providerOrderId: string;
}

export interface RecheckResult {
  status: DonationStatus;
  /** The provider status that decided the outcome, or null when the provider has no payment. */
  found: ProviderPayment['status'] | null;
}

/**
 * Asks the provider (with our secret) for EVERY payment made on this attempt and applies them
 * through the shared reconcile rules. Used by the donor status re-check and the owner's re-check,
 * so both behave the same (audit F-1, F-4):
 *
 * - by order, never only by a stored payment ID: a failed first try and a successful retry on the
 *   same order are both seen, and the successful one wins;
 * - QR attempts are matched by the QR they were paid on; monthly charges by their payment;
 * - every captured payment is applied, so a second captured payment surfaces as a duplicate for
 *   the owner instead of being silently ignored.
 *
 * Provider errors are thrown to the caller, which keeps the current status (never a guess).
 */
export async function recheckAttempt(
  db: Db,
  provider: PaymentProvider,
  attempt: RecheckAttempt,
  now: Date,
): Promise<RecheckResult> {
  const payments = await paymentsFor(provider, attempt.providerOrderId);
  const captured = payments.filter((p) => p.status === 'captured');
  const fallback = payments.find((p) => p.status === 'authorized') ?? payments[0];
  const decisive = captured.length > 0 ? captured : fallback ? [fallback] : [];
  let status: DonationStatus = await currentStatus(db, attempt.id);
  for (const payment of decisive) {
    status = await applyProviderPayment(db, attempt.id, payment, now);
  }
  return { status, found: decisive[0]?.status ?? null };
}

async function paymentsFor(
  provider: PaymentProvider,
  providerOrderId: string,
): Promise<ProviderPayment[]> {
  // A QR or monthly payment carries no order of ours: it is matched to the attempt it belongs to.
  const asAttempt = (p: ProviderPayment): ProviderPayment => ({ ...p, orderId: providerOrderId });
  if (QR_ID.test(providerOrderId)) {
    return provider.fetchQrPayments
      ? (await provider.fetchQrPayments(providerOrderId)).map(asAttempt)
      : [];
  }
  const chargeId = SUBSCRIPTION_CHARGE.exec(providerOrderId)?.groups?.paymentId;
  if (chargeId) return [asAttempt(await provider.fetchPayment(chargeId))];
  return provider.fetchOrderPayments(providerOrderId);
}

async function currentStatus(db: Db, attemptId: string): Promise<DonationStatus> {
  const attempt = await db.paymentAttempt.findUniqueOrThrow({
    where: { id: attemptId },
    include: { donationIntent: { select: { status: true } } },
  });
  return attempt.donationIntent.status;
}
