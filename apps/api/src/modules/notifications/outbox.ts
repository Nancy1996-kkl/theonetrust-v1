import type { Prisma } from '../../generated/prisma/client.ts';

type Tx = Prisma.TransactionClient;

/**
 * Queues the "donation verified" emails IN the transaction that marked the donation PAID (#30),
 * so the queue and the ledger agree. Sending happens later in the worker, outside any payment
 * transaction: an email failure can never roll a payment back. Rows hold references only — the
 * worker looks details up when it sends. `skipDuplicates` (ON CONFLICT DO NOTHING) keeps retries
 * from queueing twice without aborting the transaction.
 *
 * The donor email is queued only when the donor gave an email address AND asked for an
 * acknowledgement ("email only if you add one", donate panel) AND one was issued.
 */
export async function enqueueDonationPaid(
  tx: Tx,
  intentId: string,
  receiptIssued: boolean,
): Promise<void> {
  const intent = await tx.donationIntent.findUniqueOrThrow({
    where: { id: intentId },
    select: { donorEmail: true, wantsReceipt: true, locale: true },
  });
  const entityRef = `donation_intent:${intentId}`;
  const rows: Prisma.NotificationOutboxCreateManyInput[] = [
    {
      eventType: 'donation.paid',
      entityRef,
      template: 'owner_donation_paid',
      locale: 'en',
      dedupeKey: `donation.paid:owner:${intentId}`,
    },
  ];
  if (receiptIssued && intent.wantsReceipt && intent.donorEmail) {
    rows.push({
      eventType: 'donation.paid',
      entityRef,
      template: 'donor_donation_paid',
      locale: intent.locale,
      dedupeKey: `donation.paid:donor:${intentId}`,
    });
  }
  await tx.notificationOutbox.createMany({ data: rows, skipDuplicates: true });
}
