import type { DonationStatus } from '@theonetrust/contracts';
import type { Db } from '../../db/client.ts';
import { razorpayOrderState, type PaymentProvider } from '../donations/provider.ts';
import type { PaymentState } from './order-state.ts';
import { applyOrderState } from './reconcile.ts';

export interface RecheckAttempt {
  id: string;
  providerOrderId: string;
}

export interface RecheckResult {
  status: DonationStatus;
  /** The payment state that decided the outcome, or null when the gateway has no payment. */
  found: PaymentState | null;
}

/**
 * Asks the gateway (with our secret) for EVERY payment made on this attempt and applies them
 * through the shared reconcile rules. Used by the donor status re-check and the owner's re-check,
 * so both behave the same (audit F-1, F-4):
 *
 * - by order, never only by a stored payment ID: a failed first try and a successful retry on the
 *   same order are both seen, and the successful one wins;
 * - QR attempts are matched by the QR they were paid on; monthly charges by their payment;
 * - every captured payment is applied, so a second captured payment surfaces as a duplicate for
 *   the owner instead of being silently ignored.
 *
 * Gateway errors are thrown to the caller, which keeps the current status (never a guess).
 */
export async function recheckAttempt(
  db: Db,
  provider: PaymentProvider,
  attempt: RecheckAttempt,
  now: Date,
): Promise<RecheckResult> {
  const state = await razorpayOrderState(provider, attempt.providerOrderId);
  return applyOrderState(db, attempt.id, state, now);
}
