import type { Prisma } from '../../generated/prisma/client.ts';
import { financialYear } from '../receipts/numbering.ts';

type Tx = Prisma.TransactionClient;

/**
 * Statutory certificate tracking (#35). A donation whose donor opted in for a tax deduction (#34)
 * gets a tracking row the moment it is verified PAID, in the same transaction: the trust must
 * report it in Form 113 for that financial year. The site never issues Form 114 itself; it only
 * records the evidence the owner enters after filing on the e-filing portal.
 */
export async function ensureTaxTracking(tx: Tx, intentId: string, paidAt: Date): Promise<void> {
  const intent = await tx.donationIntent.findUniqueOrThrow({
    where: { id: intentId },
    select: { wantsTaxCertificate: true, donorIdentity: { select: { id: true } } },
  });
  if (!intent.wantsTaxCertificate || !intent.donorIdentity) return;
  await tx.taxCertificateTracking.createMany({
    data: [{ donationIntentId: intentId, financialYear: financialYear(paidAt) }],
    skipDuplicates: true,
  });
}

const IST_OFFSET_MS = 330 * 60_000;

/** "2026-27" → [1 Apr 2026 00:00 IST, 1 Apr 2027 00:00 IST). */
export function financialYearRange(fy: string): { from: Date; to: Date } {
  const start = Number(fy.slice(0, 4));
  return {
    from: new Date(Date.parse(`${start}-04-01T00:00:00Z`) - IST_OFFSET_MS),
    to: new Date(Date.parse(`${start + 1}-04-01T00:00:00Z`) - IST_OFFSET_MS),
  };
}

/** Form 113 is due by 31 May after the financial year ends. */
export function form113Deadline(fy: string): string {
  return `${Number(fy.slice(0, 4)) + 1}-05-31`;
}

/** Days from today (IST) to the deadline (negative once passed). */
export function daysUntil(day: string, now: Date): number {
  const today = Date.parse(new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10));
  return Math.round((Date.parse(day) - today) / 86_400_000);
}

export const REMINDER_WINDOW_DAYS = 30;
