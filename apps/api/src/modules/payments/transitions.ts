import type { DonationStatus } from '@theonetrust/contracts';
import type { Prisma } from '../../generated/prisma/client.ts';
import { AppError } from '../../http/errors.ts';

/**
 * The ONE place a donation's status changes (spec §6 payment state model). Checkout callback
 * (#26), webhooks (#26/#27) and owner bank-transfer confirmation (#25) all go through here, so the
 * rules cannot drift: nothing moves out of a terminal state, PAID is never undone except by the
 * refund flow, and only verified sources may reach PAID.
 */
export type PaidSource = 'gateway_verified' | 'owner_bank_evidence';

const ALLOWED: Record<DonationStatus, readonly DonationStatus[]> = {
  CREATED: ['PENDING', 'AUTHORIZED', 'PAID', 'FAILED', 'MANUAL_REVIEW'],
  PENDING: ['AUTHORIZED', 'PAID', 'FAILED', 'MANUAL_REVIEW'],
  AUTHORIZED: ['PAID', 'FAILED', 'MANUAL_REVIEW'],
  MANUAL_REVIEW: ['PAID', 'FAILED', 'PENDING'],
  PAID: ['REFUND_PENDING'],
  REFUND_PENDING: ['REFUNDED', 'PAID'],
  FAILED: [],
  REFUNDED: [],
};

export function canTransition(from: DonationStatus, to: DonationStatus): boolean {
  return from === to || ALLOWED[from].includes(to);
}

export async function transitionDonation(
  tx: Prisma.TransactionClient,
  intentId: string,
  to: DonationStatus,
  source: PaidSource | 'donor_report' | 'gateway_status' | 'owner_review',
): Promise<{ from: DonationStatus; to: DonationStatus }> {
  // A donor's own report (UTR, screenshot, "I paid") can never make anything PAID.
  if (to === 'PAID' && source !== 'gateway_verified' && source !== 'owner_bank_evidence') {
    throw new AppError('FORBIDDEN');
  }
  const intent = await tx.donationIntent.findUnique({ where: { id: intentId } });
  if (!intent) throw new AppError('NOT_FOUND');
  if (!canTransition(intent.status, to)) throw new AppError('CONFLICT');
  if (intent.status !== to) {
    // Conditional update: a concurrent change makes this a no-op, detected below.
    const result = await tx.donationIntent.updateMany({
      where: { id: intentId, status: intent.status },
      // The first verified PAID stamps paid_at (#31 totals); it is never cleared.
      data: { status: to, ...(to === 'PAID' && !intent.paidAt && { paidAt: new Date() }) },
    });
    if (result.count !== 1) throw new AppError('CONFLICT');
    // Append-only history for the owner's detail view (#31).
    await tx.donationStatusEvent.create({
      data: { donationIntentId: intentId, fromStatus: intent.status, toStatus: to, source },
    });
  }
  return { from: intent.status, to };
}
